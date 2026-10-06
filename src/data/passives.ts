import type { CraftStat, General, GameState, LordId } from '../game/types';

/** 被動效果：數值皆為比例（0.15 = +15%），技藝為點數 */
export interface PassiveFx {
  dodge?: number; maxStamina?: number; staminaRecovery?: number;
  keepFormation?: number; keepTalisman?: number; keepArtifact?: number; keepPill?: number;
  upgradeFormation?: number; upgradeTalisman?: number;
  companion?: string[]; synergyTarget?: string; synergyStats?: number; synergyForce?: number; synergyExp?: number; synergyStones?: number; synergySoldiers?: number;
  partyTarget?: string; partyCrit?: number; partyLordExp?: number; partyExp?: number; partyRecruit?: number; partyTreasure?: number; partyToll?: number;
  allStats?: number; soldierDiscount?: number; fixedParty?: boolean; realmFactor?: number; tribulationSuccess?: boolean; duelImmortal?: boolean; recruitLimit?: number; cityCountToll?: number; cityToll?: number; reviveEnemyIntact?: boolean; ignoreWounded?: boolean;
  partyItemBlock?: boolean; produceCategory?: string; reviveAbility?: boolean; divination?: boolean; hiddenSlots?: number; unlockHidden?: boolean; freeRevive?: boolean; seclusionAbility?: boolean; ghostAbility?: boolean;

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
  /** 擂台爆擊機率（基礎只有 3%；爆擊傷害 ×1.5） */
  crit?: number;
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
  /** 秘境隕落率降低 */
  realmSafety?: number;
  /** 使用物品的體力消耗降低 */
  itemStamina?: number;
  /** 煉丹煉器畫符佈陣比試得分 */
  contest?: number;
}

export interface Passive {
  effectText?: string;
  name: string;
  flavor: string;
  fx: PassiveFx;
}

