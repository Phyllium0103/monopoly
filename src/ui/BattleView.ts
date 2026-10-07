import type { City, General, LordId } from '../game/types';
import { LORDS } from '../faction/Faction';
import { fxText, passiveOf } from '../data/passives';
import { REALMS } from '../data/generals';
import { generalInfo } from './GeneralInfo';
import { portraitUrl } from './Icons';
import { ELEMENT_CSS, ELEMENT_NAMES, STAT_NAMES } from '../data/items';
import { TRIBULATION_BOLTS, craft, type TribulationResult } from '../systems/GeneralSystem';
import { WOUNDED_HP, WOUNDED_REDUCE, type ContestResult, type Duel, type DuelEvent, type Fighter, type SiegeResult, type Side } from '../systems/BattleSystem';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 戰鬥畫面：擂台戰可操作；比試與攻城顯示結果 */
export class BattleView {
  private el: HTMLDivElement;

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'battle-backdrop hidden';
    root.appendChild(this.el);
  }

  private open(title: string): HTMLDivElement {
    this.el.classList.remove('hidden');
    this.el.innerHTML = `<div class="battle scroll-card"><h2>${title}</h2><div class="battle-body"></div></div>`;
    return this.el.querySelector('.battle-body') as HTMLDivElement;
  }

  get isOpen() { return !this.el.classList.contains('hidden'); }

  private close() {
    this.el.classList.add('hidden');
    this.el.innerHTML = '';
  }

  private fighterHtml(f: Fighter, active: boolean) {
    const t = f.general.technique;
    const hpPct = (f.hp / f.maxHp) * 100;
    const shieldPct = Math.min(100, (f.shield / f.maxHp) * 100);
    const tags = [
      f.poison ? `<span class="ftag poison">中毒 ${f.poison.turns}</span>` : '',
      f.frozen ? '<span class="ftag frozen">定身</span>' : '',
      f.shield ? `<span class="ftag shield">護盾 ${Math.round(f.shield)}</span>` : '',
      f.hp < f.maxHp * WOUNDED_HP ? `<span class="ftag wounded">瀕危・減傷 ${Math.round(WOUNDED_REDUCE * 100)}%</span>` : '',
    ].join('');
    return `
      <div class="fighter ${active ? 'active' : ''}" data-side="${f.side}" style="--fc:${LORDS[f.lord].css}">
        <div class="f-lord">${LORDS[f.lord].name}</div>
        <div class="f-name">${f.general.name}<small>${REALMS[f.general.realm]}</small></div>
        <div class="f-elem">${t ? `<span style="color:${ELEMENT_CSS[t.element]}">【${ELEMENT_NAMES[t.element]}】${t.skillName}</span>` : '<span class="muted">無功法</span>'}</div>
        <div class="bar hp big"><i style="width:${hpPct}%"></i><em style="width:${shieldPct}%"></em><span>${Math.round(f.hp)} / ${f.maxHp}</span></div>
        <div class="bar energy ${f.energy >= 100 ? 'full' : ''}"><i style="width:${f.energy}%"></i><span>能量 ${f.energy}%</span></div>
        <div class="f-stats">武 ${f.atk} · 防 ${f.def}${f.beast ? ` · 🐾${f.beast.name.split('・')[1]}` : ''}</div>
        <div class="f-passive" title="${fxText(passiveOf(f.general).fx)}">【${passiveOf(f.general).name}】${fxText(passiveOf(f.general).fx)}</div>
        <div class="f-tags">${tags}</div>
      </div>`;
  }

  private float(side: Side, text: string, cls: string) {
    const card = this.el.querySelector(`.fighter[data-side="${side}"]`);
    if (!card) return;
    const f = document.createElement('div');
    f.className = `float ${cls}`;
    f.textContent = text;
    card.appendChild(f);
    if (cls === 'dmg') card.classList.add('shake');
    setTimeout(() => {
      f.remove();
      card.classList.remove('shake');
    }, 900);
  }

  /** 擂台戰；playerSide 為玩家操作的一方。每回合雙方同時出手，回傳勝方或 'draw'（平手） */
  runDuel(duel: Duel, playerSide: Side, speed: () => number, useItem: (side: Side) => Promise<DuelEvent[] | null>, aiItem?: (side: Side) => DuelEvent[] | null, title='⚔️ 擂台戰'): Promise<Side | 'draw'> {
    return new Promise((resolve) => {
      const body = this.open(title);
      const logLines: string[] = [];
      let waiting: ((a: 'attack' | 'skill' | 'item') => void) | null = null;

      const render = () => {
        body.innerHTML = `
          <div class="arena">${this.fighterHtml(duel.a, false)}<div class="vs">VS</div>${this.fighterHtml(duel.b, false)}</div>
          <div class="battle-log">${logLines.slice(-7).map((l) => `<div>${l}</div>`).join('')}</div>
          <div class="battle-actions"></div>`;
        const actions = body.querySelector('.battle-actions')!;
        if (duel.over) return;
        const add = (label: string, a: 'attack' | 'skill' | 'item', cls: string, disabled = false) => {
          const b = document.createElement('button');
          b.className = `btn ${cls}`;
          b.innerHTML = label;
          b.disabled = disabled;
          b.onclick = () => waiting?.(a);
          actions.appendChild(b);
        };
        const me = duel.fighter(playerSide);
        const note = duel.first ? (duel.first === playerSide ? '你有先手，每回合先出手' : '對方有先手，每回合先出手') : '雙方同時出手';
        const hint = document.createElement('div');
        hint.className = 'muted duel-hint';
        hint.textContent = `第 ${duel.rounds + 1} 回合・${note}`;
        actions.appendChild(hint);
        add('🗡️ 攻擊', 'attack', 'primary');
        add(me.general.technique ? `✨ ${me.general.technique.skillName}` : '✨ 功法（未修習）', 'skill', 'danger', !duel.canSkill(playerSide));
        add('🎒 使用物品', 'item', 'free', me.itemsSealed);
      };

      const show = async (events: DuelEvent[]) => {
        for (const e of events) {
          logLines.push(e.text);
          render();
          if (e.target && e.damage) this.float(e.target, `${e.crit ? '暴擊 ' : ''}-${e.damage}`, e.kind === 'skill' || e.crit ? 'dmg crit' : 'dmg');
          if (e.target && e.heal) this.float(e.target, `+${e.heal}`, 'heal');
          await sleep(420 / speed());
        }
      };

      const loop = async () => {
        render();
        while (!duel.over) {
          const action = await new Promise<'attack' | 'skill' | 'item'>((r) => (waiting = r));
          waiting = null;
          let events: DuelEvent[] = [];
          if (action === 'item') {
            const ev = await useItem(playerSide);
            if (!ev) {
              render();
              continue;
            }
            events = duel.afterItem(ev);
          }
          if (!duel.over) {
            const foe: Side = playerSide === 'a' ? 'b' : 'a';
            const enemyItem = aiItem?.(foe);
            if (enemyItem) events = events.concat(duel.afterItem(enemyItem));
            const acts = { [playerSide]: action === 'item' ? 'none' : action, [foe]: enemyItem ? 'none' : duel.aiAction(foe) } as Record<Side, 'attack' | 'skill' | 'none'>;
            events = events.concat(duel.round(acts));
          }
          await show(events);
        }
        await show(duel.verdict());
        duel.finish();
        const win = duel.winner;
        logLines.push(duel.draw ? '<b>平手！</b>' : `<b>${duel.fighter(win!).general.name}勝出！</b>`);
        render();
        const actions = body.querySelector('.battle-actions')!;
        actions.innerHTML = `<div class="result ${duel.draw ? '' : win === playerSide ? 'win' : 'lose'}">${duel.draw ? '平手！' : win === playerSide ? '勝利！' : '落敗……'}</div>`;
        const ok = document.createElement('button');
        ok.className = 'btn primary';
        ok.textContent = '確定';
        ok.onclick = () => {
          this.close();
          resolve(duel.draw ? 'draw' : win!);
        };
        actions.appendChild(ok);
      };
      void loop();
    });
  }

  /** 技藝比試：能力值對決（之後換成小遊戲） */
  showContest(r: ContestResult, a: General, aLord: LordId, b: General, bLord: LordId, playerSide: Side | null): Promise<void> {
    return new Promise((resolve) => {
      const name = STAT_NAMES[r.stat];
      const body = this.open(`🔥 ${name}比試`);
      const max = Math.max(r.aScore, r.bScore, 1);
      const row = (g: General, lord: LordId, score: number, side: Side) => `
        <div class="contest-row ${r.winner === side ? 'winner' : ''}" style="--fc:${LORDS[lord].css}">
          <img class="cr-portrait" src="${portraitUrl(g)}" alt="" onerror="this.style.visibility='hidden'">
          <div class="cr-main">
            <div class="cr-name"><b>${g.name}</b><small>${LORDS[lord].name}・${REALMS[g.realm]}・${name} ${craft(g, r.stat)}</small></div>
            <div class="bar contest"><i data-w="${(score / max) * 100}" style="width:0%"></i><span>${score}</span></div>
          </div>
        </div>`;
      body.innerHTML = `
        <p class="dialog-text">雙方各派一名武將比拼${name}，能力值越高越有勝算。</p>
        ${row(a, aLord, r.aScore, 'a')}${row(b, bLord, r.bScore, 'b')}
        <div class="battle-actions"></div>`;
      requestAnimationFrame(() => body.querySelectorAll<HTMLElement>('.contest .bar i, .bar.contest i').forEach((i) => (i.style.width = `${i.dataset.w}%`)));
      setTimeout(() => {
        const actions = body.querySelector('.battle-actions')!;
        const winName = (r.winner === 'a' ? a : b).name;
        const cls = playerSide ? (r.winner === playerSide ? 'win' : 'lose') : '';
        actions.innerHTML = `<div class="result ${cls}">${winName}勝出！</div>`;
        const ok = document.createElement('button');
        ok.className = 'btn primary';
        ok.textContent = '確定';
        ok.onclick = () => {
          this.close();
          resolve();
        };
        actions.appendChild(ok);
      }, 1300);
    });
  }

  /** 渡劫：天雷一道道落下；startHp/startMax 為渡劫前的血量 */
  showTribulation(name: string, r: TribulationResult, startHp: number, startMax: number, speed: () => number): Promise<void> {
    return new Promise((resolve) => {
      const body = this.open(`⚡ 渡劫・${name}`);
      const cap = startMax;
      let hp = startHp;
      body.innerHTML = `
        <p class="dialog-text">${REALMS[r.fromRealm]} → ${REALMS[r.fromRealm + 1]}・天降 ${TRIBULATION_BOLTS[r.fromRealm - 2]} 道天雷</p>
        <div class="tribulation">
          <div class="sky"></div>
          <div class="fighter trib" data-side="a" style="--fc:#7fb2ff">
            <div class="f-name">${name}<small>${REALMS[r.fromRealm]}</small></div>
            <div class="bar hp big"><i style="width:100%"></i><span>${hp} / ${cap}</span></div>
            <div class="bolts"></div>
          </div>
        </div>
        <div class="battle-actions"><span class="muted">天劫降臨……</span></div>`;
      const bar = body.querySelector('.bar i') as HTMLElement;
      const label = body.querySelector('.bar span') as HTMLElement;
      const boltsEl = body.querySelector('.bolts') as HTMLElement;
      const sky = body.querySelector('.sky') as HTMLElement;
      void (async () => {
        await sleep(500 / speed());
        for (let i = 0; i < r.bolts.length; i++) {
          sky.classList.remove('flash');
          void sky.offsetWidth;
          sky.classList.add('flash');
          hp = Math.max(0, hp - r.bolts[i]);
          bar.style.width = `${(hp / cap) * 100}%`;
          label.textContent = `${hp} / ${cap}`;
          boltsEl.innerHTML += `<span>⚡${r.bolts[i]}</span>`;
          this.float('a', `-${r.bolts[i]}`, 'dmg crit');
          await sleep(650 / speed());
        }
        if (r.fate === 'saved') { bar.style.width = '100%'; label.textContent = cap + ' / ' + cap; }
        const actions = body.querySelector('.battle-actions')!;
        const text = r.success ? `渡劫成功！晉入【${REALMS[r.fromRealm + 1]}】` : r.fate === 'death' ? '身死道消……' : r.fate === 'saved' ? '保命效果生效，滿血復生，境界保留' : '兵解重修，跌回凡人';
        actions.innerHTML = `<div class="result ${r.success ? 'win' : 'lose'}">${text}</div>`;
        const ok = document.createElement('button');
        ok.className = 'btn primary';
        ok.textContent = '確定';
        ok.onclick = () => {
          this.close();
          resolve();
        };
        actions.appendChild(ok);
      })();
    });
  }

  showSiege(r: SiegeResult, attackers: General[], attackerLord: LordId, city: City, defenders: General[], playerIsAttacker: boolean): Promise<void> {
    return new Promise((resolve) => {
      const body = this.open(`🏯 攻城戰・${city.name}`);
      const win = r.win === playerIsAttacker;
      body.innerHTML = `
        <div class="siege">
          <div class="siege-side" style="--fc:${LORDS[attackerLord].css}">
            <h3>攻方・${LORDS[attackerLord].name}</h3>
            ${attackers.map((g) => `<div><b>${g.name}</b><br><small>${generalInfo(g)}</small></div>`).join('')}
            <div class="siege-power">${r.attack}</div>
            <small>士兵損失 ${r.attackerLoss}</small>
          </div>
          <div class="vs">VS</div>
          <div class="siege-side" style="--fc:${city.owner === 'neutral' ? '#999' : LORDS[city.owner].css}">
            <h3>守方・${city.name}</h3>
            ${defenders.length ? defenders.map((d) => `<div><b>${d.name}</b><br><small>${generalInfo(d)}</small></div>`).join('') : '<div>無駐將</div>'}
            <div>城池駐軍加成 ×1.5${city.shieldTurns > 0 ? '・護城大陣 ×1.5' : ''}</div>
            <div class="siege-power">${r.defense}</div>
            <small>守軍損失 ${r.defenderLoss}</small>
          </div>
        </div>
        <div class="battle-actions"><div class="result ${win ? 'win' : 'lose'}">${r.win ? '城池攻破！' : '攻城失敗'}</div></div>`;
      const ok = document.createElement('button');
      ok.className = 'btn primary';
      ok.textContent = '確定';
      ok.onclick = () => {
        this.close();
        resolve();
      };
      body.querySelector('.battle-actions')!.appendChild(ok);
    });
  }
}
