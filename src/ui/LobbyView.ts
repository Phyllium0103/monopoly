import type { LordId } from '../game/types';
import { LORDS, LORD_IDS } from '../faction/Faction';
import { DEFAULT_ROUNDS, ROUND_OPTIONS } from '../game/GameState';
import { isOnline, type Member, type Room } from '../net/RoomService';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const roundsLabel = (r: number | null) => (r === null ? '♾️ 無盡模式' : `${r} 輪`);

export interface LobbyHandlers {
  setReady(ready: boolean): void;
  setLord(lord: LordId): void;
  setRounds(rounds: number | null): void;
  addAi(): void;
  removeAi(memberId: string): void;
  start(): void;
  leave(): void;
}

/**
 * 多人模式的畫面：選單、加入房間、等待大廳，以及遊戲中的連線狀態列。
 * 沿用開始畫面的標題與風格；所有按鈕在處理中會停用，錯誤訊息顯示在畫面下方。
 */
export class LobbyView {
  private el: HTMLDivElement;
  private bar: HTMLDivElement;
  private busy = false;

  constructor(private root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'screen start-screen lobby-screen hidden';
    root.appendChild(this.el);
    this.bar = document.createElement('div');
    this.bar.className = 'net-bar hidden';
    root.appendChild(this.bar);
  }

  hide() {
    this.el.classList.add('hidden');
    this.el.innerHTML = '';
  }

  private show(inner: string) {
    this.el.classList.remove('hidden');
    this.el.innerHTML = `
      <div class="title-block">
        <h1 class="long-title">丞相，這過路費比雷劫還狠！</h1>
        <p class="subtitle">多人連線・擲骰爭天下</p>
      </div>
      <div class="lobby-card scroll-card">${inner}<p class="lobby-msg" role="status"></p></div>`;
  }

  /** 下方提示：錯誤（紅字）或一般訊息 */
  message(text: string, error = false) {
    const m = this.el.querySelector('.lobby-msg') as HTMLElement | null;
    if (!m) return;
    m.textContent = text;
    m.classList.toggle('error', error);
  }

  /** 處理中：停用所有按鈕 */
  setBusy(busy: boolean, text = '') {
    this.busy = busy;
    this.el.querySelectorAll<HTMLButtonElement>('button, input, select').forEach((b) => {
      if (busy) b.dataset.wasDisabled = String(b.disabled);
      b.disabled = busy || b.dataset.wasDisabled === 'true';
      if (!busy) delete b.dataset.wasDisabled;
    });
    if (busy && text) this.message(text);
  }

  get isBusy() {
    return this.busy;
  }

  /** 多人選單：輸入暱稱，建立或加入房間 */
  showMenu(nickname: string, handlers: { create(nickname: string, rounds: number | null): void; join(): void; back(): void }) {
    let rounds: number | null = DEFAULT_ROUNDS;
    this.show(`
      <h2>⚔️ 多人遊戲</h2>
      <label class="lobby-field">暱稱<input class="nick" maxlength="16" value="${esc(nickname)}" placeholder="輸入你的名號"></label>
      <div class="lobby-field">回合數<div class="mode-options rounds"></div></div>
      <div class="lobby-actions">
        <button class="btn primary big create">建立房間</button>
        <button class="btn big join">加入房間</button>
      </div>
      <button class="btn back">← 返回首頁</button>`);
    const box = this.el.querySelector('.rounds') as HTMLElement;
    const renderRounds = () => {
      box.innerHTML = '';
      for (const r of [...ROUND_OPTIONS, null] as (number | null)[]) {
        const b = document.createElement('button');
        b.className = `btn mini ${rounds === r ? 'on' : ''}`;
        b.textContent = roundsLabel(r);
        b.onclick = () => { rounds = r; renderRounds(); };
        box.appendChild(b);
      }
    };
    renderRounds();
    const nick = () => (this.el.querySelector('.nick') as HTMLInputElement).value.trim();
    (this.el.querySelector('.create') as HTMLButtonElement).onclick = () => {
      if (!nick()) return this.message('請先輸入暱稱', true);
      handlers.create(nick(), rounds);
    };
    (this.el.querySelector('.join') as HTMLButtonElement).onclick = () => {
      if (!nick()) return this.message('請先輸入暱稱', true);
      handlers.join();
    };
    (this.el.querySelector('.back') as HTMLButtonElement).onclick = handlers.back;
  }

