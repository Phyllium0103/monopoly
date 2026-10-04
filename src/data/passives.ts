import type { CraftStat, General } from '../game/types';

/** 被動效果：數值皆為比例（0.15 = +15%），技藝為點數 */
export interface PassiveFx {
  atk?: number;
  def?: number;
  hp?: number;
  craft?: Partial<Record<CraftStat, number>>;
  /** 擂台傷害 */
  duelDmg?: number;
  /** 擂台受到的傷害減免 */
  duelTaken?: number;
  /** 擂台開場能量 */
  energyStart?: number;
  /** 每次攻擊額外能量 */
  energyGain?: number;
  /** 功法技能傷害 */
  skillDmg?: number;
  /** 血量低於一半時傷害 */
  rage?: number;
  /** 傷害吸血 */
  lifesteal?: number;
  /** 擂台上壓低敵將武力 */
  intimidate?: number;
  /** 擂台必定先手 */
  firstStrike?: boolean;
  /** 擂台每次攻擊有機率多砍一刀 */
  doubleStrike?: number;
  /** 攻城或守城時部隊兵力倍增（1 = 兵力加倍） */
  troops?: number;
  poisonImmune?: boolean;
  freezeImmune?: boolean;
  /** 攻城時的統率加成 */
  siegeLead?: number;
  /** 駐守時的守城戰力 */
  garrisonDef?: number;
  /** 駐守城池的靈石收入 */
  cityStones?: number;
  /** 駐守城池的士兵收入 */
  citySoldiers?: number;
  /** 修為獲得 */
  exp?: number;
  /** 低階突破成功率 */
  breakBonus?: number;
  /** 雷劫傷害減免 */
  tribulation?: number;
  /** 秘境、仙山隕落率降低 */
  realmSafety?: number;
  /** 海外貿易獲利 */
  trade?: number;
  /** 使用物品的體力消耗降低 */
  itemStamina?: number;
  /** 煉丹煉器畫符佈陣比試得分 */
  contest?: number;
}

export interface Passive {
  name: string;
  flavor: string;
  fx: PassiveFx;
}

const P = (name: string, flavor: string, fx: PassiveFx): Passive => ({ name, flavor, fx });

