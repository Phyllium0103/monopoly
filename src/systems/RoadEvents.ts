import type { GameState, Lord } from '../game/types';
import { freeGenerals, generalsOf, nextUid } from '../game/GameState';
import { fmtStones } from '../game/Currency';
import { ITEM_DEFS, PILL_IDS, itemName, makeEquipment, makeItem, makeTechnique, rollItemId } from '../data/items';
import { addExp, craft, maxHp } from './GeneralSystem';

export interface RoadOption {
  label: string;
  sub: string;
  disabled?: boolean;
  reason?: string;
  apply: () => string;
}

export interface RoadEvent {
  icon: string;
  title: string;
  /** 情境敘述 */
  story: string;
  tone: 'good' | 'bad' | 'neutral';
  /** 沒有選項的事件直接結算，回傳結果敘述 */
  apply?: () => string;
  /** 有選項時由玩家決定，電腦選第一個可行的 */
  options?: RoadOption[];
}

interface Ctx {
  state: GameState;
  lord: Lord;
  place: string;
}

interface Def {
  weight: number;
  build: (c: Ctx) => RoadEvent;
}

const rand = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

/** 隨回合推進，奇遇的獎勵也更豐厚 */
const scale = (c: Ctx) => 1 + c.state.round / 20;

function giveItem(c: Ctx, defId: string | null, tier: number) {
  if (!defId) return '無符合權重的物品，未取得獎勵';
  const item = makeItem(nextUid(c.state, 'i'), defId, tier);
  c.lord.items.push(item);
  return itemName(item.defId, item.tier);
}

const TALISMANS = Object.keys(ITEM_DEFS).filter(id => ITEM_DEFS[id].category === '符籙');
const FORMATIONS = Object.keys(ITEM_DEFS).filter(id => ITEM_DEFS[id].category === '陣法');
const ARTIFACTS = Object.keys(ITEM_DEFS).filter(id => ITEM_DEFS[id].category === '法器');

