import type { Aptitude } from '../game/types';
import type { General } from '../game/types';

export const SUCCESS_TEXT = [
  '',
  '「仙凡有別，仙門初叩。」\n{武將}以無上心法牽引周天靈氣，貫通周身百脈。自此褪去凡胎濁氣，靈氣遊走於四肢百骸，方得初窺大道門徑。',
  '「百川匯海，道基方成。」\n丹田內氤氳靈氣極盡壓縮，化作一滴精純真元。{武將}引真元洗盡奇經八脈的紅塵業障，自此道基方成。',
  '「xx金丹，大道初成。」\n識海清明，真元極縮。於丹田深處，{武將}凝成一顆璀璨不朽的xx金丹，自此靈力生生不息，踏上真正的修行之路。',
  '「破繭成蝶，化虛為實。」\n歷經心魔萬劫，{武將}以大毅力碎丹，將神魂與真元熔煉相融。先天元嬰生於紫府靈臺，肉身縱滅亦不朽。',
  '「大象無形，大音希聲。」\n封印修為、謫入紅塵之後，{武將}歷遍生老病死，終以凡人之心明悟天地本源。元神自此超脫物外，神遊太虛。',
  '「五行歸一，洞穿太虛。」\n先天五行歸於圓滿，在{武將}體內化為生生不息的循環。一縷元神寄入無垠太虛，舉手投足皆可撕裂虛空。',
  '「神物為樞，法相驚天。」\n以天階神物為樞，肉身、元神與神物熔煉歸一。頂天立地的本命法相在{武將}身後凝成，神威一出，萬法難侵。',
  '「極道承壓，劫雷加身。」\n九天紫雷與業火接踵而至。雷火深處，{武將}守住一念道心，向死而生，於劫盡之際再進一境。',
  '「四海歸心，氣運證道。」\n{武將}渡盡劫波，聚九州山河氣運，納黎民香火為護體神光。天地氣運反哺凡軀，大乘道體於此成就。',
  '「叩問閶闔，羽化登仙。」\n九天接引霞光落下，凡界壁壘盡碎。化仙池中，{武將}洗淨最後一縷凡塵因果，終得超脫輪迴、位列仙班。',
];
export function breakthroughSuccess(g: General, person = `<strong class="cultivation-name">${g.name}</strong>`): string {
  return SUCCESS_TEXT[g.realm].split('\n').slice(1).join('\n')
    .replaceAll('xx金丹', g.goldenCore ? GOLDEN_CORES[g.goldenCore].name : '金丹')
    .replace('{武將}', () => person);
}
export function breakthroughSuccessTitle(g: General): string {
  if (g.realm === 5) return '大象無形，大音希聲';
  return SUCCESS_TEXT[g.realm].split('\n')[0].replace(/[「」。]/g, '').replaceAll('xx金丹', g.goldenCore ? GOLDEN_CORES[g.goldenCore].name : '金丹');
}

/** New progression data, kept separate until every transition is integrated. */
export const NEW_REALMS = ['凡人', '煉氣', '築基', '金丹', '元嬰', '化神', '煉虛', '合體', '渡劫', '大乘', '真仙'] as const;
export const NEW_REALM_EXP = [200, 400, 800, 1600, 3200, 6400, 10000, 16000, 24000, 36000] as const;

export const GOLDEN_CORES = {
  blood: { name: '血煞金丹', exp: 800, stat: 'force', gain: 20 },
  yang: { name: '純陽金丹', exp: 800, stat: 'alchemy', gain: 20 },
  forge: { name: '百煉金丹', exp: 800, stat: 'forging', gain: 20 },
  talisman: { name: '紫府金丹', exp: 800, stat: 'talisman', gain: 20 },
  formation: { name: '地脈金丹', exp: 800, stat: 'formation', gain: 20 },
  flawless: { name: '無暇金丹', exp: 1200, stat: 'all', gain: 10 },
  heavenly: { name: '天道金丹', exp: 2400, stat: 'all', gain: 20 },
} as const;
export type GoldenCore = keyof typeof GOLDEN_CORES;

/** Indexed by the realm being entered. */
export const BREAKTHROUGH_TITLES = [
  '', '吐納天地，引氣入體', '氣聚成液，洗經伐髓', '真元極縮，凝液成丹',
  '破而後立，碎丹結嬰', '歷練紅塵，化凡悟道', '五行圓滿，煉化虛空',
  '煉化神物，法相合一', '逆天而行，引動雷劫', '九州歸心，氣運證道',
  '破界飛升，羽化登仙',
] as const;

export const TRIBULATION_RULES = {
  nascentSoul: { bolts: 4, totalHpRatio: 1.5, baseBonus: 100, spread: 0.2 },
  tribulation: { bolts: 9, totalHpRatio: 3, baseBonus: 300, spread: 0.2 },
} as const;

export const ESSENCE_PER_SPIRIT = 3;
export const ESSENCE_PER_BREAKTHROUGH = 1;
export const ASCENSION_CITY_MIN_EXCLUSIVE = 200;
export const ASCENSION_CITY_TOLL_MULTIPLIER = 2;
export const INITIAL_FOUNDATION_PILLS = 5;

export function earlyBreakChance(realm: 0 | 1, aptitude: Aptitude, foundation: boolean): number {
  if (realm === 1 && foundation) return 1;
  if (aptitude === 'heaven') return realm === 0 ? 1 : .9;
  if (aptitude === 'waste') return realm === 0 ? .8 : .5;
  return realm === 0 ? .9 : .7;
}

export function goldenCoreChance(core: GoldenCore, aptitude: Aptitude): number {
  if (core === 'heavenly') return .5;
  if (core === 'flawless') return aptitude === 'heaven' ? .7 : aptitude === 'waste' ? .3 : .5;
  return aptitude === 'heaven' ? .9 : aptitude === 'waste' ? .5 : .75;
}

export function mortalTrialTurns(aptitude: Aptitude): readonly [number, number] {
  return aptitude === 'heaven' ? [2, 6] : aptitude === 'waste' ? [6, 10] : [4, 8];
}

export function canSelectGoldenCore(core: GoldenCore, aptitude: Aptitude): boolean {
  return core !== 'heavenly' || aptitude === 'heaven';
}

export function goldenCoreRequirements(core: GoldenCore, aptitude: Aptitude) {
  if (!canSelectGoldenCore(core, aptitude)) return null;
  return GOLDEN_CORES[core];
}

/** Base damage before ward, items and passive reductions. */
export function tribulationBaseTotal(maxWithoutEquipment: number, kind: keyof typeof TRIBULATION_RULES, realmFactor: number) {
  const rule = TRIBULATION_RULES[kind];
  return Math.max(0, maxWithoutEquipment) * rule.totalHpRatio + rule.baseBonus * realmFactor;
}

export function tribulationBaseRange(maxWithoutEquipment: number, kind: keyof typeof TRIBULATION_RULES, realmFactor: number) {
  const rule = TRIBULATION_RULES[kind];
  const total = tribulationBaseTotal(maxWithoutEquipment, kind, realmFactor);
  const per = total / rule.bolts;
  return {
    count: rule.bolts,
    min: Math.round(per * (1 - rule.spread)),
    max: Math.round(per * (1 + rule.spread)),
    avg: Math.round(per),
    totalMin: Math.round(total * (1 - rule.spread)),
    totalMax: Math.round(total * (1 + rule.spread)),
    totalAvg: Math.round(total),
  };
}

export function foundationFailure(exp: number, hp: number, maxHp: number) {
  return { exp: Math.round(exp * 0.75), hp: Math.max(1, hp - Math.round(maxHp * 0.25)) };
}