/** Complete replacement from the edited general sheet. */
export const PASSIVES: Record<string, Passive> = {
  liubei: {"name":"仁德","flavor":"以仁義得人心，三顧茅廬、桃園結義，君臣魚水。","effectText":"士兵購買價格 -0.5下品靈石","fx":{"soldierDiscount":0.5}},
  guanyu: {"name":"武聖","flavor":"威震華夏，溫酒斬華雄；刮骨療毒而面不改色。過五關斬六將。","effectText":"擂台攻擊 15% 機率連擊・百毒不侵","fx":{"doubleStrike":0.15,"poisonImmune":true}},
  zhangfei: {"name":"萬人敵","flavor":"據水斷橋，瞋目橫矛，曹軍無敢近者。暴而無恩，不擅鬥智。","effectText":"血量低於一半時傷害 +30%","fx":{"rage":0.3}},
  zhaoyun: {"name":"一身是膽","flavor":"長坂坡七進七出，渾身是膽。進退有度，攻守兼備。","effectText":"擂台閃避機率+10%","fx":{"dodge":0.1}},
  zhugeliang: {"name":"臥龍","flavor":"鞠躬盡瘁，八陣圖困敵，借東風、禳星斗。然體弱積勞。","effectText":"使用陣法時，15% 機率不消耗陣法・最大體力-10","fx":{"keepFormation":0.15,"maxStamina":-10}},
  huangzhong: {"name":"老當益壯","flavor":"定軍山一戰陣斬夏侯淵，百步穿楊，箭無虛發。年事已高，體力不濟。","effectText":"爆擊機率 +12%","fx":{"crit":0.12}},
  machao: {"name":"錦馬超","flavor":"西涼鐵騎渭水破曹，割鬚棄袍。銳於進取，疏於防守。","effectText":"防禦 −5%・武力 +10%・擂台必定先手","fx":{"def":-0.05,"atk":0.1,"firstStrike":true}},
  weiyan: {"name":"鎮守漢中","flavor":"「若曹操舉天下而來，請為大王拒之。」性矜高，人多不與。","effectText":"駐守時守城戰力 +20%","fx":{"garrisonDef":0.2}},
  pangtong: {"name":"鳳雛","flavor":"與臥龍齊名，獻連環之計。不拘小節，身子單薄。","effectText":"使用符籙時，15% 機率不消耗符籙・最大體力-10","fx":{"keepTalisman":0.15,"maxStamina":-10}},
  jiangwei: {"name":"幼麟","flavor":"承丞相遺志，九伐中原，文武兼資。","effectText":"與\"諸葛亮\"派遣到同一城池時，姜維所有能力+20%","fx":{"companion":["zhugeliang"],"synergyTarget":"jiangwei","synergyStats":0.2}},
  fazheng: {"name":"謀主","flavor":"策劃定軍山，奇畫策算，睚眥必報。","effectText":"駐守時城池過路費 +15%","fx":{"cityToll":0.15}},
  madai: {"name":"伏兵斬將","flavor":"「誰敢殺我？」應聲斬魏延於馬下。","effectText":"擂台必定先手","fx":{"firstStrike":true}},
  guanping: {"name":"隨父征戰","flavor":"追隨關羽轉戰荊襄，忠勇不二。","effectText":"與\"關羽\"派遣到同一城池時，關平所有能力+20%","fx":{"companion":["guanyu"],"synergyTarget":"guanping","synergyStats":0.2}},
  maliang: {"name":"白眉","flavor":"馬氏五常，白眉最良；安撫五溪蠻夷。","effectText":"駐守城池士兵收入 +20%","fx":{"citySoldiers":0.2}},
  jianyong: {"name":"談笑風生","flavor":"優游風議，性簡傲跌宕。","effectText":"在隨行隊伍時，聽風樓招募武將價格 -20%","fx":{"partyRecruit":0.2}},
  mizhu: {"name":"富甲一方","flavor":"家資鉅億，傾家資助劉備；不諳武事。","effectText":"駐守城池靈石收入 +20%","fx":{"cityStones":0.2}},
  liushan: {"name":"扶不起的阿斗","flavor":"「此間樂，不思蜀。」","effectText":"固定為隨行將領・境界加乘為原本的兩倍，渡劫必定成功・擂台戰不會陣亡","fx":{"fixedParty":true,"realmFactor":2,"tribulationSuccess":true,"duelImmortal":true}},
  guanxing: {"name":"青龍傳人","flavor":"承父親青龍刀法，少年英武。","effectText":"與\"關羽\"派遣到同一城池時，關興修煉速度+20%","fx":{"companion":["guanyu"],"synergyTarget":"guanxing","synergyExp":0.2}},
  zhangbao: {"name":"虎父無犬子","flavor":"丈八蛇矛，勇猛不遜其父，惜早逝。","effectText":"與\"張飛\"派遣到同一城池時，張苞所有能力+20%","fx":{"companion":["zhangfei"],"synergyTarget":"zhangbao","synergyStats":0.2}},
  wangping: {"name":"街亭良將","flavor":"馬謖失街亭，唯王平所部全師而還。","effectText":"駐守時守城戰力 +20%","fx":{"garrisonDef":0.2}},
  liaohua: {"name":"蜀中先鋒","flavor":"歷經數十年征戰，壽考而終。","effectText":"秘境隕落率 −30%","fx":{"realmSafety":0.3}},
  yanyan: {"name":"斷頭將軍","flavor":"「但有斷頭將軍，無有降將軍也。」","effectText":"駐守時守城戰力 +20%","fx":{"garrisonDef":0.2}},
  huangquan: {"name":"忠貞不二","flavor":"進退不失其節，曹丕亦敬重之。","effectText":"在隨行隊伍時，過路費 -10%","fx":{"partyToll":0.1}},
  liyan: {"name":"託孤重臣","flavor":"與諸葛亮同受託孤，督辦糧運，然好自矜。","effectText":"駐守城池靈石收入 +15%・駐守城池士兵收入 +15%","fx":{"cityStones":0.15,"citySoldiers":0.15}},
  masu: {"name":"紙上談兵","flavor":"才器過人，好論軍計，卻失守街亭。","effectText":"駐守時守城戰力 −15%・比試得分 +40%","fx":{"garrisonDef":-0.15,"contest":0.4}},
  jiangwan: {"name":"社稷之器","flavor":"諸葛亮之後總攬國事，方整有威重。","effectText":"駐守城池靈石收入 +15%・駐守城池士兵收入 +15%","fx":{"cityStones":0.15,"citySoldiers":0.15}},
  feiyi: {"name":"舉重若輕","flavor":"處理政務過目不忘，談笑間決斷。","effectText":"使用物品體力 −40%","fx":{"itemStamina":0.4}},
  sunqian: {"name":"出使四方","flavor":"奉使袁紹、劉表，善於應對。","effectText":"秘境隕落率 −30%","fx":{"realmSafety":0.3}},
  yiji: {"name":"機捷","flavor":"出使東吳，應對機敏，孫權嘆服。","effectText":"秘境隕落率 −30%","fx":{"realmSafety":0.3}},
  zhoucang: {"name":"扛刀","flavor":"為關羽扛刀，力能負重千里。","effectText":"擂台戰不會陣亡","fx":{"duelImmortal":true}},
  chendao: {"name":"白毦統領","flavor":"統領白毦精兵，名位亞於趙雲，永安督守。","effectText":"作戰時兵力 +10%・駐守時守城戰力 +10%","fx":{"troops":0.1,"garrisonDef":0.1}},
  liufeng: {"name":"螟蛉義子","flavor":"劉備義子，勇武而剛愎，終失蜀中人心。","effectText":"擂台上敵將武力 −5%・駐守時守城戰力 -10%","fx":{"intimidate":0.05,"garrisonDef":-0.1}},
  mengda: {"name":"反覆無常","flavor":"先降劉備，復歸曹魏，終再叛而敗。","effectText":"擂台必定先手","fx":{"firstStrike":true}},
  dengzhi: {"name":"出使東吳","flavor":"孫權稱其「和合二國，唯有鄧芝」。","effectText":"秘境隕落率 −20%・比試得分 +15%","fx":{"realmSafety":0.2,"contest":0.15}},
  menghuo: {"name":"南蠻王","flavor":"諸葛亮七擒七縱而心服，驍勇善戰，統率蠻兵。","effectText":"作戰時兵力 +25%・比試得分 −30%","fx":{"troops":0.25,"contest":-0.3}},
  zhurongfuren: {"name":"飛刀","flavor":"南蠻女將，善使飛刀，百發百中，與孟獲並肩作戰。","effectText":"與\"孟獲\"派遣到同一城池時，祝融夫人所有能力+20%","fx":{"companion":["menghuo"],"synergyTarget":"zhurongfuren","synergyStats":0.2}},
  huangyueying: {"name":"巧婦","flavor":"諸葛亮之妻，才智巧思過人，木牛流馬之圖出自其手。","effectText":"使用法器時，15% 機率不消耗法器・最大體力-10","fx":{"keepArtifact":0.15,"maxStamina":-10}},
  shamoke: {"name":"五溪蠻王","flavor":"率五溪蠻兵助劉備伐吳，驍勇善射，終死於陣前。","effectText":"作戰時兵力 +20%","fx":{"troops":0.2}},
  guansuo: {"name":"花關索","flavor":"傳說中的關羽三子，隨諸葛亮南征，武藝不凡。","effectText":"擂台攻擊 10% 機率連擊","fx":{"doubleStrike":0.1}},
  mifang: {"name":"開城獻荊","flavor":"降吳獻江陵，使關羽腹背受敵；貪生而失節。","effectText":"駐守時守城戰力 −50%・駐守城池靈石收入 +30%","fx":{"garrisonDef":-0.5,"cityStones":0.3}},
  zhugezhan: {"name":"綿竹死節","flavor":"諸葛亮之子，在綿竹迎戰鄧艾，父子皆死國事。","effectText":"駐守時守城戰力 +15%","fx":{"garrisonDef":0.15}},
  zhangxingcai: {"name":"虎女","flavor":"張飛之女，傳說中隨軍北伐，繼承父親豪勇。","effectText":"血量低於一半時傷害 +15%","fx":{"rage":0.15}},
  sunquan: {"name":"碧眼紫髯","flavor":"坐斷東南戰未休，善用人才，能屈能伸。","effectText":"每次進入聽風樓時，可選擇兩位武將招募","fx":{"recruitLimit":2}},
  zhouyu: {"name":"赤壁火攻","flavor":"羽扇綸巾，談笑間檣櫓灰飛煙滅。曲有誤，周郎顧。","effectText":"使用陣法時，30% 機率高一階","fx":{"upgradeFormation":0.3}},
  lusu: {"name":"榻上策","flavor":"鼎足江東之策，為孫權定大計；性好施，家財散盡。","effectText":"在隨行隊伍時，天寶商行購買價格 -15%","fx":{"partyTreasure":0.15}},
  lvmeng: {"name":"白衣渡江","flavor":"士別三日，當刮目相待。","effectText":"修為獲得 +30%","fx":{"exp":0.3}},
  luxun: {"name":"火燒連營","flavor":"夷陵一把火，燒退劉備七百里連營。","effectText":"使用符籙時，15% 機率不消耗符籙・最大體力-10","fx":{"keepTalisman":0.15,"maxStamina":-10}},
  ganning: {"name":"百騎劫營","flavor":"錦帆賊出身，率百騎夜襲曹營無一損傷。","effectText":"擂台閃避機率+10%","fx":{"dodge":0.1}},
  taishici: {"name":"信義篤烈","flavor":"神亭與孫策酣鬥，一諾千金，弓馬絕倫。","effectText":"攻擊額外能量 +10・擂台攻擊 10% 機率連擊","fx":{"energyGain":10,"doubleStrike":0.1}},
  huanggai: {"name":"苦肉計","flavor":"受杖詐降，火攻赤壁，老當益壯。","effectText":"血量 +20%・百毒不侵","fx":{"hp":0.2,"poisonImmune":true}},
  zhoutai: {"name":"不屈","flavor":"捨身護主，身被十二創而不退。","effectText":"擂台受傷 −15%","fx":{"duelTaken":0.15}},
  chengpu: {"name":"江東元老","flavor":"歷事孫堅三代，眾人皆呼程公。","effectText":"在隨行隊伍時，主公修練速度 +20%","fx":{"partyLordExp":0.2}},
  lingtong: {"name":"國士","flavor":"逍遙津死戰護主，部曲盡沒。","effectText":"擂台受傷 −15%","fx":{"duelTaken":0.15}},
  handang: {"name":"宿將","flavor":"隨孫氏三代征戰，弓馬嫻熟，善於督軍。","effectText":"攻城統率 +15%","fx":{"siegeLead":0.15}},
  zhangzhao: {"name":"內事問張昭","flavor":"「內事不決問張昭，外事不決問周瑜。」","effectText":"駐守城池靈石收入 +15%・駐守城池士兵收入 +15%","fx":{"cityStones":0.15,"citySoldiers":0.15}},
  zhugejin: {"name":"雅量","flavor":"諸葛亮之兄，德度雍容，長於調和。","effectText":"在隨行隊伍時，過路費 -10%","fx":{"partyToll":0.1}},
  xusheng: {"name":"疑城計","flavor":"於建業江邊立假城，曹丕望而退兵。","effectText":"駐守時守城戰力 +20%","fx":{"garrisonDef":0.2}},
  zhuran: {"name":"江陵堅守","flavor":"守江陵半年，城中疫病仍不失守。","effectText":"駐守時守城戰力 +30%・駐守城池士兵收入 -10%","fx":{"garrisonDef":0.3,"citySoldiers":-0.1}},
  jiangqin: {"name":"水軍都督","flavor":"江上作戰經驗老到，生活簡樸。","effectText":"秘境隕落率 −30%","fx":{"realmSafety":0.3}},
  dingfeng: {"name":"雪中奮短兵","flavor":"雪中棄甲持短兵，大破魏軍。","effectText":"防禦 −5%・爆擊機率 +10%","fx":{"def":-0.05,"crit":0.1}},
  panzhang: {"name":"擒關羽","flavor":"伏兵臨沮，擒獲關羽；性奢侈好財。","effectText":"擂台傷害 +25%・駐守城池靈石收入 −10%","fx":{"duelDmg":0.25,"cityStones":-0.1}},
  zhuhuan: {"name":"濡須督","flavor":"以寡擊眾，大破曹仁於濡須。","effectText":"駐守時守城戰力 +25%","fx":{"garrisonDef":0.25}},
  yufan: {"name":"易學大家","flavor":"精通易學，卜筮多驗；性疏直，數犯顏。","effectText":"防禦 −5%・修為獲得 +20%","fx":{"def":-0.05,"exp":0.2}},
  guyong: {"name":"不言之相","flavor":"寡言而處事精當，為相十九年。","effectText":"駐守城池靈石收入 +20%","fx":{"cityStones":0.2}},
  lukang: {"name":"羊陸之交","flavor":"與羊祜對峙而相敬，西陵大捷。","effectText":"駐守時守城戰力 +20%","fx":{"garrisonDef":0.2}},
  sunce: {"name":"小霸王","flavor":"橫掃江東，勇冠一時，卻死於刺客之手。","effectText":"防禦 −10%・爆擊機率 +10%・擂台攻擊 10% 機率連擊","fx":{"def":-0.1,"crit":0.1,"doubleStrike":0.1}},
  sunshangxiang: {"name":"弓腰姬","flavor":"才捷剛猛，侍婢百人皆持刀侍立。","effectText":"功法技能傷害 +30%・擂台必定先手・爆擊機率 +5%","fx":{"skillDmg":0.3,"firstStrike":true,"crit":0.05}},
  lvfan: {"name":"財計","flavor":"典掌財計，孫策器重。","effectText":"駐守城池靈石收入 +20%","fx":{"cityStones":0.2}},
  heqi: {"name":"平定山越","flavor":"討平山越，治軍嚴整，器仗精良。","effectText":"攻城統率 +15%","fx":{"siegeLead":0.15}},
  sunjian: {"name":"江東猛虎","flavor":"破虜將軍，身先士卒，勇冠三軍，惜早歿於峴山。","effectText":"與\"孫策\"派遣到同一城池時，雙方所有能力+10%","fx":{"companion":["sunce"],"synergyTarget":"both","synergyStats":0.1}},
  bulianshi: {"name":"寬容賢妃","flavor":"孫權寵妃，性不妒忌，進言保全忠良。","effectText":"在隨行隊伍時，主公修煉速度 +10%","fx":{"partyLordExp":0.1}},
  daqiao: {"name":"國色","flavor":"孫策之妻，國色天香，與周瑜家眷同居江東。","effectText":"與\"孫策\"派遣到同一城池時，孫策所有能力+20%","fx":{"companion":["sunce"],"synergyTarget":"sunce","synergyStats":0.2}},
  xiaoqiao: {"name":"周郎之妻","flavor":"嫁周瑜為妻，國色流離，曲有誤，周郎顧。","effectText":"與\"周瑜\"派遣到同一城池時，周瑜所有能力+20%","fx":{"companion":["zhouyu"],"synergyTarget":"zhouyu","synergyStats":0.2}},
  zhugeke: {"name":"才捷","flavor":"諸葛瑾之子，辯才無礙，權勢過盛而剛愎。","effectText":"比試得分 +20%","fx":{"contest":0.2}},
  sunjiao: {"name":"皓首督江","flavor":"孫權堂弟，鎮守夏口，輕財好施，與士卒同甘苦。","effectText":"駐守城池士兵收入 +20%","fx":{"citySoldiers":0.2}},
  zhoufang: {"name":"斷髮詐降","flavor":"鄱陽太守，斷髮謝罪，詐降曹休，誘魏軍入石亭大敗。","effectText":"駐守時守城戰力 +20%","fx":{"garrisonDef":0.2}},
  lukai: {"name":"直諫之臣","flavor":"陸遜族子，敢於犯顏直諫，歷任丞相而不改其志。","effectText":"與\"陸遜\"派遣到同一城池時，陸遜所有能力+20%","fx":{"companion":["luxun"],"synergyTarget":"luxun","synergyStats":0.2}},
  wuguotai: {"name":"國太","flavor":"孫堅之妻，孫策、孫權之母，江東內政重臣，說服孫權與劉備聯姻。","effectText":"在隨行隊伍時，主公修煉速度 +10%","fx":{"partyLordExp":0.1}},
  sunluban: {"name":"大虎","flavor":"孫權長女，嫁周瑜之子周循又嫁全琮，宮中權勢頗盛。","effectText":"駐守城池靈石收入 +20%","fx":{"cityStones":0.2}},
  zhuzhi: {"name":"孫氏舊臣","flavor":"孫堅舊部，歷事孫氏三代，輔佐孫策平定江東。","effectText":"與\"孫策\"派遣到同一城池時，孫策所有能力+10%","fx":{"companion":["sunce"],"synergyTarget":"sunce","synergyStats":0.1}},
  sundeng: {"name":"東宮太子","flavor":"孫權長子，仁愛謙和，與將士同甘苦，惜英年早逝。","effectText":"駐守城池士兵收入 +20%","fx":{"citySoldiers":0.2}},
  liuzan: {"name":"折衝斷後","flavor":"吳將，晚年猶多戰功，在逍遙津之後，戰死前仍高呼拒敵。","effectText":"血量低於一半時傷害 +15%","fx":{"rage":0.15}},
  caocao: {"name":"治世能臣","flavor":"寧教我負天下人，休教天下人負我；唯才是舉，挾天子以令諸侯。","effectText":"每占領一座城池，城池過路費 +5%","fx":{"cityCountToll":0.05}},
  xiahoudun: {"name":"拔矢啖睛","flavor":"「父精母血，不可棄也！」","effectText":"血量低於一半時傷害 +30%","fx":{"rage":0.3}},
  xiahouyuan: {"name":"虎步關右","flavor":"三日五百，六日一千，急行如風。勇而少謀，終敗於定軍山。","effectText":"攻擊額外能量 +10・擂台必定先手・爆擊機率 +8%","fx":{"energyGain":10,"firstStrike":true,"crit":0.08}},
  zhangliao: {"name":"威震逍遙津","flavor":"八百破十萬，江東小兒聞名止啼。","effectText":"擂台上敵將武力 −15%","fx":{"intimidate":0.15}},
  xuchu: {"name":"虎痴","flavor":"裸衣鬥馬超，力大如牛；有勇少謀。","effectText":"武力 +10%・秘境隕落率 +20%・擂台攻擊 10% 機率連擊","fx":{"atk":0.1,"realmSafety":-0.2,"doubleStrike":0.1}},
  dianwei: {"name":"古之惡來","flavor":"雙戟死戰護主，身被數十創。","effectText":"在隨行隊伍時，主公修煉速度 +10%","fx":{"partyLordExp":0.1}},
  guojia: {"name":"鬼才","flavor":"十勝十敗之論，算無遺策，可惜天不假年。","effectText":"比試得分 +30%","fx":{"contest":0.3}},
  xunyu: {"name":"王佐之才","flavor":"居中持重，為曹操舉薦群賢。","effectText":"在隨行隊伍時，聽風樓招募武將價格 -20%","fx":{"partyRecruit":0.2}},
  xuhuang: {"name":"長驅直入","flavor":"樊城解圍，有周亞夫之風。治軍嚴整。","effectText":"駐守城池士兵收入 +20%・攻城統率 +15%","fx":{"citySoldiers":0.2,"siegeLead":0.15}},
  caoren: {"name":"天人將軍","flavor":"堅守樊城、江陵，固若金湯。","effectText":"駐守時守城戰力 +30%","fx":{"garrisonDef":0.3}},
  zhanghe: {"name":"巧變","flavor":"識變數，善處營陣，諸葛亮亦憚之。","effectText":"使用陣法時，5% 機率不消耗陣法","fx":{"keepFormation":0.05}},
  chengyu: {"name":"剛戾","flavor":"膽略過人，獨守鄄城以拒呂布；為人剛戾，多與人忤。","effectText":"駐守時守城戰力 +15%・駐守城池士兵收入 +15%","fx":{"garrisonDef":0.15,"citySoldiers":0.15}},
  xunyou: {"name":"十二奇策","flavor":"前後凡畫奇策十二，算無遺策，外愚內智。","effectText":"比試得分 +20%","fx":{"contest":0.2}},
  yujin: {"name":"毅重","flavor":"治軍嚴整，得賊物無所私入；晚節不保。","effectText":"駐守時守城戰力 +15%・駐守城池士兵收入 +15%","fx":{"garrisonDef":0.15,"citySoldiers":0.15}},
  yuejin: {"name":"先登","flavor":"每戰必先登陷陣，身被數十創。","effectText":"擂台必定先手・作戰時兵力 +20%","fx":{"firstStrike":true,"troops":0.2}},
  caohong: {"name":"捨馬救主","flavor":"「天下可無洪，不可無君。」家資豐厚，性吝嗇。","effectText":"在隨行隊伍時，天寶商行購買價格 -15%","fx":{"partyTreasure":0.15}},
  simayi: {"name":"冢虎","flavor":"鷹視狼顧，隱忍待時。","effectText":"使用丹藥時，15% 機率不消耗丹藥・最大體力-10","fx":{"keepPill":0.15,"maxStamina":-10}},
  caozhen: {"name":"大將軍","flavor":"鎮守西陲，屢拒蜀軍。","effectText":"駐守時守城戰力 +20%","fx":{"garrisonDef":0.2}},
  lidian: {"name":"儒將","flavor":"好學問，敬賢士，不與諸將爭功。","effectText":"修為獲得 +20%・比試得分 +15%","fx":{"exp":0.2,"contest":0.15}},
  pangde: {"name":"抬櫬死戰","flavor":"抬棺出戰，力戰關羽而死節。","effectText":"血量低於一半時傷害 +15%・擂台上敵將武力 −10%","fx":{"rage":0.15,"intimidate":0.1}},
  wenpin: {"name":"江夏屏障","flavor":"鎮守江夏數十年，吳人不敢犯。","effectText":"駐守時守城戰力 +20%","fx":{"garrisonDef":0.2}},
  manchong: {"name":"合肥新城","flavor":"築合肥新城以拒吳軍，執法嚴明。","effectText":"駐守時守城戰力 +15%・駐守城池士兵收入 +15%","fx":{"garrisonDef":0.15,"citySoldiers":0.15}},
  zhongyao: {"name":"楷書之祖","flavor":"書法冠絕古今，鎮撫關中，符籙精妙。","effectText":"使用符籙時，15% 機率不消耗符籙・最大體力-10","fx":{"keepTalisman":0.15,"maxStamina":-10}},
  chenqun: {"name":"九品中正","flavor":"創九品官人法，選賢任能。","effectText":"駐守城池靈石收入 +20%","fx":{"cityStones":0.2}},
  dengai: {"name":"偷渡陰平","flavor":"鑿山開道，奇兵直取成都；口吃，不善爭辯。","effectText":"作戰時兵力 +25%・比試得分 −10%","fx":{"troops":0.25,"contest":-0.1}},
  haozhao: {"name":"陳倉之守","flavor":"千餘人守陳倉，拒諸葛亮數萬大軍二十餘日。","effectText":"駐守時守城戰力 +20%・駐守城池士兵收入 +20%","fx":{"garrisonDef":0.2,"citySoldiers":0.2}},
  caopi: {"name":"魏文帝","flavor":"受禪稱帝，著《典論》，文采斐然。","effectText":"比試得分 +25%","fx":{"contest":0.25}},
  caozhang: {"name":"黃鬚兒","flavor":"徒手搏猛獸，臂力過人，不好讀書。","effectText":"武力 +15%・修為獲得 -20%","fx":{"atk":0.15,"exp":-0.2}},
  caoang: {"name":"宛城之殤","flavor":"曹操長子，宛城夜襲讓馬救父而死。","effectText":"在隨行隊伍時，主公修煉速度 +10%","fx":{"partyLordExp":0.1}},
  xushu: {"name":"走馬薦諸葛","flavor":"先事劉備，後歸曹操，終身不為之出一謀。","effectText":"修為獲得 +20%","fx":{"exp":0.2}},
  zhonghui: {"name":"才能兼備","flavor":"少有才名，伐蜀有功，志大而終敗。","effectText":"修為獲得 +20%","fx":{"exp":0.2}},
  simazhao: {"name":"司馬昭之心","flavor":"路人皆知；執掌魏朝大權，隱忍有度。","effectText":"駐守城池士兵收入 +30%","fx":{"citySoldiers":0.3}},
  caozhi: {"name":"七步成詩","flavor":"才高八斗，「本是同根生，相煎何太急」。","effectText":"比試得分 +25%","fx":{"contest":0.25}},
  simashi: {"name":"隱忍","flavor":"司馬懿長子，沉毅有大略，輔佐父弟執掌魏政。","effectText":"駐守城池士兵收入 +20%・駐守時城池過路費 +10%","fx":{"citySoldiers":0.2,"cityToll":0.1}},
  caiwenji: {"name":"胡笳十八拍","flavor":"才女蔡琰，流落南匈奴，後歸漢，著《悲憤詩》。","effectText":"比試得分 +25%","fx":{"contest":0.25}},
  zhenji: {"name":"洛神","flavor":"曹植《洛神賦》中的原型，才貌雙全，嫁曹丕為后。","effectText":"比試得分 +25%","fx":{"contest":0.25}},
  xuyou: {"name":"官渡之變","flavor":"叛袁投曹，獻奇襲烏巢之計，恃功而驕終被殺。","effectText":"使用物品體力 −40%","fx":{"itemStamina":0.4}},
  jianggan: {"name":"盜書","flavor":"自詡才辯，赤壁前往周瑜營中勸降，反中反間計。","effectText":"秘境隕落率 −30%","fx":{"realmSafety":0.3}},
  niujin: {"name":"逃軍斬","flavor":"曹魏猛將，以少擊多，以八百騎破敵數千。","effectText":"攻城統率 +10%・作戰時兵力 +15%","fx":{"siegeLead":0.1,"troops":0.15}},
  wangshuang: {"name":"流星錘","flavor":"魏軍猛將，善使流星錘，連斬蜀將，終為魏延所殺。","effectText":"擂台攻擊 10% 機率連擊","fx":{"doubleStrike":0.1}},
  dongzhuo: {"name":"暴虐太師","flavor":"廢立天子，火燒洛陽，西涼鐵騎橫行，殘暴失人心。","effectText":"百草堂復活敵方陣營武將時，血量 100%、境界不變，修為不變","fx":{"reviveEnemyIntact":true}},
  lvbu: {"name":"人中呂布","flavor":"人中呂布，馬中赤兔；轅門射戟，天下無雙，然反覆無義。","effectText":"擂台戰時無視血量低於25%時的免傷效果","fx":{"ignoreWounded":true}},
  huaxiong: {"name":"斬將先鋒","flavor":"汜水關前連斬聯軍數將，終為關羽所斬。","effectText":"擂台攻擊 15% 機率連擊","fx":{"doubleStrike":0.15}},
  lijue: {"name":"劫駕亂政","flavor":"挾持天子，縱兵劫掠長安。","effectText":"與\"郭汜\"派遣到同一城池時，駐守城池靈石收入 +35%","fx":{"companion":["guosi"],"synergyStones":0.35}},
  guosi: {"name":"縱兵擄掠","flavor":"與李傕相攻，關中殘破。","effectText":"與\"李傕\"派遣到同一城池時，駐守城池士兵收入 +35%","fx":{"companion":["lijue"],"synergySoldiers":0.35}},
  liru: {"name":"鴆殺","flavor":"鴆殺少帝，董卓心腹謀主。","effectText":"在隨行隊伍時，主公修煉速度 +10%","fx":{"partyLordExp":0.1}},
  jiaxu: {"name":"亂武","flavor":"一言亂天下，卻能明哲保身、算無遺策。","effectText":"使用符籙時，30% 機率高一階・最大體力-10","fx":{"upgradeTalisman":0.3,"maxStamina":-10}},
  xurong: {"name":"滎陽破曹","flavor":"滎陽大破曹操、孫堅。","effectText":"作戰時兵力 +20%・攻城統率 +10%","fx":{"troops":0.2,"siegeLead":0.1}},
  gaoshun: {"name":"陷陣營","flavor":"所將七百餘兵，號為陷陣，所攻無不破；為人清白有威嚴。","effectText":"作戰時兵力 +30%","fx":{"troops":0.3}},
  chengong: {"name":"公台","flavor":"剛直烈壯，下邳城破不屈而死。","effectText":"比試得分 +25%","fx":{"contest":0.25}},
  zhangji: {"name":"驃騎","flavor":"率西涼兵屯弘農，兵多而少約束。","effectText":"駐守城池士兵收入 +20%","fx":{"citySoldiers":0.2}},
  zhangxiu: {"name":"宛城夜襲","flavor":"夜襲曹營，典韋、曹昂戰死；納賈詡之謀。","effectText":"擂台必定先手","fx":{"firstStrike":true}},
  hucheer: {"name":"盜戟","flavor":"力能負五百斤，盜走典韋雙戟。","effectText":"擂台開場能量 100%","fx":{"energyStart":100}},
  diaochan: {"name":"閉月","flavor":"連環美人計，令董卓、呂布反目。","effectText":"在隨行隊伍時，若隨行隊伍裡有\"呂布\"，則呂布暴擊率 +5%","fx":{"partyTarget":"lvbu","partyCrit":0.05}},
  zangba: {"name":"泰山寇","flavor":"割據青徐，威震泰山。","effectText":"駐守時守城戰力 +20%・駐守城池士兵收入 +10%","fx":{"garrisonDef":0.2,"citySoldiers":0.1}},
  mateng: {"name":"伏波之後","flavor":"馬援之後，雄踞西涼。","effectText":"駐守城池士兵收入 +20%","fx":{"citySoldiers":0.2}},
  hansui: {"name":"九曲黃河","flavor":"縱橫西涼三十餘年，老謀深算。","effectText":"擂台開場能量 100%","fx":{"energyStart":100}},
  lisu: {"name":"赤兔說降","flavor":"以赤兔馬與金珠說呂布殺丁原，巧舌如簧。","effectText":"在隨行隊伍時，天寶商行購買價格 -15%","fx":{"partyTreasure":0.15}},
  yanxing: {"name":"閻行擲矛","flavor":"韓遂部將，與馬超單挑，一矛折馬超矛。","effectText":"擂台傷害 +10%","fx":{"duelDmg":0.1}},
  chenggongying: {"name":"韓遂謀主","flavor":"勸韓遂割據涼州，屢獻奇策。","effectText":"秘境隕落率 −30%","fx":{"realmSafety":0.3}},
  zhanglu: {"name":"五斗米道","flavor":"雄踞漢中，以符水治病、設義舍施米肉。","effectText":"使用丹藥時，15% 機率不消耗丹藥・最大體力-10","fx":{"keepPill":0.15,"maxStamina":-10}},
  yanliang: {"name":"河北上將","flavor":"袁紹麾下第一勇將，白馬一戰先登，卻輕敵被關羽所斬。","effectText":"與\"文丑\"派遣到同一城池時，顏良武力+15%","fx":{"companion":["wenchou"],"synergyTarget":"yanliang","synergyForce":0.15}},
  wenchou: {"name":"河北名將","flavor":"與顏良並稱，延津追擊曹軍，終為曹軍所殺。","effectText":"與\"顏良\"派遣到同一城池時，文丑武力+15%","fx":{"companion":["yanliang"],"synergyTarget":"wenchou","synergyForce":0.15}},
  jiling: {"name":"轅門射戟","flavor":"袁術大將，統兵十萬攻小沛，卻遇呂布轅門射戟。","effectText":"作戰時兵力 +20%","fx":{"troops":0.2}},
  juyi: {"name":"先登死士","flavor":"袁紹麾下，以八百先登死士大破公孫瓚白馬義從。","effectText":"作戰時兵力 +20%","fx":{"troops":0.2}},
  jushou: {"name":"監軍","flavor":"勸袁紹迎天子、屯兵待變，見識遠大，不被採納。","effectText":"秘境隕落率 −30%","fx":{"realmSafety":0.3}},
  tianfeng: {"name":"剛而犯上","flavor":"勸袁紹持久戰，因直諫被下獄，預言官渡敗而死。","effectText":"比試得分 +25%","fx":{"contest":0.25}},
  lvlingqi: {"name":"戟中女傑","flavor":"傳說呂布之女，勇武絕倫，披甲上陣。","effectText":"在隨行隊伍時，若隨行隊伍裡有\"呂布\"，則呂布暴擊率 +5%","fx":{"partyTarget":"lvbu","partyCrit":0.05}},
  yuanshao: {"name":"四世三公","flavor":"河北霸主，名門之後，坐擁四州，終因多疑寡斷而敗。","effectText":"與\"袁術\"派遣到同一城池時，駐守城池士兵收入 +30%","fx":{"companion":["yuanshu"],"synergySoldiers":0.3}},
  yuanshu: {"name":"僭號稱帝","flavor":"據淮南，稱帝建號，驕奢淫逸，終眾叛親離。","effectText":"與\"袁紹\"派遣到同一城池時，駐守城池靈石收入 +30%","fx":{"companion":["yuanshao"],"synergyStones":0.3}},
  zhangjiao: {"name":"大賢良師","flavor":"太平道首領，創黃巾起義，符水治病，聚眾數十萬。","effectText":"\"張角\"、\"張寶\"、\"張良\"派遣到同一城池時，駐守城池士兵收入 +35%","fx":{"companion":["zhangbaoyj","zhangliang"],"synergySoldiers":0.35}},
  zhangbaoyj: {"name":"地公將軍","flavor":"張角之弟，作法呼風喚雨，鎮守廣宗。","effectText":"\"張角\"、\"張寶\"、\"張良\"派遣到同一城池時，駐守城池士兵收入 +25%","fx":{"companion":["zhangjiao","zhangliang"],"synergySoldiers":0.25}},
  zhangliang: {"name":"人公將軍","flavor":"張角三弟，統兵出戰，與皇甫嵩對陣而死。","effectText":"\"張角\"、\"張寶\"、\"張良\"派遣到同一城池時，駐守城池士兵收入 +15%","fx":{"companion":["zhangjiao","zhangbaoyj"],"synergySoldiers":0.15}},
  gongsunzan: {"name":"白馬將軍","flavor":"白馬義從縱橫塞北，威震烏桓，後敗於袁紹。","effectText":"擂台必定先手・作戰時兵力 +25%","fx":{"firstStrike":true,"troops":0.25}},
  liubiao: {"name":"荊襄九郡","flavor":"坐鎮荊州，單馬入宜城，保境安民，但無進取之志。","effectText":"駐守時守城戰力 +15%・駐守城池靈石收入 +15%","fx":{"garrisonDef":0.15,"cityStones":0.15}},
  shenpei: {"name":"忠烈守鄴","flavor":"袁紹謀臣，死守鄴城，寧死不降。","effectText":"駐守時守城戰力 +20%","fx":{"garrisonDef":0.2}},
  taoqian: {"name":"三讓徐州","flavor":"徐州牧，仁厚長者，三讓徐州於劉備。","effectText":"在隨行隊伍時，過路費 -10%","fx":{"partyToll":0.1}},
  gaolan: {"name":"河北四庭柱","flavor":"袁紹麾下名將，後降曹操。","effectText":"擂台傷害 +10%","fx":{"duelDmg":0.1}},
  wutugu: {"name":"藤甲兵","flavor":"烏戈國主，身長一丈二，所率藤甲兵刀槍不入，怕火攻。","effectText":"防禦 +15%・血量 +25%","fx":{"def":0.15,"hp":0.25}},
  mulu: {"name":"驅獸","flavor":"八納洞洞主，能驅猛獸，騎白象出戰，並施妖法。","effectText":"攻擊額外能量 +20","fx":{"energyGain":20}},
  zuoci: {"name":"擲杯戲曹","flavor":"擲杯化鳩，戲弄曹操，來去無蹤。","effectText":"在隨行隊伍時，當敵人對主公發動物品時，使物品效果失效(非戰鬥)","fx":{"partyItemBlock":true}},
  yuji: {"name":"符水治病","flavor":"以符水為人治病，吳會之人多事之。","effectText":"在隨行隊伍時，可隨時耗費100體力獲得一張隨機符籙・體力回復速度 -90%","fx":{"produceCategory":"符籙","staminaRecovery":-0.9}},
  huatuo: {"name":"神醫","flavor":"麻沸散、五禽戲，起死回生。","effectText":"在隨行隊伍時，可隨時耗費100體力使用\"起死回生\"，復活我方死亡武將，血量 100%，境界跌落 1 級，修為歸零・體力回復速度 -90%","fx":{"reviveAbility":true,"staminaRecovery":-0.9}},
  guanlu: {"name":"卜筮如神","flavor":"精通周易，占卜無不應驗。","effectText":"擲骰前，可預覽三個候選步數，排除其中一個，再從剩下兩個隨機決定；不能直接指定落點。","fx":{"divination":true}},
  shuijing: {"name":"水鏡先生","flavor":"司馬徽，知人善任，「臥龍鳳雛，得一可安天下」。","effectText":"聽風樓必定出現隱藏人物，包含未出世武將","fx":{"unlockHidden":true}},
  pangdegong: {"name":"鹿門隱士","flavor":"龐統之叔，隱居鹿門山，被稱為「水鏡之師」。","effectText":"在隨行隊伍時，隨行隊伍武將修為獲得 +20%","fx":{"partyExp":0.2}},
  huangchengyan: {"name":"機關妙手","flavor":"諸葛亮之岳父，精通機巧，傳授黃月英巧技。","effectText":"在隨行隊伍時，可隨時耗費100體力獲得一件隨機法器・體力回復速度 -90%","fx":{"produceCategory":"法器","staminaRecovery":-0.9}},
  xushao: {"name":"月旦評","flavor":"與從兄許靖主持品評人物，稱曹操「治世之能臣，亂世之奸雄」。","effectText":"在隨行隊伍時，聽風樓招募武將價格 -50%","fx":{"partyRecruit":0.5}},
  zhangzhongjing: {"name":"醫聖","flavor":"著《傷寒雜病論》，辨證施治，開後世醫學之先河。","effectText":"在隨行隊伍時，可隨時耗費100體力獲得一件隨機丹藥・體力回復速度 -90%","fx":{"produceCategory":"丹藥","staminaRecovery":-0.9}},
  dongfeng: {"name":"杏林","flavor":"行醫不收錢，重症者種杏五株，輕者一株，積杏成林。","effectText":"在隨行隊伍時，百草堂復活武將不需耗費靈石","fx":{"freeRevive":true}},
  guanning: {"name":"割席","flavor":"與華歆割席斷交，隱居遼東，一生不仕，德行高潔。","effectText":"在隨行隊伍時，主公回合開始時，可選擇全隊清修，本回合放棄任何行動，隨行隊伍武將修為獲得 +100%，持續5回合","fx":{"seclusionAbility":true}},
  nanhua: {"name":"南華老仙","flavor":"《三國演義》中授天書於張角的仙人，碧眼童顏，手執藜杖。","effectText":"在隨行隊伍時，可隨時耗費100體力獲得一個隨機陣法・體力回復速度 -90%","fx":{"produceCategory":"陣法","staminaRecovery":-0.9}},
  pujing: {"name":"玉泉點化","flavor":"玉泉山老僧，點化關羽的亡魂，一念可解怨結。","effectText":"在隨行隊伍時，每五回合可召喚已死亡武將冤魂加入隊伍，血量 100%，境界不變，修為不變，持續五回合，冤魂無法獲得修為、穿戴裝備及功法；持續時間不影響該武將復活，復活後該武將從可召喚名單中去除","fx":{"ghostAbility":true}},
};

