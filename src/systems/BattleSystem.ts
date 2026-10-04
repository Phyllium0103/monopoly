import type { Beast, City, CraftStat, Element, GameState, General, Lord, LordId } from '../game/types';
import { attack, craft, defense, maxHp, power } from './GeneralSystem';
import { beastPower, elementMod } from '../data/items';
import { beastSiegeBonus, garrisonPower } from './CitySystem';

export type Side = 'a' | 'b';
export type BattleKind = 'duel' | 'siege' | CraftStat;

export const BATTLE_NAMES: Record<BattleKind, string> = {
  duel: '擂台戰',
  siege: '攻城戰',
  alchemy: '煉丹比試',
  forging: '煉器比試',
  talisman: '畫符比試',
  formation: '佈陣比試',
};

export interface Fighter {
  side: Side;
  lord: LordId;
  general: General;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  element: Element | null;
  energy: number;
  shield: number;
  poison: { dmg: number; turns: number } | null;
  frozen: number;
  beast: Beast | null;
}

export interface DuelEvent {
  text: string;
  target?: Side;
  damage?: number;
  heal?: number;
  kind?: 'hit' | 'skill' | 'beast' | 'item' | 'info';
}

const MAX_ACTIONS = 60;

/** 擂台戰：回合制單挑，能量滿可施放功法技能 */
export class Duel {
  a: Fighter;
  b: Fighter;
  turn: Side = 'a';
  actions = 0;
  winner: Side | null = null;

  constructor(aLord: Lord, aGen: General, bLord: Lord, bGen: General) {
    this.a = this.makeFighter('a', aLord, aGen);
    this.b = this.makeFighter('b', bLord, bGen);
  }

  private makeFighter(side: Side, lord: Lord, g: General): Fighter {
    const f: Fighter = {
      side,
      lord: lord.id,
      general: g,
      hp: Math.max(1, g.hp),
      maxHp: maxHp(g),
      atk: attack(g),
      def: defense(g),
      element: g.technique?.element ?? null,
      energy: 0,
      shield: 0,
      poison: null,
      frozen: 0,
      beast: lord.beast,
    };
    if (f.beast?.skill === 'shield') f.shield = beastPower(f.beast).shield;
    if (f.beast?.skill === 'buff') f.atk = Math.round(f.atk * beastPower(f.beast).buff);
    return f;
  }

  fighter(side: Side) {
    return side === 'a' ? this.a : this.b;
  }

  other(side: Side) {
    return side === 'a' ? this.b : this.a;
  }

  canSkill(side: Side) {
    const f = this.fighter(side);
    return !!f.general.technique && f.energy >= 100;
  }

  /** 對目標造成傷害（先扣護盾） */
  damage(target: Fighter, amount: number): number {
    let dmg = Math.max(1, Math.round(amount));
    if (target.shield > 0) {
      const absorbed = Math.min(target.shield, dmg);
      target.shield -= absorbed;
      dmg -= absorbed;
    }
    target.hp = Math.max(0, target.hp - dmg);
    if (target.hp <= 0) this.winner = target.side === 'a' ? 'b' : 'a';
    return dmg;
  }

  private strike(side: Side, mult: number): { dmg: number; elem: string } {
    const me = this.fighter(side);
    const foe = this.other(side);
    const em = elementMod(me.element, foe.element);
    const raw = me.atk * (0.9 + Math.random() * 0.2) * 1.6 * (100 / (100 + foe.def)) * em.mult * mult;
    return { dmg: this.damage(foe, raw), elem: em.text };
  }

  /** 執行一個行動，回傳事件供畫面顯示 */
  act(side: Side, action: 'attack' | 'skill'): DuelEvent[] {
    const me = this.fighter(side);
    const foe = this.other(side);
    const events: DuelEvent[] = [];
    if (action === 'skill' && this.canSkill(side)) {
      me.energy = 0;
      const t = me.general.technique!;
      const r = this.strike(side, t.skillPower);
      events.push({ text: `${me.general.name}施展【${t.skillName}】！造成 ${r.dmg} 傷害${r.elem ? `（${r.elem}）` : ''}`, target: foe.side, damage: r.dmg, kind: 'skill' });
    } else {
      const r = this.strike(side, 1);
      me.energy = Math.min(100, me.energy + 25);
      events.push({ text: `${me.general.name}攻擊，造成 ${r.dmg} 傷害${r.elem ? `（${r.elem}）` : ''}`, target: foe.side, damage: r.dmg, kind: 'hit' });
    }
    foe.energy = Math.min(100, foe.energy + 15);
    return events.concat(this.endAction(side));
  }

  /** 使用物品也算一次行動 */
  itemAction(side: Side, events: DuelEvent[]): DuelEvent[] {
    return events.concat(this.endAction(side));
  }

