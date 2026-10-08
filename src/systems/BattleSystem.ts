import type { Beast, City, CraftStat, Element, GameState, General, Lord, LordId } from '../game/types';
import { attack, craft, defense, maxHp, power } from './GeneralSystem';
import { beastPower, elementMod } from '../data/items';
import { beastSiegeBonus, garrisonPower } from './CitySystem';
import { WORLD } from './WorldMods';
import { fx, passiveOf } from '../data/passives';
import { traitOf } from '../faction/Faction';

const passiveName = (g: General) => passiveOf(g).name;

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
  itemsSealed: boolean;
  itemLifesteal: { rate: number; turns: number } | null;
  beast: Beast | null;
}

export interface DuelEvent {
  text: string;
  target?: Side;
  damage?: number;
  heal?: number;
  kind?: 'hit' | 'skill' | 'beast' | 'item' | 'info';
  /** 爆擊 */
  crit?: boolean;
}

/** 擂台基礎爆擊機率與爆擊倍率 */
export const CRIT_BASE = 0.03;
export const CRIT_MULT = 1.5;

const MAX_ROUNDS = 40;
/** 血量低於一成就會認輸（保住性命） */
export const SURRENDER_HP = 0.1;
/** 血量低於 25% 進入瀕危，受到的傷害減少 25% */
export const WOUNDED_HP = 0.25;
export const WOUNDED_REDUCE = 0.25;

/** 血量足以上擂台：開打前就低於一成的武將會直接認輸 */
export function canDuel(g: General): boolean {
  return g.hp >= maxHp(g) * SURRENDER_HP;
}

export type DuelAct = 'attack' | 'skill' | 'none';

/** 擂台戰：每回合雙方同時出手（有先手的一方先出手），能量滿可施放功法技能；可能兩敗俱傷、戰成平手 */
export class Duel {
  a: Fighter;
  b: Fighter;
  /** 已進行的回合數 */
  rounds = 0;
  winner: Side | null = null;
  /** 平手：雙方同時倒下、同時認輸，或久戰不分勝負 */
  draw = false;
  /** 認輸的一方：血量低於一成，保住性命 */
  surrendered: Side | null = null;
  /** 戰死的一方：血量被一擊打到歸零 */
  slain: Side | null = null;
  /** 先手：只有一方擁有先手時，那一方每回合先出手 */
  first: Side | null = null;
  private announced = false;
  /** Tournament protection: lethal damage causes surrender at 1 HP. */
  private nonLethal: boolean;

  constructor(aLord: Lord, aGen: General, bLord: Lord, bGen: General, nonLethal=false) {
    this.nonLethal=nonLethal;
    this.a = this.makeFighter('a', aLord, aGen);
    this.b = this.makeFighter('b', bLord, bGen);
    // 震懾：壓低對手武力
    this.a.atk = Math.round(this.a.atk * (1 - (fx(bGen).intimidate ?? 0)));
    this.b.atk = Math.round(this.b.atk * (1 - (fx(aGen).intimidate ?? 0)));
    const fa = !!fx(aGen).firstStrike;
    const fb = !!fx(bGen).firstStrike;
    if (fa !== fb) this.first = fa ? 'a' : 'b';
    // 上場前血量就低於一成：不戰而降（雙方皆是則攻方先認輸）
    if (this.a.hp < this.a.maxHp * SURRENDER_HP) this.surrender(this.a);
    else if (this.b.hp < this.b.maxHp * SURRENDER_HP) this.surrender(this.b);
  }

  /** 勝負已分或平手 */
  get over(): boolean {
    return !!this.winner || this.draw;
  }

  private surrender(f: Fighter) {
    this.surrendered = f.side;
    this.winner = f.side === 'a' ? 'b' : 'a';
  }

  /** 判定勝負：歸零即戰死，低於一成認輸；雙方同時倒下則平手（一死一降，活著的一方獲勝） */
  private judge() {
    if (this.over) return;
    for (const f of [this.a,this.b]) if (f.hp <= 0 && (this.nonLethal || fx(f.general).duelImmortal)) f.hp=1;
    const state = (f: Fighter) => (f.hp <= 0 ? 'dead' : f.hp < f.maxHp * SURRENDER_HP ? 'down' : 'ok');
    const sa = state(this.a);
    const sb = state(this.b);
    if (sa === 'ok' && sb === 'ok') return;
    if (sa !== 'ok' && sb !== 'ok') {
      if (sa === 'dead' && sb === 'dead') this.draw = true;
      else if (sa === 'dead') {
        this.slain = 'a';
        this.winner = 'b';
      } else if (sb === 'dead') {
        this.slain = 'b';
        this.winner = 'a';
      } else this.draw = true;
      return;
    }
    const loser = sa !== 'ok' ? this.a : this.b;
    if (state(loser) === 'dead') this.slain = loser.side;
    else this.surrendered = loser.side;
    this.winner = loser.side === 'a' ? 'b' : 'a';
  }