const EMPTY: Passive = { name: '無', flavor: '', fx: {} };

export function passiveOf(g: General): Passive {
  return PASSIVES[g.ghostSourceId ?? g.id] ?? EMPTY;
}

let context: GameState | undefined;
export function bindPassiveState(state: GameState) { context = state; }
export function passiveState() { return context; }
export function lordAura(lord: LordId, key: keyof PassiveFx): number {
  return Object.values(context?.generals ?? {}).filter(g => g.owner === lord && g.status === 'free' && !g.ghostSourceId).reduce((sum,g) => { const value=passiveOf(g).fx[key]; return sum + (typeof value === 'number' ? value : 0); },0);
}
export function lordHas(lord: LordId, key: keyof PassiveFx): boolean {
  return Object.values(context?.generals ?? {}).some(g => g.owner === lord && g.status === 'free' && !g.ghostSourceId && !!passiveOf(g).fx[key]);
}
export function fx(g: General): PassiveFx {
  const result = { ...passiveOf(g).fx };
  if (!context || !g.owner || g.status === 'dead') return result;
  const peers=Object.values(context.generals).filter(p => p.owner === g.owner && p.status !== 'dead' && !p.ghostSourceId);
  if (g.status === 'garrison' && g.cityId) for (const source of peers.filter(p => p.status === 'garrison' && p.cityId === g.cityId)) {
    const f=passiveOf(source).fx;
    if (!f.companion || !f.companion.every(id => peers.some(p => p.id === id && p.status === 'garrison' && p.cityId === g.cityId))) continue;
    if (source.id === g.id) { result.cityStones=(result.cityStones??0)+(f.synergyStones??0); result.citySoldiers=(result.citySoldiers??0)+(f.synergySoldiers??0); }
    if (f.synergyTarget === g.id || (f.synergyTarget === 'both' && (source.id === g.id || f.companion.includes(g.id)))) {
      result.allStats=(result.allStats??0)+(f.synergyStats??0); result.atk=(result.atk??0)+(f.synergyForce??0); result.exp=(result.exp??0)+(f.synergyExp??0);
    }
  }
  if (g.status === 'free') for(const source of peers.filter(p => p.status === 'free')) {
    const f=passiveOf(source).fx;
    if (f.partyTarget === (g.ghostSourceId ?? g.id)) result.crit=(result.crit??0)+(f.partyCrit??0);
  }
  return result;
}