/** 每位人物的專屬被動，依歷史評價、陣營風格與實際戰力設計 */
export const PASSIVES: Record<string, Passive> = {
  // ───── 蜀：英雄豪傑，重單挑與氣節 ─────
  guanyu: P('武聖', '威震華夏，溫酒斬華雄；刮骨療毒而面不改色。', { duelDmg: 0.1, doubleStrike: 0.15, poisonImmune: true }),
  zhangfei: P('萬人敵', '據水斷橋，瞋目橫矛，曹軍無敢近者。', { intimidate: 0.18, rage: 0.2, atk: 0.05 }),
  zhaoyun: P('一身是膽', '長坂坡七進七出，渾身是膽。', { duelTaken: 0.15, doubleStrike: 0.2 }),
  zhugeliang: P('臥龍', '鞠躬盡瘁，八陣圖困敵，借東風、禳星斗。', { craft: { formation: 15 }, garrisonDef: 0.25, tribulation: 0.3 }),
  huangzhong: P('老當益壯', '定軍山一戰陣斬夏侯淵，百步穿楊，箭無虛發。', { skillDmg: 0.2, doubleStrike: 0.15 }),
  machao: P('錦馬超', '西涼鐵騎渭水破曹，割鬚棄袍。', { troops: 0.3, doubleStrike: 0.15 }),
  weiyan: P('鎮守漢中', '「若曹操舉天下而來，請為大王拒之。」', { garrisonDef: 0.3, atk: 0.05 }),
  pangtong: P('鳳雛', '與臥龍齊名，獻連環之計。', { craft: { talisman: 10 }, contest: 0.15, exp: 0.15 }),
  jiangwei: P('幼麟', '承丞相遺志，九伐中原。', { siegeLead: 0.15, exp: 0.15 }),
  fazheng: P('謀主', '策劃定軍山，奇畫策算。', { contest: 0.15, siegeLead: 0.1 }),
  madai: P('伏兵斬將', '「誰敢殺我？」應聲斬魏延於馬下。', { firstStrike: true, duelDmg: 0.1 }),
  guanping: P('隨父征戰', '追隨關羽轉戰荊襄，忠勇不二。', { def: 0.1, garrisonDef: 0.15 }),
  guanxing: P('青龍傳人', '承父親青龍刀法，少年英武。', { skillDmg: 0.15, exp: 0.1 }),
  zhangbao: P('虎父無犬子', '丈八蛇矛，勇猛不遜其父。', { rage: 0.25, atk: 0.03 }),
  wangping: P('街亭良將', '馬謖失街亭，唯王平所部全師而還。', { garrisonDef: 0.3 }),
  liaohua: P('蜀中先鋒', '歷經數十年征戰，壽考而終。', { hp: 0.15, realmSafety: 0.2 }),
  yanyan: P('斷頭將軍', '「但有斷頭將軍，無有降將軍也。」', { def: 0.15, duelTaken: 0.1 }),
  huangquan: P('忠貞不二', '進退不失其節，曹丕亦敬重之。', { garrisonDef: 0.15, def: 0.1 }),
  liyan: P('託孤重臣', '與諸葛亮同受託孤，督辦糧運。', { citySoldiers: 0.2, cityStones: 0.1 }),
  maliang: P('白眉', '馬氏五常，白眉最良。', { exp: 0.2, contest: 0.1 }),
  masu: P('紙上談兵', '才器過人，好論軍計，卻失守街亭。', { craft: { formation: 12 }, contest: 0.1, garrisonDef: -0.15 }),
  jiangwan: P('社稷之器', '諸葛亮之後總攬國事，方整有威重。', { cityStones: 0.2, citySoldiers: 0.05 }),
  feiyi: P('舉重若輕', '處理政務過目不忘，談笑間決斷。', { itemStamina: 0.3, exp: 0.1 }),
  jianyong: P('談笑風生', '優游風議，性簡傲跌宕。', { contest: 0.2 }),
  mizhu: P('富甲一方', '家資鉅億，傾家資助劉備。', { cityStones: 0.25, trade: 0.3 }),
  sunqian: P('出使四方', '奉使袁紹、劉表，善於應對。', { trade: 0.2, contest: 0.1 }),
  yiji: P('機捷', '出使東吳，應對機敏，孫權嘆服。', { contest: 0.15, itemStamina: 0.1 }),
  wuyi: P('國舅', '劉備皇后之兄，督守漢中。', { garrisonDef: 0.15, citySoldiers: 0.15 }),
  zhangyi: P('沉毅', '從征有功，堅守不退。', { def: 0.1, siegeLead: 0.1 }),
  zhoucang: P('扛刀', '為關羽扛刀，力能負重千里。', { hp: 0.2, atk: 0.05 }),

  // ───── 吳：水戰、經濟與火攻 ─────
  zhouyu: P('赤壁火攻', '羽扇綸巾，談笑間檣櫓灰飛煙滅。', { skillDmg: 0.25, craft: { formation: 10 } }),
  lusu: P('榻上策', '鼎足江東之策，為孫權定大計。', { cityStones: 0.2, contest: 0.1 }),
  lvmeng: P('白衣渡江', '士別三日，當刮目相待。', { exp: 0.3, firstStrike: true }),
  luxun: P('火燒連營', '夷陵一把火，燒退劉備七百里連營。', { troops: 0.5, skillDmg: 0.15 }),
  ganning: P('百騎劫營', '錦帆賊出身，率百騎夜襲曹營無一損傷。', { energyStart: 50, doubleStrike: 0.15 }),
  taishici: P('信義篤烈', '神亭與孫策酣鬥，一諾千金。', { doubleStrike: 0.15, rage: 0.15 }),
  huanggai: P('苦肉計', '受杖詐降，火攻赤壁。', { hp: 0.25, craft: { forging: 5 } }),
  zhoutai: P('不屈', '捨身護主，身被十二創而不退。', { duelTaken: 0.2, poisonImmune: true }),
  chengpu: P('江東元老', '歷事孫堅三代，眾人皆呼程公。', { garrisonDef: 0.15, def: 0.1 }),
  lingtong: P('國士', '逍遙津死戰護主，部曲盡沒。', { rage: 0.2, atk: 0.05 }),
  handang: P('宿將', '隨孫氏三代征戰，弓馬嫻熟。', { def: 0.1, siegeLead: 0.1 }),
  jiangqin: P('水軍都督', '江上作戰經驗老到。', { trade: 0.2, siegeLead: 0.1 }),
  chenwu: P('親衛', '孫策親近，常為先登。', { duelTaken: 0.1, hp: 0.1 }),
  xusheng: P('疑城計', '於建業江邊立假城，曹丕望而退兵。', { troops: 0.5 }),
  dingfeng: P('雪中奮短兵', '雪中棄甲持短兵，大破魏軍。', { firstStrike: true, duelDmg: 0.1 }),
  panzhang: P('擒關羽', '伏兵臨沮，擒獲關羽。', { intimidate: 0.1, duelDmg: 0.1 }),
  zhuhuan: P('濡須督', '以寡擊眾，大破曹仁於濡須。', { garrisonDef: 0.25 }),
  zhuran: P('江陵堅守', '守江陵半年，城中疫病仍不失守。', { garrisonDef: 0.2, def: 0.1 }),
  zhangzhao: P('內事問張昭', '「內事不決問張昭，外事不決問周瑜。」', { cityStones: 0.2, citySoldiers: 0.1 }),
  zhanghong: P('建業之議', '勸孫權遷都秣陵，經營江東。', { cityStones: 0.15, contest: 0.1 }),
  zhugejin: P('雅量', '諸葛亮之兄，德度雍容。', { contest: 0.15, trade: 0.1 }),
  kanze: P('詐降書', '為黃蓋獻詐降書，膽識過人。', { craft: { talisman: 10 }, contest: 0.1 }),
  yufan: P('易學大家', '精通易學，卜筮多驗。', { exp: 0.2, breakBonus: 0.1 }),
  guyong: P('不言之相', '寡言而處事精當，為相十九年。', { cityStones: 0.2 }),
  buzhi: P('交州刺史', '鎮撫交州，南方歸心。', { citySoldiers: 0.2 }),
  lukang: P('羊陸之交', '與羊祜對峙而相敬，西陵大捷。', { garrisonDef: 0.25, siegeLead: 0.1 }),
  sunce: P('小霸王', '橫掃江東，勇冠一時。', { atk: 0.1, doubleStrike: 0.2 }),
  sunshangxiang: P('弓腰姬', '才捷剛猛，侍婢百人皆持刀侍立。', { craft: { forging: 10 }, skillDmg: 0.1 }),
  lvfan: P('財計', '典掌財計，孫策器重。', { cityStones: 0.2, trade: 0.1 }),
  heqi: P('平定山越', '討平山越，治軍嚴整，器仗精良。', { siegeLead: 0.15, craft: { forging: 5 } }),

  // ───── 魏：制度嚴整，名將守城、謀臣如雲 ─────
  xiahoudun: P('拔矢啖睛', '「父精母血，不可棄也！」', { rage: 0.3, hp: 0.1 }),
  xiahouyuan: P('虎步關右', '三日五百，六日一千，急行如風。', { firstStrike: true, siegeLead: 0.15 }),
  zhangliao: P('威震逍遙津', '八百破十萬，江東小兒聞名止啼。', { troops: 1, intimidate: 0.15 }),
  xuchu: P('虎痴', '裸衣鬥馬超，力大如牛。', { atk: 0.12, hp: 0.1, doubleStrike: 0.1 }),
  dianwei: P('古之惡來', '雙戟死戰護主，身被數十創。', { rage: 0.3, doubleStrike: 0.2 }),
  guojia: P('鬼才', '十勝十敗之論，算無遺策，可惜天不假年。', { contest: 0.2, exp: 0.2, hp: -0.15 }),
  xunyu: P('王佐之才', '居中持重，為曹操舉薦群賢。', { cityStones: 0.25, contest: 0.1 }),
  simayi: P('冢虎', '鷹視狼顧，隱忍待時。', { tribulation: 0.3, def: 0.15 }),
  xuhuang: P('長驅直入', '樊城解圍，有周亞夫之風。', { siegeLead: 0.2, def: 0.05 }),
  caoren: P('天人將軍', '堅守樊城、江陵，固若金湯。', { garrisonDef: 0.35 }),
  caohong: P('捨馬救主', '「天下可無洪，不可無君。」家資豐厚。', { cityStones: 0.15, hp: 0.1 }),
  caochun: P('虎豹騎', '統領天下驍騎，長坂追擊劉備。', { troops: 0.4, firstStrike: true }),
  caozhen: P('大將軍', '鎮守西陲，屢拒蜀軍。', { siegeLead: 0.1, garrisonDef: 0.1 }),
  caoxiu: P('千里駒', '曹操讚為「吾家千里駒」。', { firstStrike: true, atk: 0.05 }),
  yuejin: P('先登', '每戰必先登陷陣。', { troops: 0.3, firstStrike: true }),
  yujin: P('毅重', '治軍嚴整，得賊物無所私入。', { garrisonDef: 0.2, citySoldiers: 0.1 }),
  lidian: P('儒將', '好學問，敬賢士，不與諸將爭功。', { exp: 0.15, def: 0.05 }),
  zhanghe: P('巧變', '識變數，善處營陣，諸葛亮亦憚之。', { duelTaken: 0.1, siegeLead: 0.1 }),
  pangde: P('抬櫬死戰', '抬棺出戰，力戰關羽而死節。', { rage: 0.3, intimidate: 0.05 }),
  wenpin: P('江夏屏障', '鎮守江夏數十年，吳人不敢犯。', { garrisonDef: 0.25 }),
  manchong: P('合肥新城', '築合肥新城以拒吳軍。', { garrisonDef: 0.25, craft: { formation: 5 } }),
  chengyu: P('剛戾', '膽略過人，獨守鄄城以拒呂布。', { contest: 0.15, citySoldiers: 0.1 }),
  xunyou: P('十二奇策', '前後凡畫奇策十二，算無遺策。', { contest: 0.2, exp: 0.1 }),
  liuye: P('霹靂車', '造發石車破袁紹樓櫓。', { craft: { forging: 15 }, siegeLead: 0.1 }),
  zhongyao: P('楷書之祖', '書法冠絕古今，鎮撫關中。', { craft: { talisman: 15 } }),
  chenqun: P('九品中正', '創九品官人法，選賢任能。', { cityStones: 0.15, exp: 0.1 }),
  dengai: P('偷渡陰平', '鑿山開道，奇兵直取成都。', { troops: 0.4, realmSafety: 0.2 }),
  haozhao: P('陳倉之守', '千餘人守陳倉，拒諸葛亮數萬大軍二十餘日。', { troops: 1, garrisonDef: 0.1 }),
  xiahouba: P('降蜀', '父仇難忘，奔蜀為將。', { duelDmg: 0.1, atk: 0.05 }),
  caopi: P('魏文帝', '受禪稱帝，著《典論》，文采斐然。', { cityStones: 0.15, contest: 0.1 }),

  // ───── 西涼：驍騎悍將、毒士奇謀 ─────
  lvbu: P('人中呂布', '人中呂布，馬中赤兔；轅門射戟，天下無雙。', { atk: 0.15, doubleStrike: 0.3, intimidate: 0.1 }),
  huaxiong: P('斬將先鋒', '汜水關前連斬聯軍數將。', { firstStrike: true, duelDmg: 0.1 }),
  lijue: P('劫駕亂政', '挾持天子，縱兵劫掠長安。', { siegeLead: 0.1, cityStones: 0.1 }),
  guosi: P('縱兵擄掠', '與李傕相攻，關中殘破。', { citySoldiers: 0.15, atk: 0.03 }),
  zhangji: P('驃騎', '率西涼兵屯弘農。', { siegeLead: 0.1, def: 0.05 }),
  fanchou: P('西涼驍將', '追擊馬超，勇猛善戰。', { atk: 0.08, energyStart: 20 }),
  liru: P('鴆殺', '鴆殺少帝，董卓心腹謀主。', { craft: { alchemy: 15 }, poisonImmune: true }),
  jiaxu: P('亂武', '一言亂天下，卻能明哲保身、算無遺策。', { contest: 0.2, realmSafety: 0.3 }),
  xurong: P('滎陽破曹', '滎陽大破曹操、孫堅。', { troops: 0.3, siegeLead: 0.1 }),
  niufu: P('董氏女婿', '董卓女婿，屯兵陝縣。', { hp: 0.1, citySoldiers: 0.05 }),
  gaoshun: P('陷陣營', '所將七百餘兵，號為陷陣，所攻無不破。', { troops: 0.6, garrisonDef: 0.1 }),
  chengong: P('公台', '剛直烈壯，下邳城破不屈而死。', { contest: 0.15, garrisonDef: 0.1 }),
  zhangxiu: P('宛城夜襲', '夜襲曹營，典韋、曹昂戰死。', { firstStrike: true, siegeLead: 0.1 }),
  hucheer: P('盜戟', '力能負五百斤，盜走典韋雙戟。', { atk: 0.1, energyStart: 25 }),
  huzhen: P('涼州大人', '統率涼州兵馬，與呂布不和。', { citySoldiers: 0.15 }),
  duanwei: P('華陰屯田', '屯田華陰，修農事，不擾百姓。', { cityStones: 0.2, citySoldiers: 0.1 }),
  yangfeng: P('白波帥', '護送天子東歸。', { citySoldiers: 0.15, def: 0.03 }),
  hanxian: P('白波軍', '白波軍首領，縱橫河東。', { citySoldiers: 0.1, atk: 0.05 }),
  dongmin: P('董卓之弟', '仗兄勢位列高官。', { cityStones: 0.1, def: 0.05 }),
  dongyue: P('中郎將', '屯兵澠池。', { garrisonDef: 0.15 }),
  weixu: P('陷陣副將', '與高順同掌陷陣營。', { siegeLead: 0.1, def: 0.03 }),
  songxian: P('驍騎', '呂布麾下驍將。', { firstStrike: true, atk: 0.03 }),
  houcheng: P('盜馬', '追回失馬，設宴慶賀反遭責。', { trade: 0.15, energyStart: 15 }),
  zangba: P('泰山寇', '割據青徐，威震泰山。', { garrisonDef: 0.2, citySoldiers: 0.1 }),
  haomeng: P('夜叛', '夜襲呂布府邸，事敗被斬。', { rage: 0.15, firstStrike: true }),
  caoxing: P('射傷夏侯惇', '一箭射中夏侯惇左目。', { skillDmg: 0.2 }),
  diaochan: P('閉月', '連環美人計，令董卓、呂布反目。', { intimidate: 0.25, contest: 0.1, poisonImmune: true }),
  mateng: P('伏波之後', '馬援之後，雄踞西涼。', { siegeLead: 0.15, citySoldiers: 0.15 }),
  hansui: P('九曲黃河', '縱橫西涼三十餘年，老謀深算。', { contest: 0.1, garrisonDef: 0.15 }),
  wangfang: P('涼州將', '董卓部將，隨李傕攻長安。', { atk: 0.05, hp: 0.05 }),

  // ───── 方外仙人 ─────
  zuoci: P('擲杯戲曹', '擲杯化鳩，戲弄曹操，來去無蹤。', { craft: { talisman: 15 }, freezeImmune: true, tribulation: 0.4 }),
  yuji: P('符水治病', '以符水為人治病，吳會之人多事之。', { itemStamina: 0.5, poisonImmune: true, exp: 0.2 }),
  huatuo: P('神醫', '麻沸散、五禽戲，起死回生。', { craft: { alchemy: 20 }, lifesteal: 0.15, poisonImmune: true }),
  guanlu: P('卜筮如神', '精通周易，占卜無不應驗。', { breakBonus: 0.2, realmSafety: 0.3 }),
};

