import type { RealtimeChannel } from '@supabase/supabase-js';
import type { LordId } from '../game/types';
import type { Game } from '../game/Game';
import { LORDS } from '../faction/Faction';
import { LobbyView } from '../ui/LobbyView';
import { RoomError, RoomService, isOnline, type EventRow, type GamePublic, type Member, type Room } from './RoomService';

const ROOM_KEY = 'xiantu-room';
const NICK_KEY = 'xiantu-nickname';
const HEARTBEAT_MS = 15_000;

const load = <T>(key: string): T | null => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};
const save = (key: string, value: unknown) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch { /* 私密模式等無法儲存時略過 */ }
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const newOpId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`.replace(/\D/g, '').padEnd(32, '0').replace(/^(.{8})(.{4})(.{4})(.{4})(.{12}).*/, '$1-$2-4$3-8$4-$5').slice(0, 36));

/**
 * 多人模式流程：選單 → 等待大廳 → 對局。
 * 對局中所有變化都來自權威端：收到事件就依序播放，再讀取最新完整狀態；
 * 輪到自己時顯示抉擇，回答附上操作 ID 送回（網路重試不會重複執行）。
 */
export class OnlineSession {
  private svc: RoomService | null = null;
  private lobby: LobbyView;
  private phase: 'menu' | 'lobby' | 'game' = 'menu';
  private roomId: string | null = null;
  private code = '';
  private room: Room | null = null;
  private members: Member[] = [];
  private roomChannel: RealtimeChannel | null = null;
  private gameChannel: RealtimeChannel | null = null;
  private heartbeat: number | null = null;
  private poller: number | null = null;
  private online = false;
  private refreshTimer: number | null = null;
  // 對局同步
  private version = 0;
  private queue: Promise<void> = Promise.resolve();
  private pub: GamePublic | null = null;
  private promptSeq: string | null = null;
  private endShown = false;
  private continuing = false;

  constructor(root: HTMLElement, private game: Game, private onExit: () => void) {
    this.lobby = new LobbyView(root);
    window.addEventListener('online', () => this.catchUp());
  }

  /** 上次所在的房間（重新整理後可自動回到房間） */
  static hasSavedRoom() {
    return !!load<{ roomId: string; code: string }>(ROOM_KEY);
  }

  private get me(): Member | undefined {
    return this.members.find((m) => m.user_id === this.svc?.userId);
  }

  /** 進入多人模式：先匿名登入；若有上次的房間就嘗試回去 */
  async open() {
    this.lobby.hideBar();
    this.lobby.showMenu(load<string>(NICK_KEY) ?? '', this.menuHandlers());
    this.lobby.setBusy(true, '連線中……');
    try {
      this.svc ??= new RoomService();
      await this.svc.signIn();
    } catch (e) {
      this.lobby.setBusy(false);
      this.lobby.message((e as Error).message, true);
      return;
    }
    this.lobby.setBusy(false);
    this.lobby.message('');
    const saved = load<{ roomId: string; code: string }>(ROOM_KEY);
    if (saved) await this.rejoin(saved.code);
  }

  private menuHandlers() {
    return {
      create: (nickname: string, rounds: number | null) => void this.run('建立房間中……', async () => {
        save(NICK_KEY, nickname);
        const r = await this.svc!.createRoom(nickname, rounds);
        await this.enterRoom(r.room_id, r.code);
      }),
      join: () => {
        save(NICK_KEY, this.lobby.nickname());
        this.lobby.showJoin({ join: (code) => void this.rejoin(code), back: () => void this.open() });
      },
      back: () => this.exit(),
    };
  }

  /** 以房號加入（也用於重新整理後回到原房間） */
  private async rejoin(code: string) {
    await this.run('加入房間中……', async () => {
      const nickname = load<string>(NICK_KEY) ?? '無名修士';
      try {
        const r = await this.svc!.joinRoom(code, nickname);
        await this.enterRoom(r.room_id, r.code);
      } catch (e) {
        // 房間已不存在：清掉記錄，回到選單
        if (e instanceof RoomError && ['ROOM_NOT_FOUND', 'ROOM_STARTED', 'ROOM_CLOSED'].includes(e.code)) save(ROOM_KEY, null);
        throw e;
      }
    });
  }

  /** 執行一個操作：期間停用按鈕，失敗時在畫面上顯示原因 */
  private async run(label: string, fn: () => Promise<void>) {
    if (this.lobby.isBusy) return;
    this.lobby.setBusy(true, label);
    try {
      await fn();
      this.lobby.message('');
    } catch (e) {
      this.lobby.message((e as Error).message, true);
    } finally {
      this.lobby.setBusy(false);
    }
  }

  private async enterRoom(roomId: string, code: string) {
    this.roomId = roomId;
    this.code = code;
    save(ROOM_KEY, { roomId, code });
    this.svc!.unwatch(this.roomChannel);
    this.roomChannel = this.svc!.watchRoom(roomId, () => this.scheduleRefresh(), (online) => {
      const was = this.online;
      this.online = online;
      if (online && !was) this.scheduleRefresh();
      this.render();
    });
    this.startHeartbeat();
    this.phase = 'lobby';
    await this.refreshRoom();
  }

  private startHeartbeat() {
    if (this.heartbeat) clearInterval(this.heartbeat);
    const beat = () => {
      if (this.roomId) void this.svc?.heartbeat(this.roomId).catch(() => {});
    };
    beat();
    this.heartbeat = window.setInterval(beat, HEARTBEAT_MS);
    // 即時連線中斷時，定期補抓資料
    if (this.poller) clearInterval(this.poller);
    this.poller = window.setInterval(() => {
      if (this.online) return;
      this.scheduleRefresh();
      if (this.phase === 'game') this.catchUp();
    }, 8000);
  }

  private scheduleRefresh() {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => void this.refreshRoom().catch((e) => this.lobby.message((e as Error).message, true)), 250);
  }

  private async refreshRoom() {
    if (!this.roomId || !this.svc) return;
    const { room, members } = await this.svc.fetchRoom(this.roomId);
    this.room = room;
    this.members = members;
    if (!this.me) {
      this.leaveLocal('你已不在這個房間');
      return;
    }
    if (room.status === 'closed' && !(this.phase === 'game' && this.pub?.over)) {
      this.leaveLocal('房間已關閉');
      return;
    }
    if (room.status === 'playing' && this.phase !== 'game') {
      await this.enterGame();
      return;
    }
    this.render();
  }

  private render() {
    if (this.phase === 'lobby' && this.room) {
      this.lobby.showLobby(this.room, this.members, this.svc!.userId, this.online, {
        setReady: (ready) => void this.run('', () => this.svc!.setReady(this.roomId!, ready)),
        setLord: (lord) => void this.run('', () => this.svc!.setLord(this.roomId!, lord)),
        setRounds: (rounds) => void this.run('', () => this.svc!.setRounds(this.roomId!, rounds)),
        addAi: () => void this.run('', () => this.svc!.addAi(this.roomId!)),
        removeAi: (id) => void this.run('', () => this.svc!.removeAi(this.roomId!, id)),
        start: () => void this.run('開始遊戲中……', async () => {
          await this.svc!.game('start', this.roomId!);
          await this.refreshRoom();
        }),
        leave: () => void this.run('離開中……', async () => {
          await this.svc!.leaveRoom(this.roomId!);
          this.leaveLocal('');
          void this.open();
        }),
      });
    } else if (this.phase === 'game') this.updateBar();
  }

  /** 結束本機的房間連線（不呼叫伺服器） */
  private leaveLocal(message: string) {
    this.svc?.unwatch(this.roomChannel);
    this.svc?.unwatch(this.gameChannel);
    this.roomChannel = this.gameChannel = null;
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (this.poller) clearInterval(this.poller);
    this.heartbeat = this.poller = null;
    const wasGame = this.phase === 'game';
    this.roomId = null;
    this.room = null;
    this.members = [];
    this.pub = null;
    this.version = 0;
    this.promptSeq = null;
    this.phase = 'menu';
    save(ROOM_KEY, null);
    this.lobby.hideBar();
    if (wasGame) this.game.cancelPrompt();
    if (message) {
      this.lobby.showMenu(load<string>(NICK_KEY) ?? '', this.menuHandlers());
      this.lobby.message(message, true);
    }
  }

  private exit() {
    this.lobby.hide();
    this.lobby.hideBar();
    this.onExit();
  }

  // ───────────────────────── 對局 ─────────────────────────

  private async enterGame() {
    if (!this.roomId || !this.svc) return;
    this.phase = 'game';
    this.lobby.hide();
    this.endShown = false;
    const roomId = this.roomId;
    this.svc.unwatch(this.gameChannel);
    this.gameChannel = this.svc.watchGame(roomId, (row) => this.enqueue(row), (online) => {
      const was = this.online;
      this.online = online;
      if (online && !was) this.catchUp();
      this.updateBar();
    });
    // 房主剛按開始時，遊戲資料可能還在建立中
    let pub: GamePublic | null = null;
    for (let i = 0; i < 30 && !pub; i++) {
      pub = await this.svc.fetchGame(roomId).catch(() => null);
      if (!pub) await sleep(1000);
    }
    if (!pub || this.roomId !== roomId) {
      if (this.roomId === roomId) this.leaveLocal('無法讀取對局資料，請稍後重新加入');
      return;
    }
    this.game.startOnline(pub.state, this.me!.lord_id, () => {
      // 結算畫面按「返回大廳」
      this.leaveLocal('');
      this.exit();
    });
    this.version = pub.version;
    this.handlePublic(pub);
  }

  private enqueue(row: EventRow) {
    this.queue = this.queue.then(() => this.applyRow(row)).catch((e) => console.error(e));
  }

  /** 補抓錯過的事件與最新狀態（重新連線、送出回答後） */
  catchUp() {
    if (this.phase !== 'game' || !this.roomId) return;
    this.queue = this.queue.then(async () => {
      const rows = await this.svc!.fetchEvents(this.roomId!, this.version);
      for (const row of rows) await this.applyRow(row, false);
      await this.syncPublic();
    }).catch((e) => console.error(e));
  }

  private async applyRow(row: EventRow, sync = true) {
    if (row.version <= this.version || !this.roomId) return;
    if (row.version > this.version + 1) {
      // 中間漏掉的版本先補上
      const missing = await this.svc!.fetchEvents(this.roomId, this.version);
      for (const r of missing) if (r.version < row.version) await this.playRow(r);
    }
    await this.playRow(row);
    if (sync) await this.syncPublic();
  }

  private async playRow(row: EventRow) {
    if (row.version <= this.version) return;
    // 事件裡用到的武將可能是新招募的：先換上最新狀態（棋子不動），再播放動畫
    const pub = await this.svc!.fetchGame(this.roomId!).catch(() => null);
    if (pub) this.game.syncOnlineState(pub.state, false);
    await this.game.playEvents(row.events);
    this.version = row.version;
    if (row.events.some((e) => e.t === 'gameOver')) this.endShown = true;
  }

  private async syncPublic() {
    const pub = await this.svc!.fetchGame(this.roomId!).catch(() => null);
    if (pub && pub.version >= this.version) {
      this.version = pub.version;
      this.handlePublic(pub);
    }
  }

  private handlePublic(pub: GamePublic) {
    this.pub = pub;
    this.game.syncOnlineState(pub.state);
    const me = this.me;
    const myLord = me?.lord_id;
    if (pub.over) {
      this.game.setWaiting('對局已結束');
      if (!this.endShown) {
        this.endShown = true;
        void this.game.view.gameOver('對局已結束');
      }
    } else if (pub.pending && pub.pending.lord === myLord && !me?.ai_control) {
      this.game.setWaiting(null);
      if (this.promptSeq !== pub.pending.seq) void this.ask(pub.pending);
    } else {
      if (this.promptSeq && this.promptSeq !== pub.pending?.seq) {
        // 原本在等自己回答，但已由其他方式結束（例如交由電腦代打）
        this.promptSeq = null;
        this.game.cancelPrompt();
      }
      this.game.setWaiting(this.waitingText());
      if (pub.paused && !pub.pending) void this.continueGame();
    }
    this.updateBar();
  }

  private waitingText(): string {
    const p = this.pub?.pending;
    if (!p) return this.pub?.paused ? '電腦行動中……' : '同步中……';
    const m = this.members.find((x) => x.lord_id === p.lord);
    const name = m ? `${m.nickname}（${LORDS[p.lord].name}）` : LORDS[p.lord].name;
    return `等待 ${name} 行動……${m && !isOnline(m) ? '（離線）' : ''}`;
  }

  /** 全是電腦在行動時，權威端每次只推進一段；由房主（或房主離線時任何人）請它繼續 */
  private async continueGame() {
    if (this.continuing || !this.roomId) return;
    const host = this.members.find((m) => m.is_host);
    const iAmHost = host?.user_id === this.svc?.userId;
    if (!iAmHost && host && isOnline(host)) return;
    this.continuing = true;
    try {
      if (!iAmHost) await sleep(1500);
      await this.svc!.game('continue', this.roomId).catch(() => {});
      this.catchUp();
    } finally {
      this.continuing = false;
    }
  }

  /** 顯示輪到自己的抉擇，回答後送回權威端 */
  private async ask(pending: NonNullable<GamePublic['pending']>) {
    this.promptSeq = pending.seq;
    const value = await this.game.answerRemote(pending.lord, pending.prompt);
    if (this.promptSeq !== pending.seq || !this.roomId) return;
    const opId = newOpId();
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        await this.svc!.game('answer', this.roomId, { seq: pending.seq, answer: value ?? null, opId });
        break;
      } catch (e) {
        const code = e instanceof RoomError ? e.code : '';
        if (['STALE_ANSWER', 'VERSION_CONFLICT', 'AI_CONTROLLED', 'NOT_MEMBER'].includes(code)) break;
        // 網路問題：同一個操作 ID 重送，伺服器不會重複執行
        await sleep(800 * (attempt + 1));
      }
    }
    // 不論成功與否都重新同步；若仍輪到自己，會重新顯示同一個抉擇
    if (this.promptSeq === pending.seq) this.promptSeq = null;
    this.catchUp();
  }

  private updateBar() {
    if (this.phase !== 'game') return;
    const me = this.me;
    const p = this.pub?.pending;
    const waitingFor = p ? this.members.find((m) => m.lord_id === p.lord) : undefined;
    const iAmHost = this.room?.host_id === this.svc?.userId;
    const canTakeover = iAmHost && waitingFor && waitingFor.kind === 'human' && !waitingFor.ai_control && waitingFor.user_id !== me?.user_id && !isOnline(waitingFor);
    this.lobby.showBar({
      code: this.code,
      online: this.online,
      text: this.pub?.over ? '對局已結束' : me?.ai_control ? '你目前由電腦代打' : p && p.lord === me?.lord_id ? '輪到你了' : this.waitingText(),
      takeover: canTakeover ? { label: `將${waitingFor!.nickname}交由電腦代打`, onClick: () => void this.takeover(waitingFor!.lord_id) } : undefined,
      reclaim: me?.ai_control && !this.pub?.over ? () => void this.reclaim() : undefined,
      leave: () => this.leaveGame(),
    });
  }

  private async takeover(lord: LordId) {
    try {
      await this.svc!.game('takeover', this.roomId!, { lord });
      await this.refreshRoom();
      this.catchUp();
    } catch (e) {
      this.game.setWaiting((e as Error).message);
    }
  }

  private async reclaim() {
    try {
      await this.svc!.game('reclaim', this.roomId!);
      await this.refreshRoom();
      this.catchUp();
    } catch (e) {
      this.game.setWaiting((e as Error).message);
    }
  }

  private leaveGame() {
    const over = this.pub?.over;
    if (!over && !window.confirm('離開對局？你的座位會保留，用同一個瀏覽器輸入房號即可回來；離線期間房主可將你交由電腦代打。')) return;
    const roomId = this.roomId;
    if (roomId) void this.svc?.leaveRoom(roomId).catch(() => {});
    this.leaveLocal('');
    this.exit();
  }
}