const CRAFT_NAMES: Record<CraftStat, string> = { alchemy: '煉丹', forging: '煉器', talisman: '畫符', formation: '佈陣' };
const pct = (v: number) => `${v > 0 ? '+' : '−'}${Math.round(Math.abs(v) * 100)}%`;

/** 被動效果的文字說明（由數值產生，保證與實際效果一致） */
export function fxText(f: PassiveFx): string {
  const authored=Object.values(PASSIVES).find(p => p.fx === f)?.effectText;
  if (authored) return authored;
  const t: string[] = [];
  if (f.atk) t.push(`武力 ${pct(f.atk)}`);
  if (f.def) t.push(`防禦 ${pct(f.def)}`);
  if (f.hp) t.push(`血量 ${pct(f.hp)}`);
  for (const [k, v] of Object.entries(f.craft ?? {})) t.push(`${CRAFT_NAMES[k as CraftStat]} ${v > 0 ? '+' : '−'}${Math.abs(v)}`);
  if (f.duelDmg) t.push(`擂台傷害 ${pct(f.duelDmg)}`);
  if (f.duelTaken) t.push(`擂台受傷 ${pct(-f.duelTaken)}`);
  if (f.energyStart) t.push(`擂台開場能量 ${f.energyStart}%`);
  if (f.energyGain) t.push(`攻擊額外能量 +${f.energyGain}`);
  if (f.skillDmg) t.push(`功法技能傷害 ${pct(f.skillDmg)}`);
  if (f.rage) t.push(`血量低於一半時傷害 ${pct(f.rage)}`);
  if (f.lifesteal) t.push(`傷害吸血 ${pct(f.lifesteal)}`);
  if (f.intimidate) t.push(`擂台上敵將武力 ${pct(-f.intimidate)}`);
  if (f.firstStrike) t.push('擂台必定先手');
  if (f.crit) t.push(`爆擊機率 +${Math.round(f.crit * 100)}%`);
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
  if (f.realmSafety) t.push(`秘境隕落率 ${pct(-f.realmSafety)}`);
  if (f.itemStamina) t.push(`使用物品體力 ${pct(-f.itemStamina)}`);
  if (f.contest) t.push(`比試得分 ${pct(f.contest)}`);
  return t.join('・');
}