const EMPTY: Passive = { name: '無', flavor: '', fx: {} };

export function passiveOf(g: General): Passive {
  return PASSIVES[g.id] ?? EMPTY;
}

export function fx(g: General): PassiveFx {
  return passiveOf(g).fx;
}

const CRAFT_NAMES: Record<CraftStat, string> = { alchemy: '煉丹', forging: '煉器', talisman: '畫符', formation: '佈陣' };
const pct = (v: number) => `${v > 0 ? '+' : '−'}${Math.round(Math.abs(v) * 100)}%`;

/** 被動效果的文字說明（由數值產生，保證與實際效果一致） */
export function fxText(f: PassiveFx): string {
  const t: string[] = [];
  if (f.atk) t.push(`武力 ${pct(f.atk)}`);
  if (f.def) t.push(`防禦 ${pct(f.def)}`);
  if (f.hp) t.push(`血量 ${pct(f.hp)}`);
  for (const [k, v] of Object.entries(f.craft ?? {})) t.push(`${CRAFT_NAMES[k as CraftStat]} +${v}`);
  if (f.duelDmg) t.push(`擂台傷害 ${pct(f.duelDmg)}`);
  if (f.duelTaken) t.push(`擂台受傷 ${pct(-f.duelTaken)}`);
  if (f.energyStart) t.push(`擂台開場能量 ${f.energyStart}%`);
  if (f.energyGain) t.push(`攻擊額外能量 +${f.energyGain}`);
  if (f.skillDmg) t.push(`功法技能傷害 ${pct(f.skillDmg)}`);
  if (f.rage) t.push(`血量低於一半時傷害 ${pct(f.rage)}`);
  if (f.lifesteal) t.push(`傷害吸血 ${pct(f.lifesteal)}`);
  if (f.intimidate) t.push(`擂台上敵將武力 ${pct(-f.intimidate)}`);
  if (f.firstStrike) t.push('擂台必定先手');
  if (f.doubleStrike) t.push(`擂台攻擊 ${Math.round(f.doubleStrike * 100)}% 機率連擊`);
  if (f.troops) t.push(f.troops >= 1 ? `作戰時兵力 ×${1 + f.troops}` : `作戰時兵力 ${pct(f.troops)}`);
  if (f.poisonImmune) t.push('百毒不侵');
  if (f.freezeImmune) t.push('不受定身');
  if (f.siegeLead) t.push(`攻城統率 ${pct(f.siegeLead)}`);
  if (f.garrisonDef) t.push(`駐守時守城戰力 ${pct(f.garrisonDef)}`);
  if (f.cityStones) t.push(`駐守城池靈石收入 ${pct(f.cityStones)}`);
  if (f.citySoldiers) t.push(`駐守城池士兵收入 ${pct(f.citySoldiers)}`);
  if (f.exp) t.push(`修為獲得 ${pct(f.exp)}`);
  if (f.breakBonus) t.push(`低階突破率 ${pct(f.breakBonus)}`);
  if (f.tribulation) t.push(`雷劫傷害 ${pct(-f.tribulation)}`);
  if (f.realmSafety) t.push(`秘境、仙山隕落率 ${pct(-f.realmSafety)}`);
  if (f.trade) t.push(`海外貿易獲利 ${pct(f.trade)}`);
  if (f.itemStamina) t.push(`使用物品體力 ${pct(-f.itemStamina)}`);
  if (f.contest) t.push(`比試得分 ${pct(f.contest)}`);
  return t.join('・');
}
