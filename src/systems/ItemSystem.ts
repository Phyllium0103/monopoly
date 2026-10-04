import type { City, GameState, General, Item, Lord } from '../game/types';
import { ESSENCE_EXP, HEAL, ITEM_DEFS, POISON, QI_EXP, STAMINA_UP, STAT_NAMES, STAT_UP, itemName, type ItemDef } from '../data/items';
import { addExp, attack, craft, defense, maxHp } from './GeneralSystem';
import type { Duel, DuelEvent, Side } from './BattleSystem';
import { fmtStones } from '../game/Currency';
import { LORDS } from '../faction/Faction';
import { fx } from '../data/passives';

export function def(item: Item): ItemDef {
  return ITEM_DEFS[item.defId];
}

export function nameOf(item: Item): string {
  return itemName(item.defId, item.tier);
}

export function requirement(item: Item, user?: General) {
  const d = def(item);
  const i = Math.min(item.tier, d.min.length - 1);
  return { stat: d.stat, min: d.min[i], stamina: Math.round(d.stamina[i] * (1 - (user ? (fx(user).itemStamina ?? 0) : 0))) };
}

export function requirementText(item: Item): string {
  const r = requirement(item);
  return `${STAT_NAMES[r.stat]} ≥ ${r.min}・體力 ${r.stamina}`;
}

/** 能力值與體力是否足以使用 */
export function canUse(item: Item, user: General): { ok: boolean; reason: string } {
  const r = requirement(item, user);
  if (craft(user, r.stat) < r.min) return { ok: false, reason: `${STAT_NAMES[r.stat]}不足（需 ${r.min}）` };
  if (user.stamina < r.stamina) return { ok: false, reason: `體力不足（需 ${r.stamina}）` };
  return { ok: true, reason: '' };
}

export function usableIn(item: Item, context: 'preroll' | 'battle'): boolean {
  const t = def(item).timing;
  return t === 'both' || t === context;
}

function consume(lord: Lord, item: Item, user: General) {
  user.stamina -= requirement(item, user).stamina;
  lord.items = lord.items.filter((i) => i.uid !== item.uid);
}

export interface PrerollTarget {
  general?: General;
  lord?: Lord;
  city?: City;
  tile?: number;
  dice?: number;
}

/** 擲骰前使用：回傳結果文字（傳送陣的移動由遊戲流程處理） */
export function usePreroll(state: GameState, lord: Lord, item: Item, user: General, target: PrerollTarget): string {
  consume(lord, item, user);
  const t = item.tier;
  const name = nameOf(item);
  const g = target.general;
  const head = `${user.name}使用${name}`;
  switch (item.defId) {
    case 'heal': {
      const h = Math.min(maxHp(g!) - g!.hp, Math.round(maxHp(g!) * HEAL[t]));
      g!.hp += h;
      return `${head}，${g!.name}回復 ${h} 血量。`;
    }
    case 'force':
      g!.bonusForce += STAT_UP[t];
      return `${head}，${g!.name}武力永久 +${STAT_UP[t]}。`;
    case 'guard':
      g!.bonusDefense += STAT_UP[t];
      return `${head}，${g!.name}防禦永久 +${STAT_UP[t]}。`;
    case 'qi':
    case 'essence': {
      const n = addExp(g!, (item.defId === 'qi' ? QI_EXP : ESSENCE_EXP)[t]);
      return `${head}，${g!.name}修為 +${n}${n < (item.defId === 'qi' ? QI_EXP : ESSENCE_EXP)[t] ? '（已達瓶頸，溢出的修為散去）' : ''}。`;
    }
    case 'foundation':
      g!.foundation = true;
      return `${head}，${g!.name}服下築基丹，突破築基成功率提升至 95%。`;
    case 'thunderward':
    case 'fiveward': {
      g!.ward = Math.min(0.8, g!.ward + (item.defId === 'thunderward' ? 0.5 : 0.3));
      return `${head}，為${g!.name}布下護法大陣，下次雷劫傷害 -${Math.round(g!.ward * 100)}%。`;
    }
    case 'demon':
    case 'illusion': {
      g!.demon = Math.max(g!.demon, item.defId === 'demon' ? 1 : 2);
      return `${head}，${g!.name}心魔滋生，下次突破兇險倍增！`;
    }
    case 'siegebreak':
      lord.siegeBoost = 1.3;
      return `${head}，本回合攻城戰力 ×1.3。`;
    case 'vigor':
      g!.stamina = Math.min(100, g!.stamina + STAMINA_UP[t]);
      return `${head}，${g!.name}體力回復 ${STAMINA_UP[t]}。`;
    case 'poison': {
      if (fx(g!).poisonImmune) return `${head}暗算${g!.name}，但${g!.name}百毒不侵！`;
      const dmg = Math.min(g!.hp - 1, Math.round(maxHp(g!) * POISON[t] * 2.5));
      g!.hp -= dmg;
      return `${head}暗算${g!.name}，造成 ${dmg} 傷害！`;
    }
    case 'teleport':
      return `${head}，傳送至${state.tiles[target.tile!].name}！`;
    case 'confuse':
      target.lord!.stunned = 2;
      return `${head}，困住了${lordName(target.lord!)} 2 回合！`;
    case 'citadel':
      target.city!.shieldTurns = 5;
      return `${head}，${target.city!.name}守軍戰力 ×1.5（5 回合）。`;
    case 'dice':
      lord.fixedDice = target.dice!;
      return `${head}，本回合骰子定為 ${target.dice} 點。`;
    case 'stride':
      lord.doubleDice = true;
      return `${head}，本回合擲兩顆骰子。`;
    case 'thunder': {
      const loss = Math.round(target.city!.garrisonSoldiers * 0.3);
      target.city!.garrisonSoldiers -= loss;
      return `${head}，天雷落在${target.city!.name}，守軍 -${loss}！`;
    }
    case 'ghost': {
      const amount = Math.min(20000, Math.round(target.lord!.stones * 0.08));
      target.lord!.stones -= amount;
      lord.stones += amount;
      return `${head}，從${lordName(target.lord!)}處搬走 ${fmtStones(amount)}！`;
    }
    case 'truce':
      lord.tollFree = true;
      return `${head}，本回合踏入敵城免繳過路費。`;
  }
  return head;
}

