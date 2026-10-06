/** 物品種類按權重抽取，再獨立決定品階；0 表示不隨機出現。 */
export const ITEM_CATALOG = [
  {
    "id": "heal",
    "name": "大還丹",
    "category": "丹藥",
    "stat": "alchemy",
    "timing": "both",
    "target": "ownGeneral",
    "battleTarget": "ownGeneral",
    "min": [
      20,
      35,
      50,
      65
    ],
    "stamina": [
      30,
      30,
      30,
      30
    ],
    "price": [
      1000,
      1500,
      2000,
      2500
    ],
    "sellPrice": [
      500,
      750,
      1000,
      1250
    ],
    "effects": [
      "回復 25% 血量",
      "回復 45% 血量",
      "回復 70% 血量",
      "回復 100% 血量"
    ],
    "noUser": false,
    "weight": 1
  },
  {
    "id": "force",
    "name": "神力丹",
    "category": "丹藥",
    "stat": "alchemy",
    "timing": "preroll",
    "target": "ownGeneral",
    "battleTarget": "none",
    "min": [
      30,
      50,
      70,
      90
    ],
    "stamina": [
      20,
      40,
      60,
      80
    ],
    "price": [
      2500,
      4500,
      7000,
      10000
    ],
    "sellPrice": [
      1250,
      2250,
      3500,
      5000
    ],
    "effects": [
      "基礎武力 +3",
      "基礎武力 +6",
      "基礎武力 +10",
      "基礎武力 +15"
    ],
    "noUser": false,
    "weight": 1
  },
  {
    "id": "guard",
    "name": "護體丹",
    "category": "丹藥",
    "stat": "alchemy",
    "timing": "preroll",
    "target": "ownGeneral",
    "battleTarget": "none",
    "min": [
      30,
      50,
      70,
      90
    ],
    "stamina": [
      20,
      40,
      60,
      80
    ],
    "price": [
      2500,
      4500,
      7000,
      10000
    ],
    "sellPrice": [
      1250,
      2250,
      3500,
      5000
    ],
    "effects": [
      "基礎防禦 +3",
      "基礎防禦 +6",
      "基礎防禦 +10",
      "基礎防禦+15"
    ],
    "noUser": false,
    "weight": 1
  },
  {
    "id": "qi",
    "name": "凝氣丹",
    "category": "丹藥",
    "stat": "alchemy",
    "timing": "preroll",
    "target": "ownGeneral",
    "battleTarget": "none",
    "min": [
      30,
      40,
      50,
      60
    ],
    "stamina": [
      30,
      40,
      50,
      60
    ],
    "price": [
      900,
      1800,
      3600,
      7200
    ],
    "sellPrice": [
      450,
      900,
      1800,
      3600
    ],
    "effects": [
      "修為 +300",
      "修為 +600",
      "修為 +1200",
      "修為 +2400"
    ],
    "noUser": false,
    "weight": 1
  },
  {
    "id": "essence",
    "name": "真元丹",
    "category": "丹藥",
    "stat": "alchemy",
    "timing": "preroll",
    "target": "ownGeneral",
    "battleTarget": "none",
    "min": [
      60,
      70,
      80,
      90
    ],
    "stamina": [
      60,
      70,
      80,
      90
    ],
    "price": [
      2500,
      4500,
      7000,
      10000
    ],
    "sellPrice": [
      1250,
      2250,
      3500,
      5000
    ],
    "effects": [
      "修為 +10%",
      "修為 +20%",
      "修為 +30%",
      "修為 +50%"
    ],
    "noUser": false,
    "weight": 1
  },
  {
    "id": "foundation",
    "name": "築基丹",
    "category": "丹藥",
    "stat": "alchemy",
    "timing": "preroll",
    "target": "ownGeneral",
    "battleTarget": "none",
    "min": [
      0
    ],
    "stamina": [
      20
    ],
    "price": [
      1000
    ],
    "sellPrice": [
      500
    ],
    "effects": [
      "煉氣突破築基的成功率提升至 100%"
    ],
    "noUser": false,
    "weight": 1
  },
  {
    "id": "vigor",
    "name": "回氣丹",
    "category": "丹藥",
    "stat": "alchemy",
    "timing": "preroll",
    "target": "ownGeneral",
    "battleTarget": "none",
    "min": [
      0,
      20,
      40,
      60
    ],
    "stamina": [
      0,
      0,
      0,
      0
    ],
    "price": [
      300,
      500,
      1000,
      1500
    ],
    "sellPrice": [
      150,
      250,
      500,
      750
    ],
    "effects": [
      "回復 30 體力",
      "回復 50 體力",
      "回復 80 體力",
      "回復 100 體力"
    ],
    "noUser": false,
    "weight": 1
  },
  {
    "id": "poison",
    "name": "斷腸毒丹",
    "category": "丹藥",
    "stat": "alchemy",
    "timing": "both",
    "target": "lord",
    "battleTarget": "enemyGeneral",
    "min": [
      30,
      40,
      50,
      60
    ],
    "stamina": [
      40,
      40,
      40,
      40
    ],
    "price": [
      1000,
      1800,
      2500,
      3500
    ],
    "sellPrice": [
      500,
      900,
      1250,
      1750
    ],
    "effects": [
      "戰鬥中每回合扣 4% 血量（3 回合）；平時隨機隨行武將直接扣 10% 血量",
      "戰鬥中每回合扣 7% 血量（3 回合）；平時隨機隨行武將直接扣 18% 血量",
      "戰鬥中每回合扣 10% 血量（3 回合）；平時隨機隨行武將直接扣 25% 血量",
      "戰鬥中每回合扣 15% 血量（3 回合）；平時隨機隨行武將直接扣 35% 血量"
    ],
    "noUser": false,
    "weight": 1
  },
  {
    "id": "clearmind",
    "name": "清心丹",
    "category": "丹藥",
    "stat": "alchemy",
    "timing": "preroll",
    "target": "ownGeneral",
    "battleTarget": "none",
    "min": [
      50
    ],
    "stamina": [
      50
    ],
    "price": [
      2500
    ],
    "sellPrice": [
      1250
    ],
    "effects": [
      "化解一名武將身上的心魔"
    ],
    "noUser": false,
    "weight": 1
  },
  {
    "id": "bone",
    "name": "壯骨丹",
    "category": "丹藥",
    "stat": "alchemy",
    "timing": "preroll",
    "target": "ownGeneral",
    "battleTarget": "none",
    "min": [
      30,
      50,
      70,
      90
    ],
    "stamina": [
      20,
      40,
      60,
      80
    ],
    "price": [
      2500,
      4500,
      7000,
      10000
    ],
    "sellPrice": [
      1250,
      2250,
      3500,
      5000
    ],
    "effects": [
      "永久血量 +15（基礎值，隨境界放大）",
      "永久血量 +30（基礎值，隨境界放大）",
      "永久血量 +60（基礎值，隨境界放大）",
      "永久血量 +120（基礎值，隨境界放大）"
    ],
    "noUser": false,
    "weight": 1
  },
  {
    "id": "breakpill",
    "name": "引雷丹",
    "category": "丹藥",
    "stat": "alchemy",
    "timing": "preroll",
    "target": "ownGeneral",
    "battleTarget": "none",
    "min": [
      50,
      60,
      70,
      80
    ],
    "stamina": [
      50,
      60,
      70,
      80
    ],
    "price": [
      1000,
      2500,
      5000,
      10000
    ],
    "sellPrice": [
      500,
      1250,
      2500,
      5000
    ],
    "effects": [
      "下次渡劫天雷傷害 -10%",
      "下次渡劫天雷傷害 -15%",
      "下次渡劫天雷傷害 -20%",
      "下次渡劫天雷傷害 -30%"
    ],
    "noUser": false,
    "weight": 1
  },
  {
    "id": "revive",
    "name": "還魂丹",
    "category": "丹藥",
    "stat": "alchemy",
    "timing": "preroll",
    "target": "deadGeneral",
    "battleTarget": "none",
    "min": [
      40,
      60,
      80,
      100
    ],
    "stamina": [
      40,
      60,
      80,
      100
    ],
    "price": [
      3000,
      8000,
      15000,
      40000
    ],
    "sellPrice": [
      1500,
      4000,
      7500,
      20000
    ],
    "effects": [
      "復活一名已死去的武將，歸入你的麾下：血量 10%、境界跌至凡人，修為歸零",
      "復活一名已死去的武將，歸入你的麾下：血量 30%、境界跌落 3 級，修為歸零",
      "復活一名已死去的武將，歸入你的麾下：血量 50%、境界跌落 1 級，修為歸零",
      "復活一名已死去的武將，歸入你的麾下：血量 100%、境界不變，修為不變"
    ],
    "noUser": false,
    "weight": 1
  },
  {
    "id": "rootup1",
    "name": "地品洗髓丹",
    "category": "丹藥",
    "stat": "alchemy",
    "timing": "preroll",
    "target": "ownGeneral",
    "battleTarget": "none",
    "min": [
      80
    ],
    "stamina": [
      80
    ],
    "price": [
      12000
    ],
    "sellPrice": [
      6000
    ],
    "effects": [
      "靈根提升 1 階（廢靈根→隨機五行靈根、隨機五行靈根→天靈根）"
    ],
    "noUser": false,
    "weight": 1
  },
  {
    "id": "rootup2",
    "name": "天品伐骨丹",
    "category": "丹藥",
    "stat": "alchemy",
    "timing": "preroll",
    "target": "ownGeneral",
    "battleTarget": "none",
    "min": [
      100
    ],
    "stamina": [
      100
    ],
    "price": [
      24000
    ],
    "sellPrice": [
      12000
    ],
    "effects": [
      "靈根提升 2 階（廢靈根→天靈根）"
    ],
    "noUser": false,
    "weight": 1
  },
  {
    "id": "reset",
    "name": "散功丹",
    "category": "丹藥",
    "stat": "alchemy",
    "timing": "preroll",
    "target": "ownGeneral",
    "battleTarget": "none",
    "min": [
      100
    ],
    "stamina": [
      100
    ],
    "price": [
      24000
    ],
    "sellPrice": [
      12000
    ],
    "effects": [
      "武將卸下功法，不損耗修為"
    ],
    "noUser": false,
    "weight": 1
  },
  {
    "id": "rage",
    "name": "狂暴丹",
    "category": "丹藥",
    "stat": "alchemy",
    "timing": "battle",
    "target": "none",
    "battleTarget": "ownGeneral",
    "min": [
      30,
      40,
      50,
      60
    ],
    "stamina": [
      40,
      40,
      40,
      40
    ],
    "price": [
      1500,
      3000,
      4500,
      6000
    ],
    "sellPrice": [
      750,
      1500,
      2250,
      3000
    ],
    "effects": [
      "戰鬥：本場擂台武力 +15%",
      "戰鬥：本場擂台武力 +25%",
      "戰鬥：本場擂台武力 +35%",
      "戰鬥：本場擂台武力 +50%"
    ],
    "noUser": false,
    "weight": 1
  },
  {
    "id": "five",
    "name": "五行轉生丹",
    "category": "丹藥",
    "stat": "alchemy",
    "timing": "preroll",
    "target": "ownGeneral",
    "battleTarget": "none",
    "min": [
      100
    ],
    "stamina": [
      100
    ],
    "price": [
      12000
    ],
    "sellPrice": [
      6000
    ],
    "effects": [
      "只能對五行靈根的武將使用，使用後可改變靈根為指定靈根"
    ],
    "noUser": false,
    "weight": 1
  },
  {
    "id": "teleport",
    "name": "傳送陣",
    "category": "陣法",
    "stat": "formation",
    "timing": "preroll",
    "target": "tile",
    "battleTarget": "none",
    "min": [
      60
    ],
    "stamina": [
      50
    ],
    "price": [
      3000
    ],
    "sellPrice": [
      1500
    ],
    "effects": [
      "傳送至地圖上任一格（取代本回合擲骰）"
    ],
    "noUser": false,
    "weight": 1
  },
  {
    "id": "confuse",
    "name": "迷魂陣",
    "category": "陣法",
    "stat": "formation",
    "timing": "preroll",
    "target": "lord",
    "battleTarget": "none",
    "min": [
      80
    ],
    "stamina": [
      40
    ],
    "price": [
      4000
    ],
    "sellPrice": [
      2000
    ],
    "effects": [
      "指定其他主公下回合前往指定地點"
    ],
    "noUser": false,
    "weight": 1
  },
  {
    "id": "citadel",
    "name": "護城大陣",
    "category": "陣法",
    "stat": "formation",
    "timing": "preroll",
    "target": "ownCity",
    "battleTarget": "none",
    "min": [
      50
    ],
    "stamina": [
      40
    ],
    "price": [
      2000
    ],
    "sellPrice": [
      1000
    ],
    "effects": [
      "己方城池 5 回合內守軍戰力 ×1.5"
    ],
    "noUser": false,
    "weight": 1
  },
  {
    "id": "thunderward",
    "name": "避雷陣",
    "category": "陣法",
    "stat": "formation",
    "timing": "preroll",
    "target": "ownGeneral",
    "battleTarget": "none",
    "min": [
      100
    ],
    "stamina": [
      100
    ],
    "price": [
      10000
    ],
    "sellPrice": [
      5000
    ],
    "effects": [
      "為武將佈陣護法，下次渡劫天雷傷害 -50%"
    ],
    "noUser": false,
    "weight": 1
  },
  {
    "id": "fiveward",
    "name": "五行防禦陣",
    "category": "陣法",
    "stat": "formation",
    "timing": "preroll",
    "target": "ownGeneral",
    "battleTarget": "none",
    "min": [
      60
    ],
    "stamina": [
      60
    ],
    "price": [
      6000
    ],
    "sellPrice": [
      3000
    ],
    "effects": [
      "下次渡劫天雷傷害 -30%（可與避雷陣疊加，最多減免 80%）"
    ],
    "noUser": false,
    "weight": 1
  },
  {
    "id": "illusion",
    "name": "幻境陣",
    "category": "陣法",
    "stat": "formation",
    "timing": "preroll",
    "target": "enemyGeneral",
    "battleTarget": "none",
    "min": [
      80
    ],
    "stamina": [
      40
    ],
    "price": [
      4000
    ],
    "sellPrice": [
      2000
    ],
    "effects": [
      "以幻境引動心魔：下次突破成功率 -60%，或雷劫威力 ×2"
    ],
    "noUser": false,
    "weight": 1
  },
  {
    "id": "mend",
    "name": "回春陣",
    "category": "陣法",
    "stat": "formation",
    "timing": "preroll",
    "target": "none",
    "battleTarget": "none",
    "min": [
      30,
      40,
      50,
      60
    ],
    "stamina": [
      30,
      40,
      50,
      60
    ],
    "price": [
      900,
      1800,
      3600,
      5400
    ],
    "sellPrice": [
      450,
      900,
      1800,
      2700
    ],
    "effects": [
      "全體隨行武將回復 15% 血量",
      "全體隨行武將回復 30% 血量",
      "全體隨行武將回復 45% 血量",
      "全體隨行武將回復 70% 血量"
    ],
    "noUser": false,
    "weight": 1
  },
  {
    "id": "vein",
    "name": "地脈陣",
    "category": "陣法",
    "stat": "formation",
    "timing": "preroll",
    "target": "ownCity",
    "battleTarget": "none",
    "min": [
      50,
      60,
      70,
      80
    ],
    "stamina": [
      50,
      60,
      70,
      80
    ],
    "price": [
      1000,
      2500,
      5000,
      10000
    ],
    "sellPrice": [
      500,
      1250,
      2500,
      5000
    ],
    "effects": [
      "己方一座城池繁榮度 +10",
      "己方一座城池繁榮度 +15",
      "己方一座城池繁榮度 +20",
      "己方一座城池繁榮度 +30"
    ],
    "noUser": false,
    "weight": 1
  },
  {
    "id": "mist",
    "name": "迷蹤陣",
    "category": "陣法",
    "stat": "formation",
    "timing": "battle",
    "target": "none",
    "battleTarget": "enemyGeneral",
    "min": [
      30,
      45,
      60,
      75
    ],
    "stamina": [
      40,
      40,
      40,
      40
    ],
    "price": [
      1000,
      2500,
      5000,
      10000
    ],
    "sellPrice": [
      500,
      1250,
      2500,
      5000
    ],
    "effects": [
      "戰鬥：本場擂台敵將武力 -10%",
      "戰鬥：本場擂台敵將武力 -15%",
      "戰鬥：本場擂台敵將武力 -20%",
      "戰鬥：本場擂台敵將武力 -30%"
    ],
    "noUser": false,
    "weight": 1
  },
  {
    "id": "sacrifice",
    "name": "血祭陣",
    "category": "陣法",
    "stat": "formation",
    "timing": "preroll",
    "target": "enemyCity",
    "battleTarget": "none",
    "min": [
      30,
      40,
      50,
      60
    ],
    "stamina": [
      30,
      40,
      50,
      60
    ],
    "price": [
      1000,
      2500,
      5000,
      10000
    ],
    "sellPrice": [
      500,
      1250,
      2500,
      5000
    ],
    "effects": [
      "使敵方城池駐軍減少10%",
      "使敵方城池駐軍減少15%",
      "使敵方城池駐軍減少20%",
      "使敵方城池駐軍減少30%"
    ],
    "noUser": false,
    "weight": 1
  },
  {
    "id": "seven",
    "name": "七星續命陣",
    "category": "陣法",
    "stat": "formation",
    "timing": "preroll",
    "target": "ownGeneral",
    "battleTarget": "none",
    "min": [
      80
    ],
    "stamina": [
      80
    ],
    "price": [
      15000
    ],
    "sellPrice": [
      7500
    ],
    "effects": [
      "指定武將下次度劫時若死亡，則滿血復活，境界不變，修為-50%"
    ],
    "noUser": false,
    "weight": 1
  },
  {
    "id": "invert",
    "name": "顛倒陰陽陣",
    "category": "陣法",
    "stat": "formation",
    "timing": "battle",
    "target": "none",
    "battleTarget": "enemyGeneral",
    "min": [
      70
    ],
    "stamina": [
      40
    ],
    "price": [
      5000
    ],
    "sellPrice": [
      2500
    ],
    "effects": [
      "戰鬥：使雙方武力、防禦暫時顛倒，直到戰鬥結束"
    ],
    "noUser": false,
    "weight": 1
  },
  {
    "id": "lock",
    "name": "鎖仙陣",
    "category": "陣法",
    "stat": "formation",
    "timing": "preroll",
    "target": "lord",
    "battleTarget": "none",
    "min": [
      60
    ],
    "stamina": [
      40
    ],
    "price": [
      4000
    ],
    "sellPrice": [
      2000
    ],
    "effects": [
      "敵人強制停留一回合，且無法使用任何物品。"
    ],
    "noUser": false,
    "weight": 1
  },
  {
    "id": "graft",
    "name": "移花接木陣",
    "category": "陣法",
    "stat": "formation",
    "timing": "preroll",
    "target": "enemyCity",
    "battleTarget": "none",
    "min": [
      100
    ],
    "stamina": [
      100
    ],
    "price": [
      80000
    ],
    "sellPrice": [
      40000
    ],
    "effects": [
      "將我方城池和敵方城池互換，其中的駐將及士兵也一同轉移"
    ],
    "noUser": false,
    "weight": 1
  },
  {
    "id": "dice",
    "name": "控骰符",
    "category": "符籙",
    "stat": "talisman",
    "timing": "preroll",
    "target": "dice",
    "battleTarget": "none",
    "min": [
      50
    ],
    "stamina": [
      30
    ],
    "price": [
      2500
    ],
    "sellPrice": [
      1250
    ],
    "effects": [
      "本回合骰子點數由你決定"
    ],
    "noUser": false,
    "weight": 1
  },
  {
    "id": "stride",
    "name": "縮地符",
    "category": "符籙",
    "stat": "talisman",
    "timing": "preroll",
    "target": "none",
    "battleTarget": "none",
    "min": [
      40
    ],
    "stamina": [
      20
    ],
    "price": [
      1500
    ],
    "sellPrice": [
      750
    ],
    "effects": [
      "本回合擲兩顆骰子"
    ],
    "noUser": false,
    "weight": 1
  },
  {
    "id": "freeze",
    "name": "定身符",
    "category": "符籙",
    "stat": "talisman",
    "timing": "preroll",
    "target": "lord",
    "battleTarget": "none",
    "min": [
      60
    ],
    "stamina": [
      40
    ],
    "price": [
      4000
    ],
    "sellPrice": [
      2000
    ],
    "effects": [
      "敵人強制停留一回合，且無法使用任何物品。"
    ],
    "noUser": false,
    "weight": 1
  },
  {
    "id": "ghost",
    "name": "五鬼搬運符",
    "category": "符籙",
    "stat": "talisman",
    "timing": "preroll",
    "target": "lord",
    "battleTarget": "none",
    "min": [
      60
    ],
    "stamina": [
      40
    ],
    "price": [
      2000
    ],
    "sellPrice": [
      1000
    ],
    "effects": [
      "盜取指定主公 10% 靈石"
    ],
    "noUser": false,
    "weight": 1
  },
  {
    "id": "demon",
    "name": "走火入魔符",
    "category": "符籙",
    "stat": "talisman",
    "timing": "preroll",
    "target": "enemyGeneral",
    "battleTarget": "none",
    "min": [
      80
    ],
    "stamina": [
      40
    ],
    "price": [
      4000
    ],
    "sellPrice": [
      2000
    ],
    "effects": [
      "心魔干擾敵將：下次突破成功率 -60%，或雷劫威力 ×2"
    ],
    "noUser": false,
    "weight": 1
  },
  {
    "id": "siegebreak",
    "name": "破城符",
    "category": "符籙",
    "stat": "talisman",
    "timing": "preroll",
    "target": "none",
    "battleTarget": "none",
    "min": [
      60
    ],
    "stamina": [
      40
    ],
    "price": [
      4000
    ],
    "sellPrice": [
      2000
    ],
    "effects": [
      "本回合攻城戰力 ×1.2"
    ],
    "noUser": false,
    "weight": 1
  },
  {
    "id": "shield",
    "name": "護身符",
    "category": "符籙",
    "stat": "talisman",
    "timing": "battle",
    "target": "none",
    "battleTarget": "ownGeneral",
    "min": [
      30,
      45,
      60,
      75
    ],
    "stamina": [
      40,
      40,
      40,
      40
    ],
    "price": [
      1000,
      2500,
      5000,
      10000
    ],
    "sellPrice": [
      500,
      1250,
      2500,
      5000
    ],
    "effects": [
      "戰鬥：為己方武將套上 15% 血量的護罩",
      "戰鬥：為己方武將套上 25% 血量的護罩",
      "戰鬥：為己方武將套上 40% 血量的護罩",
      "戰鬥：為己方武將套上 60% 血量的護罩"
    ],
    "noUser": false,
    "weight": 1
  },
  {
    "id": "charge",
    "name": "蓄能符",
    "category": "符籙",
    "stat": "talisman",
    "timing": "battle",
    "target": "none",
    "battleTarget": "ownGeneral",
    "min": [
      20
    ],
    "stamina": [
      20
    ],
    "price": [
      2000
    ],
    "sellPrice": [
      1000
    ],
    "effects": [
      "戰鬥：立即獲得 100 點能量"
    ],
    "noUser": false,
    "weight": 1
  },
  {
    "id": "drain",
    "name": "奪靈符",
    "category": "符籙",
    "stat": "talisman",
    "timing": "battle",
    "target": "none",
    "battleTarget": "none",
    "min": [
      60
    ],
    "stamina": [
      40
    ],
    "price": [
      2000
    ],
    "sellPrice": [
      1000
    ],
    "effects": [
      "戰鬥：敵方無法使用物品"
    ],
    "noUser": false,
    "weight": 1
  },
  {
    "id": "soldiers",
    "name": "撒豆成兵符",
    "category": "符籙",
    "stat": "talisman",
    "timing": "preroll",
    "target": "none",
    "battleTarget": "none",
    "min": [
      30,
      45,
      60,
      75
    ],
    "stamina": [
      40,
      40,
      40,
      40
    ],
    "price": [
      1500,
      3000,
      4500,
      6000
    ],
    "sellPrice": [
      750,
      1500,
      2250,
      3000
    ],
    "effects": [
      "化出 2000 名士兵",
      "化出 4000 名士兵",
      "化出 6000 名士兵",
      "化出 8000 名士兵"
    ],
    "noUser": false,
    "weight": 1
  },
  {
    "id": "confusing",
    "name": "迷魂符",
    "category": "符籙",
    "stat": "talisman",
    "timing": "preroll",
    "target": "lord",
    "battleTarget": "none",
    "min": [
      80
    ],
    "stamina": [
      40
    ],
    "price": [
      4000
    ],
    "sellPrice": [
      2000
    ],
    "effects": [
      "指定其他主公下回合前往指定地點"
    ],
    "noUser": false,
    "weight": 1
  },
  {
    "id": "transmission",
    "name": "傳音符",
    "category": "符籙",
    "stat": "talisman",
    "timing": "preroll",
    "target": "ownCity",
    "battleTarget": "none",
    "min": [
      10
    ],
    "stamina": [
      10
    ],
    "price": [
      100
    ],
    "sellPrice": [
      50
    ],
    "effects": [
      "任意調遣一座城池的兵力"
    ],
    "noUser": false,
    "weight": 1
  },
  {
    "id": "move",
    "name": "五鬼搬財符",
    "category": "符籙",
    "stat": "talisman",
    "timing": "preroll",
    "target": "lord",
    "battleTarget": "none",
    "min": [
      30
    ],
    "stamina": [
      30
    ],
    "price": [
      2000
    ],
    "sellPrice": [
      1000
    ],
    "effects": [
      "隨機偷取指定主公的任一一個丹藥/法器/符籙/陣法"
    ],
    "noUser": false,
    "weight": 1
  },
  {
    "id": "breath",
    "name": "斂息符",
    "category": "符籙",
    "stat": "talisman",
    "timing": "preroll",
    "target": "none",
    "battleTarget": "none",
    "min": [
      30
    ],
    "stamina": [
      30
    ],
    "price": [
      1000
    ],
    "sellPrice": [
      500
    ],
    "effects": [
      "接下來3回合內無需付過路費"
    ],
    "noUser": false,
    "weight": 1
  },
  {
    "id": "substitute",
    "name": "替身符",
    "category": "符籙",
    "stat": "talisman",
    "timing": "event",
    "target": "none",
    "battleTarget": "none",
    "min": [
      40
    ],
    "stamina": [
      40
    ],
    "price": [
      3000
    ],
    "sellPrice": [
      1500
    ],
    "effects": [
      "當敵人對主公發動物品時可選擇使用，使物品效果失效(非戰鬥)"
    ],
    "noUser": false,
    "weight": 1
  },
  {
    "id": "rootdown",
    "name": "噬脈絕根符",
    "category": "符籙",
    "stat": "talisman",
    "timing": "preroll",
    "target": "enemyGeneral",
    "battleTarget": "none",
    "min": [
      100
    ],
    "stamina": [
      100
    ],
    "price": [
      24000
    ],
    "sellPrice": [
      12000
    ],
    "effects": [
      "將敵方指定武將的靈根變為廢靈根"
    ],
    "noUser": false,
    "weight": 1
  },
  {
    "id": "truce",
    "name": "免戰牌",
    "category": "法器",
    "stat": "forging",
    "timing": "event",
    "target": "none",
    "battleTarget": "none",
    "min": [
      60
    ],
    "stamina": [
      40
    ],
    "price": [
      2000
    ],
    "sellPrice": [
      1000
    ],
    "effects": [
      "踏入敵城時可選擇使用，免繳過路費"
    ],
    "noUser": true,
    "weight": 1
  },
  {
    "id": "vajra",
    "name": "金剛罩",
    "category": "法器",
    "stat": "forging",
    "timing": "battle",
    "target": "none",
    "battleTarget": "ownGeneral",
    "min": [
      80
    ],
    "stamina": [
      40
    ],
    "price": [
      6000
    ],
    "sellPrice": [
      3000
    ],
    "effects": [
      "戰鬥：為己方武將套上可吸收 50% 血量的護罩"
    ],
    "noUser": false,
    "weight": 1
  },
  {
    "id": "ring",
    "name": "乾坤圈",
    "category": "法器",
    "stat": "forging",
    "timing": "battle",
    "target": "none",
    "battleTarget": "enemyGeneral",
    "min": [
      30,
      50,
      70,
      90
    ],
    "stamina": [
      40,
      40,
      40,
      40
    ],
    "price": [
      1000,
      2500,
      5000,
      10000
    ],
    "sellPrice": [
      500,
      1250,
      2500,
      5000
    ],
    "effects": [
      "戰鬥：敵將無法攻擊1回合",
      "戰鬥：敵將無法攻擊2回合",
      "戰鬥：敵將無法攻擊3回合",
      "戰鬥：敵將無法攻擊4回合"
    ],
    "noUser": false,
    "weight": 1
  },
  {
    "id": "shuttle",
    "name": "遁地梭",
    "category": "法器",
    "stat": "forging",
    "timing": "preroll",
    "target": "none",
    "battleTarget": "none",
    "min": [
      20
    ],
    "stamina": [
      20
    ],
    "price": [
      2000
    ],
    "sellPrice": [
      1000
    ],
    "effects": [
      "本回合移動點數 x2"
    ],
    "noUser": false,
    "weight": 1
  },
  {
    "id": "bowl",
    "name": "聚寶盆",
    "category": "法器",
    "stat": "forging",
    "timing": "preroll",
    "target": "none",
    "battleTarget": "none",
    "min": [
      30,
      45,
      60,
      75
    ],
    "stamina": [
      40,
      40,
      40,
      40
    ],
    "price": [
      1500,
      3000,
      4500,
      6000
    ],
    "sellPrice": [
      750,
      1500,
      2250,
      3000
    ],
    "effects": [
      "獲得當前靈石的5%",
      "獲得當前靈石的10%",
      "獲得當前靈石的15%",
      "獲得當前靈石的20%"
    ],
    "noUser": false,
    "weight": 1
  },
  {
    "id": "bag",
    "name": "乾坤袋",
    "category": "法器",
    "stat": "forging",
    "timing": "preroll",
    "target": "none",
    "battleTarget": "none",
    "min": [
      60
    ],
    "stamina": [
      40
    ],
    "price": [
      2000
    ],
    "sellPrice": [
      1000
    ],
    "effects": [
      "獲得隨機一個丹藥/陣法/符籙/法器"
    ],
    "noUser": false,
    "weight": 1
  },
  {
    "id": "cloud",
    "name": "筋斗雲",
    "category": "法器",
    "stat": "forging",
    "timing": "preroll",
    "target": "tile",
    "battleTarget": "none",
    "min": [
      60
    ],
    "stamina": [
      50
    ],
    "price": [
      3000
    ],
    "sellPrice": [
      1500
    ],
    "effects": [
      "傳送至地圖上任一格（取代本回合擲骰）"
    ],
    "noUser": false,
    "weight": 1
  },
  {
    "id": "bow",
    "name": "落日弓",
    "category": "法器",
    "stat": "forging",
    "timing": "preroll",
    "target": "lord",
    "battleTarget": "none",
    "min": [
      30,
      45,
      60,
      75
    ],
    "stamina": [
      40,
      40,
      40,
      40
    ],
    "price": [
      1000,
      1800,
      2500,
      3500
    ],
    "sellPrice": [
      500,
      900,
      1250,
      1750
    ],
    "effects": [
      "指定主公隨機隨行武將直接扣 20% 血量",
      "指定主公隨機隨行武將直接扣 30% 血量",
      "指定主公隨機隨行武將直接扣 40% 血量",
      "指定主公隨機隨行武將直接扣 50% 血量"
    ],
    "noUser": false,
    "weight": 1
  },
  {
    "id": "blood",
    "name": "嗜血珠",
    "category": "法器",
    "stat": "forging",
    "timing": "battle",
    "target": "none",
    "battleTarget": "enemyGeneral",
    "min": [
      30,
      45,
      60,
      75
    ],
    "stamina": [
      40,
      40,
      40,
      40
    ],
    "price": [
      1000,
      2500,
      5000,
      10000
    ],
    "sellPrice": [
      500,
      1250,
      2500,
      5000
    ],
    "effects": [
      "戰鬥：發動後的五回合內，造成的戰鬥傷害有 10% 轉化為自身的生命值",
      "戰鬥：發動後的五回合內，造成的戰鬥傷害有 15% 轉化為自身的生命值",
      "戰鬥：發動後的五回合內，造成的戰鬥傷害有 20% 轉化為自身的生命值",
      "戰鬥：發動後的五回合內，造成的戰鬥傷害有 30% 轉化為自身的生命值"
    ],
    "noUser": false,
    "weight": 1
  },
  {
    "id": "wheel",
    "name": "風火輪",
    "category": "法器",
    "stat": "forging",
    "timing": "preroll",
    "target": "none",
    "battleTarget": "none",
    "min": [
      30
    ],
    "stamina": [
      40
    ],
    "price": [
      2000
    ],
    "sellPrice": [
      1000
    ],
    "effects": [
      "下次遇到岔路時，可選擇要往哪邊前進"
    ],
    "noUser": false,
    "weight": 1
  },
  {
    "id": "totem",
    "name": "不死圖騰",
    "category": "法器",
    "stat": "forging",
    "timing": "event",
    "target": "none",
    "battleTarget": "none",
    "min": [
      0
    ],
    "stamina": [
      0
    ],
    "price": [
      50000
    ],
    "sellPrice": [
      25000
    ],
    "effects": [
      "任何武將、主公死亡時，可選擇使用，免疫一次死亡"
    ],
    "noUser": true,
    "weight": 1
  }
] as const;