  nickname(): string {
    return (this.el.querySelector('.nick') as HTMLInputElement | null)?.value.trim() ?? '';
  }

  /** 加入房間：輸入 5 位數房號 */
  showJoin(handlers: { join(code: string): void; back(): void }) {
    this.show(`
      <h2>🔑 加入房間</h2>
      <label class="lobby-field">房號<input class="code" inputmode="numeric" pattern="[0-9]*" maxlength="5" placeholder="5 位數字"></label>
      <div class="lobby-actions">
        <button class="btn primary big go">加入</button>
        <button class="btn back">← 返回</button>
      </div>`);
    const input = this.el.querySelector('.code') as HTMLInputElement;
    input.oninput = () => (input.value = input.value.replace(/\D/g, '').slice(0, 5));
    const go = () => {
      if (!/^\d{5}$/.test(input.value)) return this.message('房號是 5 位數字', true);
      handlers.join(input.value);
    };
    input.onkeydown = (e) => { if (e.key === 'Enter') go(); };
    (this.el.querySelector('.go') as HTMLButtonElement).onclick = go;
    (this.el.querySelector('.back') as HTMLButtonElement).onclick = handlers.back;
    input.focus();
  }

  /** 等待大廳 */
  showLobby(room: Room, members: Member[], me: string, online: boolean, h: LobbyHandlers) {
    const mine = members.find((m) => m.user_id === me);
    const isHost = room.host_id === me;
    const humans = members.filter((m) => m.kind === 'human');
    const allReady = humans.every((m) => m.ready);
    const full = members.length >= room.max_players;
    const taken = new Set(members.map((m) => m.lord_id));
    const rows = members.map((m) => {
      const lord = LORDS[m.lord_id];
      const self = m.user_id === me;
      const status = m.kind === 'ai' ? '<span class="lb-ready on">電腦已準備</span>' : m.ready ? '<span class="lb-ready on">✔ 已準備</span>' : '<span class="lb-ready">未準備</span>';
      const lordCell = self && !mine?.ready
        ? `<select class="lord-pick">${LORD_IDS.map((id) => `<option value="${id}" ${id === m.lord_id ? 'selected' : ''} ${taken.has(id) && id !== m.lord_id ? 'disabled' : ''}>${LORDS[id].kingdom}・${LORDS[id].name}</option>`).join('')}</select>`
        : `<b style="color:${lord.css}">${lord.kingdom}・${lord.name}</b>`;
      return `<div class="lb-row ${self ? 'me' : ''}" style="--fc:${lord.css}">
        <span class="lb-dot ${isOnline(m) ? 'on' : ''}" title="${isOnline(m) ? '在線上' : '離線'}"></span>
        <span class="lb-lord">${lordCell}</span>
        <span class="lb-name">${esc(m.nickname)}${self ? '（你）' : ''}</span>
        <span class="lb-tags">${m.kind === 'ai' ? '<span class="tag ai">電腦</span>' : '<span class="tag human">真人</span>'}${m.is_host ? '<span class="tag host">房主</span>' : ''}</span>
        ${status}
        ${isHost && m.kind === 'ai' ? `<button class="btn mini remove-ai" data-id="${m.id}">移除</button>` : '<span></span>'}
      </div>`;
    }).join('');
    const empty = Math.max(0, room.max_players - members.length);
    this.show(`
      <h2>🏯 等待大廳</h2>
      <div class="lb-code"><span>房號</span><b>${room.code}</b><button class="btn mini copy">📋 複製房號</button></div>
      <div class="lb-info"><span class="net ${online ? 'on' : ''}">${online ? '🟢 已連線' : '🔴 連線中斷，重新連線中……'}</span>
        <span>回合數：${isHost ? `<select class="rounds-pick">${[...ROUND_OPTIONS, null].map((r) => `<option value="${r ?? ''}" ${room.max_rounds === r ? 'selected' : ''}>${roundsLabel(r)}</option>`).join('')}</select>` : roundsLabel(room.max_rounds)}</span>
        <span>玩家 ${members.length}/${room.max_players}</span></div>
      <div class="lb-list">${rows}${Array.from({ length: empty }, () => '<div class="lb-row empty"><span class="lb-dot"></span><span class="muted">空位・等待玩家加入</span></div>').join('')}</div>
      <p class="muted lb-note">所有真人玩家（含房主）都準備後，房主才能開始。沒有人入座的陣營不參與本局。</p>
      <div class="lobby-actions">
        <button class="btn ${mine?.ready ? '' : 'primary'} ready">${mine?.ready ? '取消準備' : '準備'}</button>
        ${isHost ? `<button class="btn add-ai" ${full ? 'disabled' : ''}>🤖 加入電腦</button>` : ''}
        ${isHost ? `<button class="btn primary big start" ${!allReady || members.length < 2 ? 'disabled' : ''} title="${!allReady ? '還有玩家尚未準備' : members.length < 2 ? '至少需要兩位玩家' : ''}">開始遊戲</button>` : ''}
        <button class="btn leave">離開房間</button>
      </div>
      ${isHost ? '' : '<p class="muted">等待房主開始遊戲……</p>'}`);
    const q = <T extends HTMLElement>(s: string) => this.el.querySelector(s) as T | null;
    q<HTMLButtonElement>('.copy')!.onclick = () => {
      const done = () => this.message(`已複製房號 ${room.code}`);
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(room.code).then(done, () => this.message(`房號：${room.code}`));
      else this.message(`房號：${room.code}`);
    };
    q<HTMLButtonElement>('.ready')!.onclick = () => h.setReady(!mine?.ready);
    const lordPick = q<HTMLSelectElement>('.lord-pick');
    if (lordPick) lordPick.onchange = () => h.setLord(lordPick.value as LordId);
    const roundsPick = q<HTMLSelectElement>('.rounds-pick');
    if (roundsPick) roundsPick.onchange = () => h.setRounds(roundsPick.value ? Number(roundsPick.value) : null);
    const addAi = q<HTMLButtonElement>('.add-ai');
    if (addAi) addAi.onclick = h.addAi;
    const start = q<HTMLButtonElement>('.start');
    if (start) start.onclick = h.start;
    q<HTMLButtonElement>('.leave')!.onclick = h.leave;
    this.el.querySelectorAll<HTMLButtonElement>('.remove-ai').forEach((b) => (b.onclick = () => h.removeAi(b.dataset.id!)));
  }