  /** 行動結束：靈獸出手、毒發、換對手 */
  private endAction(side: Side): DuelEvent[] {
    const me = this.fighter(side);
    const foe = this.other(side);
    const events: DuelEvent[] = [];
    if (!this.winner && me.beast) {
      const p = beastPower(me.beast);
      if (me.beast.skill === 'attack') {
        const dmg = this.damage(foe, p.attack);
        events.push({ text: `靈獸${me.beast.name.split('・')[1]}追擊，造成 ${dmg} 傷害`, target: foe.side, damage: dmg, kind: 'beast' });
      } else if (me.beast.skill === 'heal' && me.hp < me.maxHp) {
        const h = Math.min(me.maxHp - me.hp, Math.round(me.maxHp * p.heal));
        me.hp += h;
        events.push({ text: `靈獸${me.beast.name.split('・')[1]}為${me.general.name}療傷 +${h}`, target: me.side, heal: h, kind: 'beast' });
      }
    }
    if (!this.winner && me.poison) {
      const dmg = Math.min(me.hp, Math.round(me.maxHp * me.poison.dmg));
      me.hp -= dmg;
      me.poison.turns--;
      if (me.poison.turns <= 0) me.poison = null;
      events.push({ text: `${me.general.name}毒發，損失 ${dmg} 血量`, target: me.side, damage: dmg, kind: 'info' });
      if (me.hp <= 0) this.winner = foe.side;
    }
    this.actions++;
    if (!this.winner && this.actions >= MAX_ACTIONS) {
      this.winner = 'b';
      events.push({ text: '久戰不下，守方守住擂台。', kind: 'info' });
    }
    if (!this.winner) {
      this.turn = foe.side;
      if (foe.frozen > 0) {
        foe.frozen--;
        events.push({ text: `${foe.general.name}被定身，無法行動！`, kind: 'info' });
        this.actions++;
        this.turn = me.side;
      }
    }
    return events;
  }

  /** 電腦的單挑行動 */
  aiAction(side: Side): 'attack' | 'skill' {
    return this.canSkill(side) ? 'skill' : 'attack';
  }

  /** 戰後把血量寫回將領 */
  finish() {
    for (const f of [this.a, this.b]) f.general.hp = Math.max(1, f.hp);
  }

  /** 不需操作的快速模擬（電腦對電腦） */
  autoResolve(): Side {
    while (!this.winner) this.act(this.turn, this.aiAction(this.turn));
    this.finish();
    return this.winner!;
  }
}

export interface ContestResult {
  stat: CraftStat;
  aScore: number;
  bScore: number;
  winner: Side;
  /** 維持秩序的兵力損失：敗方 500 兵全滅，勝方折損一部分 */
  aLoss: number;
  bLoss: number;
}

/** 鬥法雙方各需投入的兵力 */
export const CONTEST_SOLDIERS = 500;

/** 煉丹、煉器、畫符、佈陣：比較能力值（之後會換成小遊戲）。攻方扣隨行士兵，守方扣城池守軍 */
export function craftContest(a: General, b: General, stat: CraftStat, attacker: Lord, city: City): ContestResult {
  const aScore = Math.round(craft(a, stat) * (0.85 + Math.random() * 0.3));
  const bScore = Math.round(craft(b, stat) * (0.85 + Math.random() * 0.3));
  const winner: Side = aScore > bScore ? 'a' : 'b';
  const ratio = Math.min(aScore, bScore) / Math.max(aScore, bScore, 1);
  // 勝負越接近，勝方折損越多
  const winnerLoss = Math.round(CONTEST_SOLDIERS * ratio * 0.5);
  const aLoss = Math.min(attacker.soldiers, winner === 'a' ? winnerLoss : CONTEST_SOLDIERS);
  const bLoss = Math.min(city.garrisonSoldiers, winner === 'b' ? winnerLoss : CONTEST_SOLDIERS);
  attacker.soldiers -= aLoss;
  city.garrisonSoldiers -= bLoss;
  return { stat, aScore, bScore, winner, aLoss, bLoss };
}

export interface SiegeResult {
  win: boolean;
  attack: number;
  defense: number;
  attackerLoss: number;
  defenderLoss: number;
}

/** 攻方戰力：士兵受武將武力統率加成，再加上武將本身戰力、靈獸與破城符 */
export function siegeAttack(attacker: Lord, generals: General[]): number {
  const command = 1 + generals.reduce((s, g) => s + attack(g), 0) / 600;
  const base = attacker.soldiers * command + generals.reduce((s, g) => s + power(g) * 2, 0) + beastSiegeBonus(attacker);
  return Math.round(base * attacker.siegeBoost);
}

/** 攻城戰：最多三名武將 + 全部隨行士兵 vs 駐將 + 守軍（一名守軍約等於十名隨行士兵） */
export function siege(state: GameState, attacker: Lord, generals: General[], city: City): SiegeResult {
  const atk = Math.round(siegeAttack(attacker, generals) * (0.85 + Math.random() * 0.3));
  const def = Math.round(garrisonPower(state, city) * (0.9 + Math.random() * 0.2));
  const win = atk > def;
  let attackerLoss: number;
  let defenderLoss: number;
  if (win) {
    attackerLoss = Math.round(attacker.soldiers * Math.min(0.5, (def / atk) * 0.6));
    defenderLoss = city.garrisonSoldiers;
  } else {
    attackerLoss = Math.round(attacker.soldiers * 0.4);
    defenderLoss = Math.round(city.garrisonSoldiers * Math.min(0.5, (atk / def) * 0.3));
  }
  attacker.soldiers -= attackerLoss;
  city.garrisonSoldiers -= defenderLoss;
  for (const g of generals) g.hp = Math.max(1, Math.round(g.hp - maxHp(g) * (win ? 0.1 : 0.25)));
  return { win, attack: atk, defense: def, attackerLoss, defenderLoss };
}