  /** 結局公告：平手、認輸或戰死 */
  verdict(): DuelEvent[] {
    if (!this.over || this.announced) return [];
    this.announced = true;
    if (this.draw) return [{ text: '兩人勢均力敵，戰成平手！雙方各得歷練，過路費一筆勾銷。', kind: 'info' }];
    if (this.slain) {
      const g = this.fighter(this.slain).general;
      return [{ text: `${g.name}被當場擊殺，戰死擂台！`, kind: 'info' }];
    }
    if (this.surrendered) {
      const g = this.fighter(this.surrendered).general;
      return [{ text: `${g.name}血量不足一成，自知不敵，拱手認輸！`, kind: 'info' }];
    }
    return [];
  }

  /** 戰死的武將 */
  slainGeneral(): General | null {
    return this.slain ? this.fighter(this.slain).general : null;
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
      energy: fx(g).energyStart ?? 0,
      shield: 0,
      poison: null,
      frozen: 0,
      itemsSealed: lord.itemsLocked > 0,
      itemLifesteal: null,
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

  /** 對目標造成傷害（先扣護盾）；瀕危判定可由呼叫端傳入（同時出手時以回合開始的血量為準） */
  damage(target: Fighter, amount: number, wounded = target.hp < target.maxHp * WOUNDED_HP, defer = false): number {
    let dmg = Math.max(1, Math.round(amount));
    // 瀕危：血量低於 25% 時減傷 25%
    if (wounded && !fx(this.other(target.side).general).ignoreWounded) dmg = Math.max(1, Math.round(dmg * (1 - WOUNDED_REDUCE)));
    if (target.shield > 0) {
      const absorbed = Math.min(target.shield, dmg);
      target.shield -= absorbed;
      dmg -= absorbed;
    }
    target.hp = Math.max(0, target.hp - dmg);
    if (!defer) this.judge();
    return dmg;
  }

  /** 計算一次出手並套用傷害 */
  private strike(side: Side, mult: number, skill: boolean, wounded: boolean): { dmg: number; elem: string; heal: number; crit: boolean } {
    const me = this.fighter(side);
    const foe = this.other(side);
    const mine = fx(me.general);
    if (Math.random() < (fx(foe.general).dodge??0)) return {dmg:0,elem:'閃避',heal:0,crit:false};
    const em = elementMod(me.element, foe.element);
    // 五行輪轉：當令屬性傷害 +30%
    const tide = WORLD.element && me.element === WORLD.element ? 1.3 : 1;
    // 個人被動：擂台傷害、功法技能、血量低於一半的怒氣、對手的減傷
    const passive =
      (1 + (mine.duelDmg ?? 0) + (traitOf(me.lord).duelDmg ?? 0)) *
      (skill ? 1 + (mine.skillDmg ?? 0) : 1) *
      (me.hp < me.maxHp / 2 ? 1 + (mine.rage ?? 0) : 1) *
      (1 - (fx(foe.general).duelTaken ?? 0));
    const crit = Math.random() < CRIT_BASE + (mine.crit ?? 0);
    const raw = me.atk * (0.9 + Math.random() * 0.2) * 1.6 * (100 / (100 + foe.def)) * em.mult * mult * tide * passive * (crit ? CRIT_MULT : 1);
    const dmg = this.damage(foe, raw, wounded, true);
    const heal = Math.min(me.maxHp - me.hp, Math.round(dmg * ((mine.lifesteal ?? 0) + (me.itemLifesteal?.rate ?? 0))));
    me.hp += heal;
    return { dmg, elem: em.text, heal, crit };
  }

  /** 一方出手：普通攻擊或功法技能，回傳事件 */
  private act(side: Side, act: DuelAct, wounded: boolean): DuelEvent[] {
    const me = this.fighter(side);
    const foe = this.other(side);
    const events: DuelEvent[] = [];
    if (act === 'none') return events;
    if (act === 'skill' && this.canSkill(side)) {
      me.energy = 0;
      const t = me.general.technique!;
      const r = this.strike(side, t.skillPower, true, wounded);
      events.push({ text: `${me.general.name}施展【${t.skillName}】！${r.crit ? '【暴擊】' : ''}造成 ${r.dmg} 傷害${r.elem ? `（${r.elem}）` : ''}`, target: foe.side, damage: r.dmg, kind: 'skill', crit: r.crit });
      if (r.heal) events.push({ text: `${me.general.name}吸取 ${r.heal} 血量`, target: side, heal: r.heal, kind: 'info' });
    } else {
      const mine = fx(me.general);
      const r = this.strike(side, 1, false, wounded);
      me.energy = Math.min(100, me.energy + 25 + (mine.energyGain ?? 0));
      events.push({ text: `${me.general.name}攻擊，${r.crit ? '【暴擊】' : ''}造成 ${r.dmg} 傷害${r.elem ? `（${r.elem}）` : ''}`, target: foe.side, damage: r.dmg, kind: 'hit', crit: r.crit });
      if (r.heal) events.push({ text: `${me.general.name}吸取 ${r.heal} 血量`, target: side, heal: r.heal, kind: 'info' });
      // 連擊：有機率多砍一刀
      if (mine.doubleStrike && Math.random() < mine.doubleStrike) {
        const r2 = this.strike(side, 1, false, wounded);
        events.push({ text: `${me.general.name}【${passiveName(me.general)}】連擊！再造成 ${r2.dmg} 傷害`, target: foe.side, damage: r2.dmg, kind: 'hit' });
      }
    }
    foe.energy = Math.min(100, foe.energy + 15);
    return events;
  }

  /**
   * 進行一個回合：雙方同時出手（以回合開始時的血量判定瀕危）。
   * 有先手的一方先出手，若已分出勝負，對方就來不及還手；其餘情況兩人同時倒下就是平手。
   */
  round(acts: Record<Side, DuelAct>): DuelEvent[] {
    const events: DuelEvent[] = [];
    if (this.over) return events;
    const wounded = { a: this.a.hp < this.a.maxHp * WOUNDED_HP, b: this.b.hp < this.b.maxHp * WOUNDED_HP };
    const todo: Side[] = this.first ? [this.first, this.first === 'a' ? 'b' : 'a'] : ['a', 'b'];
    const real: Record<Side, DuelAct> = { ...acts };
    // 定身：這一回合無法出手
    for (const side of todo) {
      const f = this.fighter(side);
      if (f.frozen > 0) {
        f.frozen--;
        real[side] = 'none';
        events.push({ text: `${f.general.name}被定身，無法行動！`, kind: 'info' });
      }
    }
    if (this.first) {
      // 先手：先出手，勝負已分則對方不能還手
      for (const side of todo) {
        events.push(...this.act(side, real[side], wounded[side === 'a' ? 'b' : 'a']));
        this.judge();
        if (this.over) break;
      }
    } else {
      // 同時出手：兩邊的傷害都先算完，再一起判定
      for (const side of todo) events.push(...this.act(side, real[side], wounded[side === 'a' ? 'b' : 'a']));
      this.judge();
    }
    // 回合結束：靈獸出手、毒發
    if (!this.over) {
      for (const side of ['a', 'b'] as const) events.push(...this.endRound(side));
      this.judge();
    }
    for (const f of [this.a, this.b]) if (f.itemLifesteal && --f.itemLifesteal.turns <= 0) f.itemLifesteal = null;
    this.rounds++;
    if (!this.over && this.rounds >= MAX_ROUNDS) {
      this.draw = true;
      events.push({ text: '久戰不下，雙方鬥得難分難解。', kind: 'info' });
    }
    events.push(...this.verdict());
    return events;
  }

  /** 使用物品的事件也要結算（物品造成的傷害可能分出勝負） */
  afterItem(events: DuelEvent[]): DuelEvent[] {
    this.judge();
    return events.concat(this.verdict());
  }

  /** 回合結束：靈獸、毒 */
  private endRound(side: Side): DuelEvent[] {
    const me = this.fighter(side);
    const foe = this.other(side);
    const events: DuelEvent[] = [];
    if (me.beast) {
      const p = beastPower(me.beast);
      if (me.beast.skill === 'attack') {
        const dmg = this.damage(foe, p.attack, foe.hp < foe.maxHp * WOUNDED_HP, true);
        const recovered = Math.min(me.maxHp - me.hp, Math.round(dmg * (me.itemLifesteal?.rate ?? 0)));
        me.hp += recovered;
        if (recovered) events.push({ text: '嗜血珠吸血 +' + recovered, target: me.side, heal: recovered, kind: 'item' });
        events.push({ text: `靈獸${me.beast.name.split('・')[1]}追擊，造成 ${dmg} 傷害`, target: foe.side, damage: dmg, kind: 'beast' });
      }
    }
    if (me.poison) {
      // 毒只會把人逼到認輸，不會直接毒死
      const dmg = Math.max(0, Math.min(me.hp - 1, Math.round(me.maxHp * me.poison.dmg)));
      me.hp -= dmg;
      me.poison.turns--;
      if (me.poison.turns <= 0) me.poison = null;
      if (dmg) events.push({ text: `${me.general.name}毒發，損失 ${dmg} 血量`, target: me.side, damage: dmg, kind: 'info' });
    }
    return events;
  }

  /** 電腦的單挑行動 */
  aiAction(side: Side): DuelAct {
    return this.canSkill(side) ? 'skill' : 'attack';
  }

  /** 戰後把血量寫回將領 */
  finish() {
    for (const f of [this.a, this.b]) f.general.hp = f.side === this.slain ? 0 : Math.max(1, f.hp);
  }

  /** 不需操作的快速模擬（電腦對電腦）：回傳勝方，平手回傳 'draw' */
  autoResolve(): Side | 'draw' {
    while (!this.over) this.round({ a: this.aiAction('a'), b: this.aiAction('b') });
    this.finish();
    return this.winner ?? 'draw';
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

/** 前 10 輪休養生息，只能比武鬥法，第 11 輪起才能攻城 */
export const SIEGE_START_ROUND = 11;

export function siegeAllowed(round: number): boolean {
  return round >= SIEGE_START_ROUND;
}

/** 煉丹、煉器、畫符、佈陣：比較能力值（之後會換成小遊戲）。攻方扣隨行士兵，守方扣城池守軍 */
export function craftContest(a: General, b: General, stat: CraftStat, attacker: Lord, city: City): ContestResult {
  const aScore = Math.round(craft(a, stat) * (0.85 + Math.random() * 0.3) * (1 + (fx(a).contest ?? 0)));
  const bScore = Math.round(craft(b, stat) * (0.85 + Math.random() * 0.3) * (1 + (fx(b).contest ?? 0)));
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
export function siegeAttack(attacker: Lord, generals: General[], soldiers = attacker.soldiers): number {
  // 統率：武力越高加成越大，攻城統率被動再加乘；兵力倍增取隊中最高者
  const command = 1 + generals.reduce((s, g) => s + attack(g) * (1 + (fx(g).siegeLead ?? 0)), 0) / 600;
  const troops = 1 + Math.max(0, ...generals.map((g) => fx(g).troops ?? 0));
  const base = soldiers * troops * command + generals.reduce((s, g) => s + power(g) * 2, 0) + beastSiegeBonus(attacker);
  return Math.round(base * attacker.siegeBoost * (1 + (traitOf(attacker.id).siege ?? 0)));
}

/** 攻城戰：最多三名武將 + 自己決定派出的士兵 vs 駐將 + 城池守軍（一名守軍約等於十五名隨行士兵） */
export function siege(state: GameState, attacker: Lord, generals: General[], city: City, soldiers = attacker.soldiers): SiegeResult {
  const atk = Math.round(siegeAttack(attacker, generals, soldiers) * (0.85 + Math.random() * 0.3));
  const def = Math.round(garrisonPower(state, city) * (0.9 + Math.random() * 0.2));
  const win = atk > def;
  let attackerLoss: number;
  let defenderLoss: number;
  // 敗方投入的兵力全滅；勝方折損隨雙方差距縮小而增加
  if (win) {
    attackerLoss = Math.round(soldiers * Math.min(0.8, (def / atk) * 0.6));
    defenderLoss = city.garrisonSoldiers;
  } else {
    attackerLoss = soldiers;
    defenderLoss = Math.round(city.garrisonSoldiers * Math.min(0.8, (atk / def) * 0.6));
  }
  attacker.soldiers -= attackerLoss;
  city.garrisonSoldiers -= defenderLoss;
  // 戰火波及：遭攻打的城池繁榮度小幅下降
  city.prosperity = Math.max(20, Math.round(city.prosperity * 0.95 * 100) / 100);
  for (const g of generals) g.hp = Math.max(1, Math.round(g.hp - maxHp(g) * (win ? 0.1 : 0.25)));
  return { win, attack: atk, defense: def, attackerLoss, defenderLoss };
}
