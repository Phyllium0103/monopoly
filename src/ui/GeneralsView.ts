import type { GameState, General, Lord } from '../game/types';
import { generalsOf } from '../game/GameState';
import { REALMS, REALM_EXP } from '../data/generals';
import { ELEMENT_CSS, ELEMENT_NAMES, equipRealm, techniqueSpeed } from '../data/items';
import { abolish, attack, breakthroughChance, craft, defense, equip, learn, maxHp, power } from '../systems/GeneralSystem';
import { nameOf } from '../systems/ItemSystem';
import { LORDS } from '../faction/Faction';
import type { Dialog } from './Dialog';

const STATUS: Record<General['status'], string> = { free: '隨行', garrison: '駐守', realm: '秘境中', dead: '隕落' };

/** 武將名冊：查看能力、裝備神器寶衣、學習功法、自廢修為 */
export class GeneralsView {
  private el: HTMLDivElement;
  private resolve: (() => void) | null = null;

  constructor(
    root: HTMLElement,
    private dialog: Dialog,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'drawer hidden';
    root.appendChild(this.el);
  }

  open(state: GameState, lord: Lord): Promise<void> {
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.el.classList.remove('hidden');
      this.render(state, lord);
    });
  }

  private close() {
    this.el.classList.add('hidden');
    this.resolve?.();
    this.resolve = null;
  }

  private render(state: GameState, lord: Lord) {
    const gens = generalsOf(state, lord.id);
    const cityName = (g: General) => (g.cityId ? state.cities[g.cityId].name : '');
    const turnsLeft = (g: General) => lord.expeditions.find((e) => e.generalIds.includes(g.id))?.turnsLeft ?? 0;

    const items = new Map<string, number>();
    for (const i of lord.items) items.set(nameOf(i), (items.get(nameOf(i)) ?? 0) + 1);
    const bag = [...items].map(([n, c]) => `<span class="chip">${n}${c > 1 ? ` ×${c}` : ''}</span>`).join('') || '<span class="muted">無</span>';
    const gear = lord.gear.map((e) => `<span class="chip">${e.name}</span>`).join('') || '<span class="muted">無</span>';
    const scrolls = lord.scrolls.map((t) => `<span class="chip" style="border-color:${ELEMENT_CSS[t.element]}">${t.name}</span>`).join('') || '<span class="muted">無</span>';

    this.el.innerHTML = `
      <div class="drawer-head">
        <h2 style="color:${LORDS[lord.id].css}">${LORDS[lord.id].name}・武將名冊</h2>
        <button class="btn close">關閉 ✕</button>
      </div>
      <div class="bag">
        <div><b>行囊</b>${bag}</div>
        <div><b>神器寶衣</b>${gear}</div>
        <div><b>功法秘笈</b>${scrolls}</div>
        <div><b>靈獸</b>${lord.beast ? `<span class="chip">${lord.beast.name}｜${lord.beast.desc}</span>` : '<span class="muted">無</span>'}</div>
      </div>
      <div class="general-grid"></div>`;
    (this.el.querySelector('.close') as HTMLButtonElement).onclick = () => this.close();

    const grid = this.el.querySelector('.general-grid')!;
    for (const g of gens) {
      const card = document.createElement('div');
      card.className = `general-card s-${g.status}`;
      const need = g.realm < REALM_EXP.length ? REALM_EXP[g.realm] : 0;
      const t = g.technique;
      const status = g.status === 'garrison' ? `駐守${cityName(g)}` : g.status === 'realm' ? `秘境中（${turnsLeft(g)} 回合）` : STATUS[g.status];
      card.innerHTML = `
        <div class="gc-head"><b>${g.name}</b><small>${LORDS[g.origin].kingdom}</small><span class="realm">${REALMS[g.realm]}</span><span class="st">${status}</span></div>
        <div class="bar exp" title="突破機率 ${Math.round(breakthroughChance(g) * 100)}%"><i style="width:${need ? Math.min(100, (g.exp / need) * 100) : 100}%"></i><span>修為 ${g.exp}${need ? ` / ${need}` : '（圓滿）'}・+${techniqueSpeed(t)}/回合・突破 ${Math.round(breakthroughChance(g) * 100)}%</span></div>
        <div class="bar hp"><i style="width:${(g.hp / maxHp(g)) * 100}%"></i><span>血量 ${g.hp} / ${maxHp(g)}</span></div>
        <div class="bar sta"><i style="width:${g.stamina}%"></i><span>體力 ${g.stamina} / 100</span></div>
        <div class="stats">
          <span>武力 <b>${attack(g)}</b></span><span>防禦 <b>${defense(g)}</b></span><span>戰力 <b>${power(g)}</b></span>
          <span>煉丹 <b>${craft(g, 'alchemy')}</b></span><span>煉器 <b>${craft(g, 'forging')}</b></span><span>畫符 <b>${craft(g, 'talisman')}</b></span><span>佈陣 <b>${craft(g, 'formation')}</b></span>
        </div>
        <div class="equip">
          <div>神器：${g.weapon ? `${g.weapon.name}（武 +${g.weapon.value}）` : '<span class="muted">無</span>'}</div>
          <div>寶衣：${g.armor ? `${g.armor.name}（防 +${g.armor.value}、血 +${g.armor.hp}）` : '<span class="muted">無</span>'}</div>
          <div>功法：${t ? `<span style="color:${ELEMENT_CSS[t.element]}">${t.name}【${ELEMENT_NAMES[t.element]}】</span> 難度${'★'.repeat(t.difficulty)}・技能「${t.skillName}」` : '<span class="muted">未修習</span>'}</div>
        </div>
        <div class="gc-actions"></div>`;
      const actions = card.querySelector('.gc-actions')!;
      const btn = (label: string, disabled: boolean, fn: () => void) => {
        const b = document.createElement('button');
        b.className = 'btn mini';
        b.textContent = label;
        b.disabled = disabled;
        b.onclick = fn;
        actions.appendChild(b);
      };
      const away = g.status === 'realm';
      for (const kind of ['weapon', 'armor'] as const) {
        const pool = lord.gear.filter((e) => e.kind === kind);
        btn(kind === 'weapon' ? '裝備神器' : '裝備寶衣', away || !pool.length, async () => {
          const e = await this.dialog.choose(
            `${g.name}・${kind === 'weapon' ? '裝備神器' : '裝備寶衣'}`,
            '',
            pool.map((x) => ({
              label: x.name,
              sub: kind === 'weapon' ? `武力 +${x.value}` : `防禦 +${x.value}、血量 +${x.hp}`,
              value: x,
              disabled: g.realm < equipRealm(x.tier),
              reason: `需達${REALMS[equipRealm(x.tier)]}`,
            })),
          );
          if (e) equip(lord, g, e);
          this.render(state, lord);
        });
      }
      btn('學習功法', away || !!t || !lord.scrolls.length, async () => {
        const s = await this.dialog.choose(
          `${g.name}・學習功法`,
          '每位武將只能修習一種功法，學會後不可更換，除非自廢修為。',
          lord.scrolls.map((x) => ({
            label: x.name,
            sub: `${ELEMENT_NAMES[x.element]}屬性｜能力 +${Math.round(x.power * 100)}%｜難度 ${'★'.repeat(x.difficulty)}｜每回合修為 +${techniqueSpeed(x)}`,
            value: x,
            color: ELEMENT_CSS[x.element],
          })),
        );
        if (s) learn(lord, g, s);
        this.render(state, lord);
      });
      btn('自廢修為', away || !t, async () => {
        const ok = await this.dialog.confirm('自廢修為', `${g.name}將散去「${t!.name}」，境界跌回凡人，修為歸零。\n此後可改修其他功法。確定嗎？`, '自廢', '取消', '⚠️');
        if (ok) abolish(g);
        this.render(state, lord);
      });
      grid.appendChild(card);
    }
  }
}