const DEFS: Def[] = [
  // ───── 靈石與士兵 ─────
  {
    weight: 8,
    build: (c) => {
      const n = Math.round(rand(500, 1300) * scale(c));
      return {
        icon: '💰',
        title: '拾得遺財',
        tone: 'good',
        story: `行經${c.place}，溪邊草叢裡露出一只鼓鼓的錢袋，不知是哪支商隊匆忙逃難時遺落的。四下無人，你命親兵把它收了起來。`,
        apply: () => {
          c.lord.stones += n;
          return `錢袋裡是 ${fmtStones(n)} 的靈石。`;
        },
      };
    },
  },
  {
    weight: 6,
    build: (c) => {
      const n = rand(300, 900);
      return {
        icon: '🛡️',
        title: '義勇來投',
        tone: 'good',
        story: `${c.place}一帶的青壯聽聞你的名號，扛著鋤頭、削尖的竹槍自發聚在道旁，齊聲請求編入行伍。`,
        apply: () => {
          c.lord.soldiers += n;
          return `你收編了 ${n} 名義勇，士兵 +${n}。`;
        },
      };
    },
  },
  {
    weight: 3,
    build: (c) => {
      const n = rand(400, 1000);
      return {
        icon: '🏳️',
        title: '潰兵來降',
        tone: 'good',
        story: `一隊被打散的敗兵在${c.place}外徘徊，既無糧草也無主帥。見你軍容整肅，為首的老校尉上前解下佩刀，願率部卒歸降。`,
        apply: () => {
          c.lord.soldiers += n;
          return `潰兵 ${n} 人編入你的麾下。`;
        },
      };
    },
  },
  {
    weight: 5,
    build: (c) => {
      const n = Math.max(60, Math.round(c.lord.soldiers * 0.06));
      return {
        icon: '🗡️',
        title: '山賊伏擊',
        tone: 'bad',
        story: `隊伍穿過${c.place}的狹窄谷道時，兩側山崖忽然滾下亂石，一群蒙面山賊呼嘯著衝下來搶奪輜重。`,
        apply: () => {
          c.lord.soldiers = Math.max(0, c.lord.soldiers - n);
          return `雖擊退了賊人，仍折損 ${n} 名士兵。`;
        },
      };
    },
  },
  {
    weight: 3,
    build: (c) => {
      const n = Math.min(4000, Math.round(c.lord.stones * 0.04));
      return {
        icon: '🥷',
        title: '夜來盜賊',
        tone: 'bad',
        story: `夜宿${c.place}的驛舍，三更時分，一個黑影翻窗而入，撬走了床底的箱籠，等親兵驚醒時早已翻牆遠去。`,
        apply: () => {
          c.lord.stones = Math.max(0, c.lord.stones - n);
          return `被盜走 ${fmtStones(n)}。`;
        },
      };
    },
  },
  // ───── 療傷與修煉 ─────
  {
    weight: 4,
    build: (c) => ({
      icon: '♨️',
      title: '靈泉',
      tone: 'good',
      story: `${c.place}的山坳裡蒸騰著淡淡的白霧，一汪靈泉汩汩湧出，泉水入口甘甜，沁出絲絲靈氣。眾將不由得停下腳步，在泉邊調息。`,
      apply: () => {
        for (const g of generalsOf(c.state, c.lord.id)) if (g.status !== 'realm') g.hp = Math.min(maxHp(g), g.hp + Math.round(maxHp(g) * 0.2));
        return '眾將傷勢回復兩成。';
      },
    }),
  },
  {
    weight: 3,
    build: (c) => ({
      icon: '🍵',
      title: '野店歇腳',
      tone: 'good',
      story: `日頭偏西，${c.place}路邊有一間掛著酒旗的野店。掌櫃的熱情招呼，熱茶、胡餅管夠，還讓出後院讓將士們歇息。`,
      apply: () => {
        const party = freeGenerals(c.state, c.lord.id);
        for (const g of party) g.stamina = Math.min(100, g.stamina + 25);
        return `隨行武將體力各回復 25（共 ${party.length} 人）。`;
      },
    }),
  },
  {
    weight: 3,
    build: (c) => {
      const party = freeGenerals(c.state, c.lord.id);
      return {
        icon: '🧘',
        title: '高人論道',
        tone: 'good',
        story: `${c.place}的古柏下坐著一位白鬚道人，正自斟自飲。他瞥了你的隊伍一眼，笑道：「有緣之人，老道便與你的部下說上幾句。」`,
        apply: () => {
          const g = party.length ? pick(party) : null;
          if (!g) return '可惜身邊沒有隨行武將，道人搖搖頭，又閉上了眼睛。';
          const n = addExp(g, Math.round(rand(60, 140) * scale(c)));
          return `${g.name}聽君一席話，頓覺豁然開朗，修為 +${n}。`;
        },
      };
    },
  },
  {
    weight: 2,
    build: (c) => ({
      icon: '☠️',
      title: '毒瘴',
      tone: 'bad',
      story: `進入${c.place}後，林間漸漸瀰漫起一股甜腥的灰綠色霧氣。等察覺不對時，不少人已頭暈目眩、腳步虛浮。`,
      apply: () => {
        for (const g of freeGenerals(c.state, c.lord.id)) g.hp = Math.max(1, g.hp - Math.round(maxHp(g) * 0.08));
        return '隨行武將吸入毒瘴，各損失 8% 血量。';
      },
    }),
  },
  // ───── 丹藥、符籙、陣法、法器 ─────
  {
    weight: 6,
    build: (c) => ({
      icon: '💊',
      title: '散修贈丹',
      tone: 'good',
      story: `${c.place}的路旁，一位衣衫襤褸的散修正被野狗圍困，你的親兵上前驅散了牠們。散修感激涕零，從懷裡摸出一只小瓷瓶：「無以為報，這丹藥便贈予恩公。」`,
      apply: () => `獲贈「${giveItem(c, rollItemId(PILL_IDS), rand(0, 1))}」。`,
    }),
  },
  {
    weight: 3,
    build: (c) => ({
      icon: '🏺',
      title: '古洞遺丹',
      tone: 'good',
      story: `${c.place}一側的崖壁被雨水沖開，露出一個幽深的洞穴。洞中石龕裡供著一只落滿塵土的丹爐，爐底還殘留著幾顆溫潤的丹藥。`,
      apply: () => `取得「${giveItem(c, rollItemId(PILL_IDS), rand(1, 2))}」。`,
    }),
  },
  {
    weight: 4,
    build: (c) => ({
      icon: '📿',
      title: '老道贈符',
      tone: 'good',
      story: `${c.place}的土地廟前，一位老道人正在整理符紙。他見你氣宇不凡，隨手抽出一張黃符遞來：「貧道看你將來必有大用，此符便送你防身。」`,
      apply: () => `獲贈「${giveItem(c, rollItemId(TALISMANS), rand(0, 1))}」。`,
    }),
  },
  {
    weight: 4,
    build: (c) => ({
      icon: '🔯',
      title: '殘破陣盤',
      tone: 'good',
      story: `${c.place}的荒草堆裡半埋著一塊刻滿紋路的青石盤，是前朝方士遺留下的陣盤，雖已殘缺，核心的陣眼卻還完好。`,
      apply: () => `修補後可用：「${giveItem(c, rollItemId(FORMATIONS), rand(0, 1))}」。`,
    }),
  },
  {
    weight: 3,
    build: (c) => ({
      icon: '🔔',
      title: '鐵匠贈器',
      tone: 'good',
      story: `${c.place}的鐵匠鋪裡爐火正旺，老鐵匠在打一件奇怪的小東西。他說這是祖上傳下的法器圖樣，多年來沒人識貨，今日見你帶兵經過，便做主送給你。`,
      apply: () => `獲贈「${giveItem(c, rollItemId(ARTIFACTS), rand(0, 1))}」。`,
    }),
  },
  // ───── 黃、玄階的功法與寶衣 ─────
  {
    weight: 3,
    build: (c) => {
      const t = makeTechnique(nextUid(c.state, 't'), rand(0, 5));
      return {
        icon: '📜',
        title: '荒廟壁畫',
        tone: 'good',
        story: `暴雨驟至，隊伍在${c.place}外的一座荒廟裡避雨。借著閃電的光亮，你發現斑駁的壁畫並非佛像，而是一套連貫的吐納行功圖，旁邊還有蠅頭小字註解。`,
        apply: () => {
          c.lord.scrolls.push(t);
          return `命書吏抄錄成冊，得功法「${t.name}」。`;
        },
      };
    },
  },
  {
    weight: 3,
    build: (c) => {
      const e = makeEquipment(nextUid(c.state, 'e'), 'armor', rand(0, 5));
      return {
        icon: '🦺',
        title: '老將贈甲',
        tone: 'good',
        story: `${c.place}的茅屋前，一位獨臂老兵倚著門框曬太陽。他看著你軍中的旗號，沉默良久，從屋裡捧出一件保養得鋥亮的舊甲：「跟了老夫半輩子，今日給能用得上它的人。」`,
        apply: () => {
          c.lord.gear.push(e);
          return `你鄭重收下，得寶衣「${e.name}」。`;
        },
      };
    },
  },
  // ───── 需要抉擇的奇遇 ─────
  {
    weight: 3,
    build: (c) => {
      const lose = 120;
      return {
        icon: '🐫',
        title: '受困商旅',
        tone: 'neutral',
        story: `${c.place}外的官道上，一支商隊被一夥流寇堵住，貨車翻倒，商人們抱頭哀號。為首的老掌櫃遠遠望見你的旗號，高聲呼救。`,
        options: [
          {
            label: '⚔️ 出手相救',
            sub: `折損約 ${lose} 名士兵，商隊必有厚報`,
            disabled: c.lord.soldiers < lose * 2,
            reason: '士兵不足',
            apply: () => {
              c.lord.soldiers -= lose;
              const n = Math.round(rand(1500, 2800) * scale(c));
              c.lord.stones += n;
              const name = giveItem(c, rollItemId(PILL_IDS), rand(0, 1));
              return `流寇四散而逃，你折損 ${lose} 人。老掌櫃千恩萬謝，奉上 ${fmtStones(n)} 與一顆「${name}」。`;
            },
          },
          { label: '🚶 視而不見', sub: '亂世之中，各安天命', apply: () => '你冷眼旁觀，帶隊繞道而行，身後的哀呼聲漸漸遠去。' },
        ],
      };
    },
  },
  {
    weight: 2,
    build: (c) => {
      const party = freeGenerals(c.state, c.lord.id);
      const best = [...party].sort((a, b) => craft(b, 'formation') - craft(a, 'formation'))[0];
      const chance = best ? Math.min(0.85, craft(best, 'formation') / 120) : 0;
      return {
        icon: '♟️',
        title: '山中棋局',
        tone: 'neutral',
        story: `${c.place}的山亭中，一位老者獨自擺著一局殘棋。他抬眼對你說：「這局棋我下了三十年也沒解開。公子若能破局，老朽自有薄禮相贈；若輸了，須留下一點彩頭。」`,
        options: [
          {
            label: '♟️ 命佈陣最強的武將對弈',
            sub: best ? `${best.name}佈陣 ${craft(best, 'formation')}，勝算約 ${Math.round(chance * 100)}%` : '沒有隨行武將',
            disabled: !best,
            reason: '沒有隨行武將',
            apply: () => {
              if (Math.random() < chance) {
                const n = addExp(best, Math.round(150 * scale(c)));
                const name = giveItem(c, rollItemId(FORMATIONS), rand(0, 1));
                return `${best.name}落子如飛，半炷香後便破了此局。老者撫掌大笑，贈你「${name}」，${best.name}修為 +${n}。`;
              }
              const lost = Math.min(800, c.lord.stones);
              c.lord.stones -= lost;
              return `${best.name}苦思良久，終究落敗。你依約留下 ${fmtStones(lost)} 作彩頭。`;
            },
          },
          { label: '🙏 婉言謝絕', sub: '不趟渾水', apply: () => '你拱手謝過，老者笑笑，又低頭凝視起棋盤。' },
        ],
      };
    },
  },
  {
    weight: 2,
    build: (c) => {
      const fee = 600;
      return {
        icon: '🚧',
        title: '關隘盤查',
        tone: 'neutral',
        story: `${c.place}的關卡橫著一道拒馬，一名守關小吏攤開簿冊，抬了抬眼皮：「近來不太平，過關要查驗。按規矩，打點打點，自然放行。」`,
        options: [
          {
            label: '💰 打點通關',
            sub: `花費 ${fmtStones(fee)}`,
            disabled: c.lord.stones < fee,
            reason: '靈石不足',
            apply: () => {
              c.lord.stones -= fee;
              return '小吏收了銀錢，立刻換上笑臉，搬開拒馬恭送你們過關。';
            },
          },
          {
            label: '⚔️ 強行闖關',
            sub: '折損約 3% 士兵',
            apply: () => {
              const n = Math.max(30, Math.round(c.lord.soldiers * 0.03));
              c.lord.soldiers = Math.max(0, c.lord.soldiers - n);
              return `你下令推倒拒馬，關上守軍一陣亂箭，折損 ${n} 名士兵後才衝了過去。`;
            },
          },
        ],
      };
    },
  },
  // ───── 無事 ─────
  {
    weight: 4,
    build: (c) => ({
      icon: '🌫️',
      title: '迷霧',
      tone: 'neutral',
      story: `${c.place}一帶起了大霧，十步之外不辨人影。隊伍摸索著走了大半日，才找回正路，所幸一切平安。`,
      apply: () => '這一趟並無收穫，也沒有損失。',
    }),
  },
];

/** 停在驛道上：約七成機率遇到奇遇 */
export function rollRoadEvent(state: GameState, lord: Lord, place: string): RoadEvent | null {
  if (Math.random() < 0.3) return null;
  const ctx: Ctx = { state, lord, place };
  let r = Math.random() * DEFS.reduce((s, d) => s + d.weight, 0);
  for (const d of DEFS) {
    r -= d.weight;
    if (r <= 0) return d.build(ctx);
  }
  return DEFS[0].build(ctx);
}
