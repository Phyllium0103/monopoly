import type { Equipment } from '../game/types';

export type MaterialGroup = '魄' | '髓' | '銅' | '砂' | '絲' | '玉';
export const WEAPON_GRADES = ['黃階', '玄階', '地階', '天階'] as const;
export const WEAPON_PENETRATION = [0.10, 0.25, 0.40, 0.60] as const;
export const WEAPON_UPGRADE_COST = [10, 5, 1] as const;
export const MATERIAL_GROUPS: MaterialGroup[] = ['魄', '髓', '銅', '砂', '絲', '玉'];
export const MATERIAL_NAMES: Record<MaterialGroup, readonly [string, string, string]> = {
  "魄": [
    "玄鐵劍魄",
    "白虹金魄",
    "太白庚金精魄"
  ],
  "髓": [
    "寒晶玉髓",
    "極陰冰髓",
    "幽冥玄冰煞髓"
  ],
  "銅": [
    "赤煉靈銅",
    "龍血玄銅",
    "混沌赤血真銅"
  ],
  "砂": [
    "金剛岩砂",
    "鎮嶽晶砂",
    "太古金剛星砂"
  ],
  "絲": [
    "青蠶柔絲",
    "雲霞仙絲",
    "九天神蠶寶絲"
  ],
  "玉": [
    "澄心璞玉",
    "太清法玉",
    "造化澄心仙玉"
  ]
};
export interface PersonalWeaponDefinition { name: string; material: MaterialGroup; names: [string, string, string, string]; }
/** 使用者 Google 試算表「武器定稿」的 175 位人物、700 個名稱。 */
export const WEAPON_CATALOG: Record<string, PersonalWeaponDefinition> = {
  "liubei": {
    "name": "劉備",
    "material": "魄",
    "names": [
      "雌雄雙股劍",
      "陰陽雙股劍",
      "仁德鎮世雙劍",
      "昭烈天命雙劍"
    ]
  },
  "liushan": {
    "name": "劉禪",
    "material": "魄",
    "names": [
      "安樂佩劍",
      "承運安樂劍",
      "蜀漢守成劍",
      "福澤天命安樂劍"
    ]
  },
  "guanyu": {
    "name": "關羽",
    "material": "髓",
    "names": [
      "青龍偃月刀",
      "義膽青龍刀",
      "撼天青龍刀",
      "武聖青龍斬天刀"
    ]
  },
  "zhangfei": {
    "name": "張飛",
    "material": "銅",
    "names": [
      "丈八蛇矛",
      "幽冥蛇矛",
      "吞天丈八蛇矛",
      "洪荒九幽滅世蛇矛"
    ]
  },
  "zhaoyun": {
    "name": "趙雲",
    "material": "銅",
    "names": [
      "龍膽亮銀槍",
      "追星亮銀槍",
      "鎮海盤龍槍",
      "九天龍膽破虛槍"
    ]
  },
  "zhugeliang": {
    "name": "諸葛亮",
    "material": "絲",
    "names": [
      "白鶴羽扇",
      "七星羽扇",
      "八陣呼風扇",
      "七星八陣陰陽扇"
    ]
  },
  "huangzhong": {
    "name": "黃忠",
    "material": "砂",
    "names": [
      "萬石寶弓",
      "穿雲寶弓",
      "烈陽碎岩弓",
      "落日射月神弓"
    ]
  },
  "machao": {
    "name": "馬超",
    "material": "銅",
    "names": [
      "虎頭湛金槍",
      "奔雷湛金槍",
      "破軍虎嘯槍",
      "九天御雷天威槍"
    ]
  },
  "weiyan": {
    "name": "魏延",
    "material": "髓",
    "names": [
      "大砍刀",
      "貪狼大砍刀",
      "嗜血狂沙刀",
      "刑天噬魂碎滅刀"
    ]
  },
  "pangtong": {
    "name": "龐統",
    "material": "絲",
    "names": [
      "鐵索杖",
      "鳳雛連環杖",
      "涅槃連環杖",
      "鳳舞九天連環杖"
    ]
  },
  "jiangwei": {
    "name": "姜維",
    "material": "銅",
    "names": [
      "綠沉槍",
      "飛星綠沉槍",
      "破陣綠沉槍",
      "九轉碧落蒼穹槍"
    ]
  },
  "madai": {
    "name": "馬岱",
    "material": "砂",
    "names": [
      "寶雕弓",
      "追風寶雕弓",
      "裂地穿雲弓",
      "追魂奪命九霄弓"
    ]
  },
  "guanping": {
    "name": "關平",
    "material": "髓",
    "names": [
      "偃月刀",
      "破甲偃月刀",
      "鎮嶽偃月刀",
      "護主凌霄偃月刀"
    ]
  },
  "maliang": {
    "name": "馬良",
    "material": "玉",
    "names": [
      "白毫筆",
      "白眉靈筆",
      "五常定策筆",
      "白眉經世點星筆"
    ]
  },
  "jianyong": {
    "name": "簡雍",
    "material": "魄",
    "names": [
      "長劍",
      "游龍長劍",
      "縱橫捭闔劍",
      "逍遙無極游天劍"
    ]
  },
  "fazheng": {
    "name": "法正",
    "material": "魄",
    "names": [
      "孝直佩劍",
      "奇謀鐵劍",
      "定軍奇策劍",
      "奇策決勝定軍劍"
    ]
  },
  "mizhu": {
    "name": "糜竺",
    "material": "玉",
    "names": [
      "商賈算籌",
      "靈玉算籌",
      "聚寶乾坤籌",
      "萬象通財天籌"
    ]
  },
  "guanxing": {
    "name": "關興",
    "material": "髓",
    "names": [
      "青龍刀",
      "怒浪青龍刀",
      "承志青龍刀",
      "青龍繼志斬天刀"
    ]
  },
  "zhangbao": {
    "name": "張苞",
    "material": "銅",
    "names": [
      "蛇矛",
      "狂雷蛇矛",
      "裂地狂蛇矛",
      "震天雷霆蛇矛"
    ]
  },
  "wangping": {
    "name": "王平",
    "material": "砂",
    "names": [
      "開山大斧",
      "破軍大斧",
      "鎮嶽無當斧",
      "劈天裂地玄冥斧"
    ]
  },
  "liaohua": {
    "name": "廖化",
    "material": "銅",
    "names": [
      "長槍",
      "長青鐵槍",
      "不死百戰槍",
      "歲月長青續命槍"
    ]
  },
  "yanyan": {
    "name": "嚴顏",
    "material": "髓",
    "names": [
      "大刀",
      "烈火大刀",
      "斷魂破軍刀",
      "不屈烈陽開天刀"
    ]
  },
  "huangquan": {
    "name": "黃權",
    "material": "魄",
    "names": [
      "佩劍",
      "磐石佩劍",
      "守心鎮魂劍",
      "忠魂不滅傲天劍"
    ]
  },
  "liyan": {
    "name": "李嚴",
    "material": "銅",
    "names": [
      "長戟",
      "鎮軍長戟",
      "破城摧嶽戟",
      "督星斷獄伏魔戟"
    ]
  },
  "masu": {
    "name": "馬謖",
    "material": "玉",
    "names": [
      "兵書竹簡",
      "迷影竹簡",
      "妄語千機簡",
      "虛空幻滅天書簡"
    ]
  },
  "jiangwan": {
    "name": "蔣琬",
    "material": "魄",
    "names": [
      "佩劍",
      "安邦佩劍",
      "社稷鎮國劍",
      "定鼎九州天地劍"
    ]
  },
  "feiyi": {
    "name": "費禕",
    "material": "玉",
    "names": [
      "笏板",
      "靈玉笏板",
      "息災化玉笏",
      "息爭安邦太平笏"
    ]
  },
  "sunqian": {
    "name": "孫乾",
    "material": "絲",
    "names": [
      "使節杖",
      "四方使節杖",
      "凌雲瑞氣杖",
      "穿梭兩儀化雨杖"
    ]
  },
  "yiji": {
    "name": "伊籍",
    "material": "魄",
    "names": [
      "短劍",
      "追風短劍",
      "靈影無痕劍",
      "逍遙穿雲神行劍"
    ]
  },
  "zhoucang": {
    "name": "周倉",
    "material": "髓",
    "names": [
      "鐵板大刀",
      "負嶽大刀",
      "撼山裂地刀",
      "擎天負嶽巨靈刀"
    ]
  },
  "chendao": {
    "name": "陳到",
    "material": "銅",
    "names": [
      "白毦長槍",
      "穿雲白毦槍",
      "鎮護白毦槍",
      "極光白毦護天槍"
    ]
  },
  "liufeng": {
    "name": "劉封",
    "material": "髓",
    "names": [
      "大刀",
      "噬魂大刀",
      "狂鋒裂地刀",
      "螟蛉吞日滅絕刀"
    ]
  },
  "mengda": {
    "name": "孟達",
    "material": "銅",
    "names": [
      "長矛",
      "反覆長矛",
      "陰陽兩儀矛",
      "反覆無常逆天矛"
    ]
  },
  "dengzhi": {
    "name": "鄧芝",
    "material": "魄",
    "names": [
      "佩劍",
      "遊說佩劍",
      "渡江靈音劍",
      "縱橫四海天平劍"
    ]
  },
  "menghuo": {
    "name": "孟獲",
    "material": "砂",
    "names": [
      "狼牙棒",
      "蠻荒狼牙棒",
      "巨靈碎岩棒",
      "洪荒百獸萬鈞棒"
    ]
  },
  "zhurongfuren": {
    "name": "祝融夫人",
    "material": "砂",
    "names": [
      "飛刀",
      "烈焰飛刀",
      "落日火舞刀",
      "九幽業火流星刀"
    ]
  },
  "huangyueying": {
    "name": "黃月英",
    "material": "砂",
    "names": [
      "機關連弩",
      "千機連弩",
      "玲瓏破陣弩",
      "萬華天機滅世弩"
    ]
  },
  "shamoke": {
    "name": "沙摩柯",
    "material": "砂",
    "names": [
      "鐵蒺藜骨朵",
      "淬毒骨朵",
      "五溪震岳骨朵",
      "萬瘴蒺藜骨朵"
    ]
  },
  "guansuo": {
    "name": "關索",
    "material": "魄",
    "names": [
      "雙劍",
      "桃花雙劍",
      "落英繽紛劍",
      "飛花逐月絕情劍"
    ]
  },
  "mifang": {
    "name": "糜芳",
    "material": "髓",
    "names": [
      "單刀",
      "獻城單刀",
      "怯懦殘影刀",
      "乾坤無影逃遁刀"
    ]
  },
  "zhugezhan": {
    "name": "諸葛瞻",
    "material": "魄",
    "names": [
      "佩劍",
      "泣血佩劍",
      "死節護國劍",
      "碧血丹心殉天劍"
    ]
  },
  "zhangxingcai": {
    "name": "張星彩",
    "material": "銅",
    "names": [
      "丈八雙矛",
      "雙星長矛",
      "裂地流光矛",
      "銀河破滅隕星矛"
    ]
  },
  "sunquan": {
    "name": "孫權",
    "material": "魄",
    "names": [
      "紫電青冥劍",
      "雙龍帝劍",
      "鎮江霸王劍",
      "皇極天威雙龍劍"
    ]
  },
  "zhouyu": {
    "name": "周瑜",
    "material": "絲",
    "names": [
      "桐木琴",
      "顧曲靈琴",
      "赤壁焚天琴",
      "周郎紅蓮劫火琴"
    ]
  },
  "lusu": {
    "name": "魯肅",
    "material": "魄",
    "names": [
      "佩劍",
      "尺天佩劍",
      "三分量天劍",
      "三分定鼎弭兵劍"
    ]
  },
  "lvmeng": {
    "name": "呂蒙",
    "material": "髓",
    "names": [
      "白衣短刀",
      "隱匿短刀",
      "渡江幻影刀",
      "無相無我奪命刀"
    ]
  },
  "luxun": {
    "name": "陸遜",
    "material": "魄",
    "names": [
      "雙劍",
      "業火雙劍",
      "連營焚天劍",
      "朱雀焚世寂滅劍"
    ]
  },
  "ganning": {
    "name": "甘寧",
    "material": "銅",
    "names": [
      "雙手戟",
      "驚魂雙手戟",
      "破浪震海戟",
      "百騎劫天奪魂戟"
    ]
  },
  "taishici": {
    "name": "太史慈",
    "material": "銅",
    "names": [
      "狂歌戟",
      "怒濤狂歌戟",
      "篤烈破陣戟",
      "戰神無雙天刑戟"
    ]
  },
  "huanggai": {
    "name": "黃蓋",
    "material": "絲",
    "names": [
      "鐵鞭",
      "苦肉鐵鞭",
      "碎岩焚天鞭",
      "業火連天碎嶽鞭"
    ]
  },
  "zhoutai": {
    "name": "周泰",
    "material": "髓",
    "names": [
      "九環大刀",
      "霸體九環刀",
      "護國不屈刀",
      "九命金剛不壞刀"
    ]
  },
  "chengpu": {
    "name": "程普",
    "material": "銅",
    "names": [
      "鐵脊蛇矛",
      "滄浪蛇矛",
      "鎮波蕩魔矛",
      "滄浪定海翻江矛"
    ]
  },
  "lingtong": {
    "name": "凌統",
    "material": "髓",
    "names": [
      "雙刀",
      "旋風雙刀",
      "國士破浪刀",
      "踏罡步斗斬風刀"
    ]
  },
  "handang": {
    "name": "韓當",
    "material": "髓",
    "names": [
      "大刀",
      "宿將大刀",
      "鎮海斷流刀",
      "不動明王伏波刀"
    ]
  },
  "zhangzhao": {
    "name": "張昭",
    "material": "絲",
    "names": [
      "鳩杖",
      "安邦鳩杖",
      "輔吳定國杖",
      "托天理政玄玉杖"
    ]
  },
  "zhugejin": {
    "name": "諸葛瑾",
    "material": "絲",
    "names": [
      "羽扇",
      "溫潤羽扇",
      "春風化雨扇",
      "萬里無雲清平扇"
    ]
  },
  "xusheng": {
    "name": "徐盛",
    "material": "砂",
    "names": [
      "鐵盾",
      "疑城鐵盾",
      "蜃樓幻影盾",
      "銅牆鐵壁擎天盾"
    ]
  },
  "zhuran": {
    "name": "朱然",
    "material": "砂",
    "names": [
      "寶弓",
      "穿石寶弓",
      "燎原破甲弓",
      "九陽焚天射日弓"
    ]
  },
  "jiangqin": {
    "name": "蔣欽",
    "material": "砂",
    "names": [
      "寶弓",
      "破浪寶弓",
      "覆海神射弓",
      "蒼龍穿雲隕星弓"
    ]
  },
  "dingfeng": {
    "name": "丁奉",
    "material": "髓",
    "names": [
      "短刀",
      "踏雪短刀",
      "凌霜冰魄刀",
      "飛雪連天絕殺刀"
    ]
  },
  "panzhang": {
    "name": "潘璋",
    "material": "髓",
    "names": [
      "大刀",
      "伏龍大刀",
      "擒將鎖魂刀",
      "天羅地網奪魄刀"
    ]
  },
  "zhuhuan": {
    "name": "朱桓",
    "material": "銅",
    "names": [
      "長戟",
      "固守長戟",
      "鎮江無敵戟",
      "不落要塞擎天戟"
    ]
  },
  "yufan": {
    "name": "虞翻",
    "material": "玉",
    "names": [
      "算籌",
      "易學算籌",
      "八卦測天籌",
      "易理窮微問卦籌"
    ]
  },
  "guyong": {
    "name": "顧雍",
    "material": "玉",
    "names": [
      "木棋盤",
      "忘言棋盤",
      "萬象山河盤",
      "忘言弈世山河盤"
    ]
  },
  "lukang": {
    "name": "陸抗",
    "material": "魄",
    "names": [
      "佩劍",
      "和光佩劍",
      "同塵共鳴劍",
      "太平天下無極劍"
    ]
  },
  "sunce": {
    "name": "孫策",
    "material": "銅",
    "names": [
      "霸王槍",
      "霆擊霸王槍",
      "破陣裂地槍",
      "九天雷霆霸王槍"
    ]
  },
  "sunshangxiang": {
    "name": "孫尚香",
    "material": "髓",
    "names": [
      "日月雙刀",
      "乾坤雙刀",
      "鳳舞穿雲刀",
      "陰陽流光星月刀"
    ]
  },
  "lvfan": {
    "name": "呂範",
    "material": "玉",
    "names": [
      "籌盤",
      "聚財籌盤",
      "金鱗聚寶盤",
      "萬界通財乾坤盤"
    ]
  },
  "heqi": {
    "name": "賀齊",
    "material": "髓",
    "names": [
      "寶刀",
      "平越寶刀",
      "華彩鎮嶽刀",
      "萬壑千峰碎星刀"
    ]
  },
  "sunjian": {
    "name": "孫堅",
    "material": "髓",
    "names": [
      "松紋古錠刀",
      "碎星古錠刀",
      "猛虎鎮山刀",
      "江東帝王破天刀"
    ]
  },
  "bulianshi": {
    "name": "步練師",
    "material": "玉",
    "names": [
      "羅傘",
      "春雨羅傘",
      "寬容靈仙傘",
      "慈航普渡淨世傘"
    ]
  },
  "daqiao": {
    "name": "大喬",
    "material": "絲",
    "names": [
      "雙扇",
      "落花雙扇",
      "琉璃幻夢扇",
      "國色天香迷魂扇"
    ]
  },
  "xiaoqiao": {
    "name": "小喬",
    "material": "絲",
    "names": [
      "雙扇",
      "業火雙扇",
      "紅蓮舞空扇",
      "焚天鳳舞九霄扇"
    ]
  },
  "zhugeke": {
    "name": "諸葛恪",
    "material": "魄",
    "names": [
      "佩劍",
      "狂風佩劍",
      "傲物碎岩劍",
      "呼風喚雨狂傲劍"
    ]
  },
  "sunjiao": {
    "name": "孫皎",
    "material": "銅",
    "names": [
      "長槍",
      "銀輝長槍",
      "水魔鎮江槍",
      "銀龍鎮江定海槍"
    ]
  },
  "zhoufang": {
    "name": "周魴",
    "material": "髓",
    "names": [
      "短刀",
      "斷髮短刀",
      "誘敵幻影刀",
      "絕殺千機奪命刀"
    ]
  },
  "lukai": {
    "name": "陸凱",
    "material": "魄",
    "names": [
      "佩劍",
      "無畏佩劍",
      "直諫破魔劍",
      "浩然正氣破邪劍"
    ]
  },
  "wuguotai": {
    "name": "吳國太",
    "material": "絲",
    "names": [
      "龍頭拐杖",
      "鎮吳拐杖",
      "定海太極杖",
      "皇極天母盤龍杖"
    ]
  },
  "sunluban": {
    "name": "孫魯班",
    "material": "絲",
    "names": [
      "短刺簪",
      "噬心短刺簪",
      "鴆毒奪魂簪",
      "暗無天日滅魂簪"
    ]
  },
  "zhuzhi": {
    "name": "朱治",
    "material": "魄",
    "names": [
      "佩劍",
      "舊臣佩劍",
      "開國元老劍",
      "鎮國擎天不朽劍"
    ]
  },
  "sundeng": {
    "name": "孫登",
    "material": "魄",
    "names": [
      "佩劍",
      "儲君佩劍",
      "福澤安邦劍",
      "東宮天命賜福劍"
    ]
  },
  "liuzan": {
    "name": "留贊",
    "material": "髓",
    "names": [
      "短刀",
      "絕唱短刀",
      "高歌裂石刀",
      "驚天動地雷音刀"
    ]
  },
  "caocao": {
    "name": "曹操",
    "material": "魄",
    "names": [
      "倚天劍",
      "吞龍倚天劍",
      "霸道鎮國劍",
      "九五至尊天帝劍"
    ]
  },
  "xiahoudun": {
    "name": "夏侯惇",
    "material": "髓",
    "names": [
      "狼牙大刀",
      "嗜血大刀",
      "啖睛滅魂刀",
      "獨目啖睛怒戰刀"
    ]
  },
  "xiahouyuan": {
    "name": "夏侯淵",
    "material": "砂",
    "names": [
      "寶雕弓",
      "神速寶雕弓",
      "流星驚天弓",
      "御風追電射日弓"
    ]
  },
  "zhangliao": {
    "name": "張遼",
    "material": "銅",
    "names": [
      "雙鉞",
      "逍遙雙鉞",
      "威震黃龍鉞",
      "破空止啼天威鉞"
    ]
  },
  "xuchu": {
    "name": "許褚",
    "material": "砂",
    "names": [
      "大鐵椎",
      "碎岩鐵椎",
      "虎痴震地錘",
      "破天裂地巨靈錘"
    ]
  },
  "dianwei": {
    "name": "典韋",
    "material": "銅",
    "names": [
      "雙鐵戟",
      "盤龍雙戟",
      "惡來鎮獄戟",
      "萬鈞護主天魔戟"
    ]
  },
  "guojia": {
    "name": "郭嘉",
    "material": "絲",
    "names": [
      "羽扇",
      "遺計羽扇",
      "十勝鬼才扇",
      "鬼才算盡風雲扇"
    ]
  },
  "xunyu": {
    "name": "荀彧",
    "material": "魄",
    "names": [
      "佩劍",
      "凝香佩劍",
      "驅虎吞狼劍",
      "王佐定鼎王道劍"
    ]
  },
  "xuhuang": {
    "name": "徐晃",
    "material": "砂",
    "names": [
      "貫石斧",
      "開山貫石斧",
      "裂地宣花斧",
      "開天闢地刑天斧"
    ]
  },
  "caoren": {
    "name": "曹仁",
    "material": "砂",
    "names": [
      "牙門盾",
      "金鎖牙門盾",
      "玄武八門盾",
      "不動如山鎮天盾"
    ]
  },
  "zhanghe": {
    "name": "張郃",
    "material": "銅",
    "names": [
      "雙鉤刺",
      "巧變雙鉤",
      "無極幻影雙鉤",
      "百變流光雙鉤"
    ]
  },
  "chengyu": {
    "name": "程昱",
    "material": "魄",
    "names": [
      "長劍",
      "剛戾長劍",
      "伏魔血肉劍",
      "森羅萬象血肉劍"
    ]
  },
  "xunyou": {
    "name": "荀攸",
    "material": "玉",
    "names": [
      "竹簡",
      "奇策竹簡",
      "十二天機簡",
      "算盡蒼生造化簡"
    ]
  },
  "yujin": {
    "name": "于禁",
    "material": "髓",
    "names": [
      "三尖刀",
      "毅重三尖刀",
      "鎖魂鎮法刀",
      "鐵面無私裁決刀"
    ]
  },
  "yuejin": {
    "name": "樂進",
    "material": "銅",
    "names": [
      "雙鉤",
      "先登雙鉤",
      "摧城破陣鉤",
      "勇往直前裂天鉤"
    ]
  },
  "caohong": {
    "name": "曹洪",
    "material": "髓",
    "names": [
      "大刀",
      "救主大刀",
      "黃金散財刀",
      "捨命救主黃金刀"
    ]
  },
  "simayi": {
    "name": "司馬懿",
    "material": "絲",
    "names": [
      "黑羽扇",
      "狼顧黑羽扇",
      "幽冥吞噬扇",
      "隻手遮天篡命扇"
    ]
  },
  "caozhen": {
    "name": "曹真",
    "material": "髓",
    "names": [
      "大刀",
      "督軍大刀",
      "督軍鎮國刀",
      "威鎮八方護國刀"
    ]
  },
  "lidian": {
    "name": "李典",
    "material": "銅",
    "names": [
      "長戟",
      "儒將長戟",
      "博古浩然戟",
      "萬卷書山破邪戟"
    ]
  },
  "pangde": {
    "name": "龐德",
    "material": "髓",
    "names": [
      "截頭大刀",
      "死戰大刀",
      "抬櫬白馬刀",
      "視死如歸修羅刀"
    ]
  },
  "wenpin": {
    "name": "文聘",
    "material": "銅",
    "names": [
      "長槍",
      "鐵壁長槍",
      "江夏堅城槍",
      "萬夫莫開擎天槍"
    ]
  },
  "manchong": {
    "name": "滿寵",
    "material": "魄",
    "names": [
      "佩劍",
      "守御佩劍",
      "機關新城劍",
      "固若金湯鎮天劍"
    ]
  },
  "zhongyao": {
    "name": "鍾繇",
    "material": "玉",
    "names": [
      "毛筆",
      "鐵畫毛筆",
      "銀鉤造化筆",
      "楷書萬代點睛筆"
    ]
  },
  "chenqun": {
    "name": "陳群",
    "material": "玉",
    "names": [
      "笏板",
      "中正笏板",
      "量才九品笏",
      "九品衡才秉正笏"
    ]
  },
  "dengai": {
    "name": "鄧艾",
    "material": "髓",
    "names": [
      "大刀",
      "偷渡大刀",
      "鑽山裂地刀",
      "穿梭虛空破界刀"
    ]
  },
  "haozhao": {
    "name": "郝昭",
    "material": "砂",
    "names": [
      "大盾",
      "流火大盾",
      "拒馬玄武盾",
      "陳倉不破御天盾"
    ]
  },
  "caopi": {
    "name": "曹丕",
    "material": "魄",
    "names": [
      "雙劍",
      "飛星雙劍",
      "篡漢大魏劍",
      "承天受命帝王劍"
    ]
  },
  "caozhang": {
    "name": "曹彰",
    "material": "銅",
    "names": [
      "黃鬚長戟",
      "降虎長戟",
      "裂天猛獸戟",
      "破嶽蕩魔狂獸戟"
    ]
  },
  "caoang": {
    "name": "曹昂",
    "material": "魄",
    "names": [
      "佩劍",
      "捨身佩劍",
      "護父捨身劍",
      "忠孝兩全捨生劍"
    ]
  },
  "xushu": {
    "name": "徐庶",
    "material": "魄",
    "names": [
      "俠客劍",
      "無言俠客劍",
      "走馬指路劍",
      "飄渺無蹤飛仙劍"
    ]
  },
  "zhonghui": {
    "name": "鍾會",
    "material": "魄",
    "names": [
      "佩劍",
      "桀驁佩劍",
      "千機萬化劍",
      "顛覆乾坤叛逆劍"
    ]
  },
  "simazhao": {
    "name": "司馬昭",
    "material": "魄",
    "names": [
      "佩劍",
      "昭心佩劍",
      "弒君奪權劍",
      "偷天換日篡道劍"
    ]
  },
  "caozhi": {
    "name": "曹植",
    "material": "玉",
    "names": [
      "毛筆",
      "落霞毛筆",
      "七步成詩筆",
      "驚風泣雨洛神筆"
    ]
  },
  "simashi": {
    "name": "司馬師",
    "material": "魄",
    "names": [
      "佩劍",
      "隱忍佩劍",
      "毒牙暗殺劍",
      "權傾天下暗夜劍"
    ]
  },
  "caiwenji": {
    "name": "蔡文姬",
    "material": "絲",
    "names": [
      "胡笳",
      "悲歌胡笳",
      "十八拍魔音笳",
      "餘音繞樑絕世笳"
    ]
  },
  "zhenji": {
    "name": "甄姬",
    "material": "絲",
    "names": [
      "玉笛",
      "凌波玉笛",
      "洛神幻夢笛",
      "傾國傾城仙音笛"
    ]
  },
  "xuyou": {
    "name": "許攸",
    "material": "玉",
    "names": [
      "謀士竹簡",
      "識勢奇謀簡",
      "烏巢決勝簡",
      "燎原焚糧破軍簡"
    ]
  },
  "jianggan": {
    "name": "蔣幹",
    "material": "玉",
    "names": [
      "竹簡",
      "盜書竹簡",
      "瞞天過海簡",
      "偷樑換柱無影簡"
    ]
  },
  "niujin": {
    "name": "牛金",
    "material": "砂",
    "names": [
      "大斧",
      "陷陣大斧",
      "破圍狂牛斧",
      "萬牛奔騰碎天斧"
    ]
  },
  "wangshuang": {
    "name": "王雙",
    "material": "砂",
    "names": [
      "流星錘",
      "裂顱流星錘",
      "碎岩隕星錘",
      "毀天滅地末日錘"
    ]
  },
  "dongzhuo": {
    "name": "董卓",
    "material": "砂",
    "names": [
      "騎弓",
      "涼州勁弓",
      "郿塢吞龍弓",
      "霸世裂天魔弓"
    ]
  },
  "lvbu": {
    "name": "呂布",
    "material": "銅",
    "names": [
      "方天畫戟",
      "鬼神畫戟",
      "雷霆無雙戟",
      "破碎虛空修羅戟"
    ]
  },
  "huaxiong": {
    "name": "華雄",
    "material": "髓",
    "names": [
      "大刀",
      "揚威大刀",
      "斬將破陣刀",
      "傲視群雄狂魔刀"
    ]
  },
  "lijue": {
    "name": "李傕",
    "material": "銅",
    "names": [
      "長槍",
      "劫駕長槍",
      "亂政奪權槍",
      "劫駕亂政凶煞槍"
    ]
  },
  "guosi": {
    "name": "郭汜",
    "material": "銅",
    "names": [
      "長矛",
      "擄掠長矛",
      "貪婪吸血矛",
      "窮凶極惡吞天矛"
    ]
  },
  "liru": {
    "name": "李儒",
    "material": "絲",
    "names": [
      "鴆毒酒壺",
      "絕命酒壺",
      "厄毒化骨壺",
      "萬毒歸宗滅世壺"
    ]
  },
  "jiaxu": {
    "name": "賈詡",
    "material": "玉",
    "names": [
      "竹簡",
      "毒計竹簡",
      "百毒亂武簡",
      "顛倒乾坤災厄簡"
    ]
  },
  "xurong": {
    "name": "徐榮",
    "material": "砂",
    "names": [
      "長弓",
      "伏擊長弓",
      "穿雲破甲弓",
      "暗影絕殺奪命弓"
    ]
  },
  "gaoshun": {
    "name": "高順",
    "material": "砂",
    "names": [
      "鋼刀與鐵盾",
      "無我盾刀",
      "陷陣破軍盾刀",
      "攻無不克鎮天盾刀"
    ]
  },
  "chengong": {
    "name": "陳宮",
    "material": "魄",
    "names": [
      "佩劍",
      "剛直佩劍",
      "公台寧死劍",
      "公台孤忠問心劍"
    ]
  },
  "zhangji": {
    "name": "張濟",
    "material": "銅",
    "names": [
      "長槍",
      "狂沙長槍",
      "驃騎御風槍",
      "席捲八荒颶風槍"
    ]
  },
  "zhangxiu": {
    "name": "張繡",
    "material": "銅",
    "names": [
      "虎頭金槍",
      "夜襲金槍",
      "百鳥朝鳳槍",
      "鳳凰涅槃寂滅槍"
    ]
  },
  "hucheer": {
    "name": "胡車兒",
    "material": "髓",
    "names": [
      "雙短刀",
      "飛毛雙刀",
      "盜寶神爪刀",
      "探囊取物無影刀"
    ]
  },
  "diaochan": {
    "name": "貂蟬",
    "material": "絲",
    "names": [
      "多節鞭",
      "奪魄多節鞭",
      "閉月羞花鞭",
      "傾國傾城魅魔鞭"
    ]
  },
  "zangba": {
    "name": "臧霸",
    "material": "髓",
    "names": [
      "大刀",
      "鎮寨大刀",
      "泰山開山刀",
      "劈山斷嶽鎮天刀"
    ]
  },
  "mateng": {
    "name": "馬騰",
    "material": "銅",
    "names": [
      "長槍",
      "伏波長槍",
      "西涼嘯天槍",
      "威震邊疆破天槍"
    ]
  },
  "hansui": {
    "name": "韓遂",
    "material": "銅",
    "names": [
      "長矛",
      "反骨長矛",
      "九曲黃河矛",
      "千迴百轉亂世矛"
    ]
  },
  "lisu": {
    "name": "李肅",
    "material": "銅",
    "names": [
      "長矛",
      "遊說長矛",
      "赤兔利誘矛",
      "金光破財穿心矛"
    ]
  },
  "yanxing": {
    "name": "閻行",
    "material": "銅",
    "names": [
      "長矛",
      "斷折長矛",
      "穿喉絕殺矛",
      "破虛殞命刺天矛"
    ]
  },
  "chenggongying": {
    "name": "成公英",
    "material": "砂",
    "names": [
      "長弓",
      "忠勇長弓",
      "玄鐵斷後弓",
      "忠勇斷後孤影弓"
    ]
  },
  "zhanglu": {
    "name": "張魯",
    "material": "魄",
    "names": [
      "道劍",
      "五斗道劍",
      "天師蕩魔劍",
      "萬法歸一太上劍"
    ]
  },
  "yanliang": {
    "name": "顏良",
    "material": "髓",
    "names": [
      "大刀",
      "劈山大刀",
      "河北上將刀",
      "威震華夏神魔刀"
    ]
  },
  "wenchou": {
    "name": "文丑",
    "material": "銅",
    "names": [
      "鐵槍",
      "怒血鐵槍",
      "雙雄破陣槍",
      "狂暴無雙碎天槍"
    ]
  },
  "jiling": {
    "name": "紀靈",
    "material": "髓",
    "names": [
      "三尖兩刃刀",
      "飲恨三尖刀",
      "轅門休戰刀",
      "號令群雄霸天刀"
    ]
  },
  "juyi": {
    "name": "鞠義",
    "material": "砂",
    "names": [
      "大黃弩",
      "先登大黃弩",
      "破陣穿雲弩",
      "萬箭穿心射日弩"
    ]
  },
  "jushou": {
    "name": "沮授",
    "material": "魄",
    "names": [
      "佩劍",
      "觀星佩劍",
      "七星監軍劍",
      "觀星明勢監軍劍"
    ]
  },
  "tianfeng": {
    "name": "田豐",
    "material": "玉",
    "names": [
      "竹簡",
      "剛直竹簡",
      "囚龍犯上簡",
      "寧死不屈浩然簡"
    ]
  },
  "lvlingqi": {
    "name": "呂玲綺",
    "material": "銅",
    "names": [
      "十字戟",
      "傳承十字戟",
      "鬼神風暴戟",
      "裂天碎地風神戟"
    ]
  },
  "yuanshao": {
    "name": "袁紹",
    "material": "魄",
    "names": [
      "思召劍",
      "王道思召劍",
      "四世三公劍",
      "號令天下皇極劍"
    ]
  },
  "yuanshu": {
    "name": "袁術",
    "material": "玉",
    "names": [
      "傳國玉璽",
      "僭越玉璽",
      "偽帝吞天璽",
      "逆天改命亂世璽"
    ]
  },
  "zhangjiao": {
    "name": "張角",
    "material": "絲",
    "names": [
      "九節杖",
      "太平九節杖",
      "呼風喚雨杖",
      "蒼天已死滅世杖"
    ]
  },
  "zhangbaoyj": {
    "name": "張寶",
    "material": "魄",
    "names": [
      "長劍",
      "飛沙長劍",
      "走石妖法劍",
      "移山倒海地魔劍"
    ]
  },
  "zhangliang": {
    "name": "張梁",
    "material": "髓",
    "names": [
      "大刀",
      "攝魂大刀",
      "妖法狂沙刀",
      "萬鬼噬心人魔刀"
    ]
  },
  "gongsunzan": {
    "name": "公孫瓚",
    "material": "銅",
    "names": [
      "雙頭馬槊",
      "追風馬槊",
      "白馬義從槊",
      "縱橫天下天馬槊"
    ]
  },
  "liubiao": {
    "name": "劉表",
    "material": "魄",
    "names": [
      "佩劍",
      "定風波佩劍",
      "荊襄九郡劍",
      "偏安一隅護世劍"
    ]
  },
  "shenpei": {
    "name": "審配",
    "material": "砂",
    "names": [
      "強弩",
      "死守強弩",
      "鄴城機關弩",
      "玉石俱焚滅世弩"
    ]
  },
  "taoqian": {
    "name": "陶謙",
    "material": "魄",
    "names": [
      "佩劍",
      "三讓佩劍",
      "仁德君子劍",
      "厚德載物天地劍"
    ]
  },
  "gaolan": {
    "name": "高覽",
    "material": "砂",
    "names": [
      "大斧",
      "擎天大斧",
      "庭柱開山斧",
      "穩如泰山震天斧"
    ]
  },
  "wutugu": {
    "name": "兀突骨",
    "material": "砂",
    "names": [
      "鐵骨朵",
      "烏鱗鐵骨朵",
      "烏鱗鎮嶽骨朵",
      "烏鱗蠻荒骨朵"
    ]
  },
  "mulu": {
    "name": "木鹿大王",
    "material": "絲",
    "names": [
      "獸骨杖",
      "御雷獸骨杖",
      "驅獸萬毒杖",
      "萬獸無疆洪荒杖"
    ]
  },
  "zuoci": {
    "name": "左慈",
    "material": "絲",
    "names": [
      "拂塵",
      "幻化拂塵",
      "遁甲玄機拂塵",
      "萬象森羅化境拂塵"
    ]
  },
  "yuji": {
    "name": "于吉",
    "material": "絲",
    "names": [
      "幡旗",
      "祛病靈幡",
      "太平清領幡",
      "咒怨纏身奪命幡"
    ]
  },
  "huatuo": {
    "name": "華佗",
    "material": "玉",
    "names": [
      "銀針",
      "麻沸銀針",
      "青囊渡世針",
      "起死回生造化針"
    ]
  },
  "guanlu": {
    "name": "管輅",
    "material": "玉",
    "names": [
      "龜甲",
      "知機龜甲",
      "萬象八卦甲",
      "洞悉天道知命甲"
    ]
  },
  "shuijing": {
    "name": "水鏡先生",
    "material": "絲",
    "names": [
      "羽扇",
      "點撥羽扇",
      "天機水鏡扇",
      "倒映乾坤明鏡扇"
    ]
  },
  "pangdegong": {
    "name": "龐德公",
    "material": "絲",
    "names": [
      "鳩杖",
      "隱世鳩杖",
      "鹿門紫竹杖",
      "超脫三界仙人杖"
    ]
  },
  "huangchengyan": {
    "name": "黃承彥",
    "material": "絲",
    "names": [
      "拐杖",
      "千機拐杖",
      "奇門遁甲杖",
      "奇門解陣引路杖"
    ]
  },
  "xushao": {
    "name": "許劭",
    "material": "玉",
    "names": [
      "竹簡",
      "判命竹簡",
      "月旦春秋簡",
      "一語成讖春秋簡"
    ]
  },
  "zhangzhongjing": {
    "name": "張仲景",
    "material": "玉",
    "names": [
      "藥葫蘆",
      "兩儀藥葫蘆",
      "太極神農葫蘆",
      "醫統天下濟世葫蘆"
    ]
  },
  "dongfeng": {
    "name": "董奉",
    "material": "玉",
    "names": [
      "藥箱",
      "濟世藥箱",
      "杏林春暖箱",
      "萬物復甦仙醫箱"
    ]
  },
  "guanning": {
    "name": "管寧",
    "material": "玉",
    "names": [
      "戒尺",
      "清心戒尺",
      "割席明志尺",
      "清節無塵問道尺"
    ]
  },
  "nanhua": {
    "name": "南華老仙",
    "material": "絲",
    "names": [
      "藜杖",
      "太平藜杖",
      "紫雷授道杖",
      "執掌天道造化杖"
    ]
  },
  "pujing": {
    "name": "普靜禪師",
    "material": "玉",
    "names": [
      "念珠",
      "點化念珠",
      "玉泉菩提珠",
      "普渡眾生大悲珠"
    ]
  }
};

export function makePersonalWeapon(generalId: string, grade = 0): Equipment {
  const d = WEAPON_CATALOG[generalId];
  if (!d || !Number.isInteger(grade) || grade < 0 || grade > 3) throw Error('專屬武器設定不存在');
  return { uid: `personal-${generalId}`, kind: 'weapon', fixedGeneralId: generalId, designId: generalId,
    name: `${WEAPON_GRADES[grade]}・${d.names[grade]}`, tier: grade * 3, penetration: WEAPON_PENETRATION[grade],
    force: 0, defense: 0, hp: 0, craft: {}, price: 0 };
}
export function weaponGrade(e: Equipment): number { return Math.floor(e.tier / 3); }