/** 戰鬥中使用 */
export function useInDuel(duel: Duel, side: Side, lord: Lord, item: Item, user: General): DuelEvent[] {
  consume(lord, item, user);
  const me = duel.fighter(side);
  const foe = duel.other(side);
  const t = item.tier;
  const head = `${user.name}使用${nameOf(item)}`;
  switch (item.defId) {
    case 'heal': {
      const h = Math.min(me.maxHp - me.hp, Math.round(me.maxHp * HEAL[t]));
      me.hp += h;
      return [{ text: `${head}，${me.general.name}回復 ${h} 血量`, target: side, heal: h, kind: 'item' }];
    }
    case 'force':
      me.general.bonusForce += STAT_UP[t];
      me.atk = attack(me.general);
      return [{ text: `${head}，${me.general.name}武力 +${STAT_UP[t]}`, kind: 'item' }];
    case 'guard':
      me.general.bonusDefense += STAT_UP[t];
      me.def = defense(me.general);
      return [{ text: `${head}，${me.general.name}防禦 +${STAT_UP[t]}`, kind: 'item' }];
    case 'vigor':
      user.stamina = Math.min(100, user.stamina + STAMINA_UP[t]);
      return [{ text: `${head}，體力回復 ${STAMINA_UP[t]}`, kind: 'item' }];
    case 'poison':
      if (fx(foe.general).poisonImmune) return [{ text: `${head}，但${foe.general.name}百毒不侵！`, kind: 'item' }];
      foe.poison = { dmg: POISON[t], turns: 3 };
      return [{ text: `${head}，${foe.general.name}中毒了！`, kind: 'item' }];
    case 'thunder': {
      const dmg = duel.damage(foe, foe.maxHp * 0.25);
      return [{ text: `${head}，天雷轟擊${foe.general.name}，造成 ${dmg} 傷害！`, target: foe.side, damage: dmg, kind: 'item' }];
    }
    case 'freeze':
      if (fx(foe.general).freezeImmune) return [{ text: `${head}，但${foe.general.name}不受定身！`, kind: 'item' }];
      foe.frozen = 1;
      return [{ text: `${head}，${foe.general.name}被定身！`, kind: 'item' }];
    case 'vajra': {
      const s = Math.round(me.maxHp * 0.3);
      me.shield += s;
      return [{ text: `${head}，${me.general.name}獲得 ${s} 點護罩`, kind: 'item' }];
    }
  }
  return [{ text: head, kind: 'item' }];
}

function lordName(l: Lord): string {
  return LORDS[l.id].name;
}
