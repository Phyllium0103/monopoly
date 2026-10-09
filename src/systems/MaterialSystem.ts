import type { City, GameState, General, Lord } from '../game/types';
import { MATERIAL_GROUPS, MATERIAL_NAMES, WEAPON_CATALOG, WEAPON_UPGRADE_COST, makePersonalWeapon, weaponGrade, type MaterialGroup } from '../data/weaponCatalog';

export const MATERIAL_SYNTHESIS_RATIO = 10;
export function emptyMaterials(): Record<MaterialGroup, [number, number, number]> {
  return Object.fromEntries(MATERIAL_GROUPS.map(k => [k, [0, 0, 0]])) as Record<MaterialGroup, [number, number, number]>;
}
export function materialIncome(city: City): number { return Math.max(0, Math.round(city.prosperity / 20)); }
export function materialsText(lord: Lord): string {
  return MATERIAL_GROUPS.map(k => `${MATERIAL_NAMES[k].map((n, i) => `${n} ${lord.materials[k][i]} 顆`).join('／')}`).join('<br>');
}
export function synthesize(lord: Lord, group: MaterialGroup, stage: number, count: number): string {
  if (!MATERIAL_GROUPS.includes(group) || ![0, 1].includes(stage) || !Number.isSafeInteger(count) || count < 1) throw Error('合成數量無效');
  const cost = count * MATERIAL_SYNTHESIS_RATIO;
  if (lord.materials[group][stage] < cost) throw Error('材料不足');
  lord.materials[group][stage] -= cost;
  lord.materials[group][stage + 1] += count;
  return `消耗 ${cost} 顆${MATERIAL_NAMES[group][stage]}，合成 ${count} 顆${MATERIAL_NAMES[group][stage + 1]}。`;
}
export function upgradeRequirement(lord: Lord, g: General): { ok: boolean; reason: string; group?: MaterialGroup; stage?: number; cost?: number } {
  if (g.owner !== lord.id || !lord.alive || g.ghostSourceId || ['dead', 'realm'].includes(g.status)) return { ok: false, reason: '武將無法升階' };
  const d = WEAPON_CATALOG[g.id], e = g.weapon;
  if (!d || e?.fixedGeneralId !== g.id || e.kind !== 'weapon') return { ok: false, reason: '沒有專屬武器' };
  const stage = weaponGrade(e);
  if (stage >= 3) return { ok: false, reason: '已達天階' };
  const cost = WEAPON_UPGRADE_COST[stage];
  return { group: d.material, stage, cost, ok: lord.materials[d.material][stage] >= cost,
    reason: `需要 ${cost} 顆${MATERIAL_NAMES[d.material][stage]}（持有 ${lord.materials[d.material][stage]}）` };
}
/** 即使武將暫不能升階，滑過武器仍能查看下一階的材料。 */
export function weaponUpgradeTip(lord: Lord, g: General): string {
  const d = WEAPON_CATALOG[g.id], e = g.weapon;
  if (!d || e?.fixedGeneralId !== g.id) return '沒有專屬武器';
  const stage = weaponGrade(e);
  if (stage >= 3) return '已達天階，無需升階材料';
  return `升階材料：${WEAPON_UPGRADE_COST[stage]} 顆${MATERIAL_NAMES[d.material][stage]}（持有 ${lord.materials[d.material][stage]}）`;
}
export function upgradeWeapon(lord: Lord, g: General): string {
  const r = upgradeRequirement(lord, g);
  if (!r.ok || r.group === undefined || r.stage === undefined || r.cost === undefined) throw Error(r.reason);
  lord.materials[r.group][r.stage] -= r.cost;
  const old = g.weapon!.name;
  g.weapon = makePersonalWeapon(g.id, r.stage + 1);
  return `${g.name}消耗 ${r.cost} 顆${MATERIAL_NAMES[r.group][r.stage]}，${old}升階為${g.weapon.name}（無視防禦 ${Math.round(g.weapon.penetration! * 100)}%）。`;
}
/** 選取尚未升滿的麾下武將需求最多、現有產量最少的一組。 */
export function preferredMining(state: GameState, lord: Lord, city: City): MaterialGroup {
  const demand = Object.fromEntries(MATERIAL_GROUPS.map(k => [k, 0])) as Record<MaterialGroup, number>;
  for (const g of Object.values(state.generals)) if (g.owner === lord.id && !g.ghostSourceId && g.status !== 'dead' && g.weapon) {
    const d = WEAPON_CATALOG[g.id];
    if (d) demand[d.material] += [160, 150, 100, 0][weaponGrade(g.weapon)];
  }
  return [...MATERIAL_GROUPS].sort((a, b) => {
    const score = (k: MaterialGroup) => Math.max(0, demand[k] - lord.materials[k].reduce((s, n, i) => s + n * 10 ** i, 0)) /
      (1 + Object.values(state.cities).filter(c => c.id !== city.id && c.owner === lord.id && c.mining === k).reduce((s, c) => s + materialIncome(c), 0));
    return score(b) - score(a);
  })[0];
}
/** 電腦只合成當前欲升階所需的數量，避免把低階材料全部轉走。 */
export function aiUpgradeWeapons(state: GameState, lord: Lord): string[] {
  const logs: string[] = [];
  const gens = Object.values(state.generals).filter(g => g.owner === lord.id && !g.ghostSourceId && !['realm', 'dead'].includes(g.status)).sort((a, b) => b.base.force - a.base.force);
  const prepare = (k: MaterialGroup, stage: number, count: number): boolean => {
    const missing = Math.max(0, count - lord.materials[k][stage]);
    if (!missing) return true;
    if (!stage || !prepare(k, stage - 1, missing * MATERIAL_SYNTHESIS_RATIO)) return false;
    logs.push(synthesize(lord, k, stage - 1, missing)); return true;
  };
  for (const g of gens) {
    for (let i = 0; i < 3; i++) {
      const r = upgradeRequirement(lord, g);
      if (r.stage === undefined || r.group === undefined || r.cost === undefined) break;
      if (!prepare(r.group, r.stage, r.cost)) break;
      logs.push(upgradeWeapon(lord, g));
    }
  }
  return logs;
}
