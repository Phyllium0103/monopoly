import type { Aptitude } from '../game/types';
import type { General } from '../game/types';

export const SUCCESS_TEXT = [
  '',
  '「仙凡有別，仙門初叩。」\n以無上心法牽引周天靈氣，貫通周身百脈。自此褪去凡胎濁氣，靈氣遊走於四肢百骸，壽元綿延，方得初窺大道門徑。',
  '「百川匯海，道基方成。」\n丹田內氤氳靈氣極盡壓縮，化作一滴精純真元。引此真元洗刷奇經八脈，伐毛洗髓，褪盡紅塵業障，為日後參悟天道鑄就萬世不拔之根基。',
  '「xx金丹，大道初成。」\n識海清明，真元極縮，於丹田造化出一抹璀璨不朽的xx金丹。自此靈力生生不息，壽載五百，乃逆天修行之真正起點。',
  '「破繭成蝶，化虛為實。」\n歷經心魔萬劫，以大毅力碎裂無暇金丹，將神魂與真元煆燒交融，於紫府靈台孕育出先天元嬰。肉身縱滅，元嬰不朽，自此踏入陸地神仙之流。',
  '「大象無形，大音希聲。」\n封印通天修為，謫落萬丈紅塵。唯有親歷凡世間的生老病死、恩怨情仇，方能勘破世俗虛妄。以凡人之心明悟天地本源，元神自此超脫物外，神遊太虛。',
  '「五行歸一，洞穿太虛。」\n補齊先天五行之缺憾，體內衍化生生不息之大循環。將一縷元神寄託於無垠空間，無懼天地反噬，舉手投足皆可撕裂虛空，汲取太虛之力為己用。',
  '「神物為樞，法相驚天。」\n以萬載絕世神兵為陣眼，牽引天地造化。肉身、元神與神物徹底熔煉歸一，於身後凝聚出頂天立地之本命法相。神威一出，鎮壓萬古，萬法不侵。',
  '「極道承壓，劫雷加身。」\n修士之威已凌駕凡界極致，引得天道震怒，降下九天紫雷與滅世業火。此境乃向死而生之局，唯有以無上道心逆行伐天，方能博取一線生機。',
  '「四海歸心，氣運證道。」\n渡盡劫波，需以無雙帝王之姿君臨天下。匯聚神州百萬里河山之氣運，納黎民百姓之香火宏願為護體神光。以九州氣運反哺凡軀，成就萬劫不滅之大乘道體。',
  '「叩問閶闔，羽化登仙。」\n下界法則再難加諸其身，引動九天接引霞光。擊碎凡界千古壁壘，沐浴化仙池水，洗淨最後一縷凡塵因果。自此超脫輪迴，位列仙班，證得永生大逍遙。',
];
export function breakthroughSuccess(g: General): string {
  if (g.realm === 5) return `封印通天修為，謫落萬丈紅塵。唯有親歷凡世間的生老病死、恩怨情仇，方能勘破世俗虛妄。<strong class="cultivation-name">${g.name}</strong>以凡人之心明悟天地本源，元神自此超脫物外，神遊太虛。`;
  return SUCCESS_TEXT[g.realm].split('\n').slice(1).join('\n').replaceAll('xx金丹', g.goldenCore ? GOLDEN_CORES[g.goldenCore].name : '金丹');
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
  nascentSoul: { bolts: 4, totalHpRatio: 1.5, spread: 0.2 },
  tribulation: { bolts: 9, totalHpRatio: 3, spread: 0.2 },
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
export function tribulationBaseRange(maxWithoutEquipment: number, kind: keyof typeof TRIBULATION_RULES) {
  const rule = TRIBULATION_RULES[kind];
  const total = Math.max(0, maxWithoutEquipment) * rule.totalHpRatio;
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