  // ───────────────────────── 遊戲中的狀態列 ─────────────────────────

  /** 遊戲中：房號、連線狀態、等待誰，以及代打／接手／離開按鈕 */
  showBar(info: {
    code: string;
    online: boolean;
    text: string;
    takeover?: { label: string; onClick: () => void };
    reclaim?: () => void;
    leave: () => void;
  }) {
    this.bar.classList.remove('hidden');
    this.bar.innerHTML = `
      <span class="nb-code">房號 <b>${info.code}</b></span>
      <span class="nb-net ${info.online ? 'on' : ''}">${info.online ? '🟢' : '🔴 重新連線中'}</span>
      <span class="nb-text">${esc(info.text)}</span>
      ${info.takeover ? `<button class="btn mini nb-takeover">${esc(info.takeover.label)}</button>` : ''}
      ${info.reclaim ? '<button class="btn mini primary nb-reclaim">接手操作</button>' : ''}
      <button class="btn mini nb-leave">離開</button>`;
    const t = this.bar.querySelector('.nb-takeover') as HTMLButtonElement | null;
    if (t && info.takeover) t.onclick = info.takeover.onClick;
    const r = this.bar.querySelector('.nb-reclaim') as HTMLButtonElement | null;
    if (r && info.reclaim) r.onclick = info.reclaim;
    (this.bar.querySelector('.nb-leave') as HTMLButtonElement).onclick = info.leave;
  }

  hideBar() {
    this.bar.classList.add('hidden');
    this.bar.innerHTML = '';
  }

  get rootEl() {
    return this.root;
  }
}
