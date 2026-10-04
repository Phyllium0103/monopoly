import { MAX_ROUNDS, PARTY_LIMIT, START_SOLDIERS, START_STONES } from '../game/GameState';
import { fmtStones } from '../game/Currency';
import { APTITUDE_DESC, APTITUDE_NAMES, REALMS, REALM_EXP, TRAIT_DESC, TRAIT_NAMES } from '../data/generals';
import { ARTIFACT_IDS, ITEM_DEFS, PILL_IDS, STAT_NAMES } from '../data/items';
import { MIN_GARRISON, GARRISON_STRENGTH, SOLDIER_PRICE } from '../systems/CitySystem';
import { CONTEST_SOLDIERS, SIEGE_START_ROUND } from '../systems/BattleSystem';
import { TRIBULATION_BOLTS } from '../systems/GeneralSystem';
import { ISLANDS, ISLAND_TURNS, REALM_TURNS, TRADE_TURNS } from '../systems/RealmSystem';
import { PORT_CITIES } from '../data/board';
import { DISASTER_AFTER, EVENT_INTERVAL, WORLD_EVENTS, type EventCategory } from '../systems/EventSystem';
import { BOARD, TILE_INFO } from '../data/board';
import { CITY_TERRAIN, TERRAIN, type TerrainId } from '../data/terrain';
import { LORDS, LORD_IDS } from '../faction/Faction';

interface Page {
  title: string;
  html: () => string;
}

const BOARD_NAMES = Object.fromEntries(BOARD.cities.map((c) => [c.id, c.name]));

/** 地貌對照表 */
function terrainTable(): string {
  const cell = (v: number) => (v ? `<span class="${v > 0 ? 'up' : 'down'}">${v > 0 ? '+' : '−'}${Math.round(Math.abs(v) * 100)}%</span>` : '—');
  const cities = (id: TerrainId) =>
    Object.entries(CITY_TERRAIN)
      .filter(([, t]) => t === id)
      .map(([c]) => BOARD_NAMES[c])
      .join('、');
  const rows = (Object.keys(TERRAIN) as TerrainId[]).map((id) => {
    const t = TERRAIN[id];
    const growth = t.growth > 0 ? '<span class="up">較快</span>' : t.growth < 0 ? '<span class="down">較慢</span>' : '—';
    return `<tr><td>${t.icon} ${t.name}</td><td>${cell(t.stones)}</td><td>${cell(t.soldiers)}</td><td>${cell(t.defense)}</td><td>${cell(t.spirit)}</td><td>${growth}</td><td class="cities">${cities(id)}</td></tr>`;
  });
  return `<table class="terrain-table"><tr><th>地貌</th><th>靈石</th><th>士兵</th><th>城防</th><th>靈氣</th><th>繁榮</th><th>城池</th></tr>${rows.join('')}</table>`;
}

const list = (items: string[]) => `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>`;

const CATEGORY_TITLES: Record<EventCategory, string> = {
  economy: '經濟',
  cultivation: '修煉',
  politics: '政治',
  disaster: `災難（第 ${DISASTER_AFTER} 輪後才會出現）`,
};

function eventGroup(category: EventCategory): string {
  const events = WORLD_EVENTS.filter((e) => e.category === category);
  return `<h4 class="${category === 'disaster' ? 'disaster' : ''}">${CATEGORY_TITLES[category]}</h4>${list(events.map((e) => `${e.icon} <b>${e.name}</b>：${e.desc}`))}`;
}

const PAGES: Page[] = [
  {
    title: '🎲 基本玩法',
    html: () => `
      <p>天地靈氣復甦，三國群雄得以修仙。選擇 ${LORD_IDS.map((id) => LORDS[id].name).join('、')} 其中一位，其餘三位由電腦操控，輪流在環狀地圖上擲骰前進。</p>
      <h4>每回合流程</h4>
      ${list([
        '<b>回合開始</b>：城池收入靈石與士兵、武將周天吐納增加修為、秘境倒數。',
        '<b>擲骰前</b>：可以使用物品、徵兵、調度駐軍與宗門、整備武將（裝備、功法、突破）。',
        '<b>擲骰移動</b>：走骰子點數的格數，<b>只有停下的那一格</b>會觸發效果。',
        '<b>結束回合</b>：按「結束回合」或 Enter。',
      ])}
      <h4>開局資源</h4>
      ${list([`靈石 ${fmtStones(START_STONES)}`, `隨行士兵 ${START_SOLDIERS}`, '首都一座，以及 8 名本國將領（1 名駐守首都）'])}
      <h4>靈石</h4>
      <p>分為下品、中品、上品、極品，每 100 個自動換算成高一階。例如 15230 下品會顯示為「1上品 52中品 30下品」。</p>`,
  },
  {
    title: '🗺️ 地圖格子',
    html: () => `
      ${list(Object.values(TILE_INFO).map((t) => `${t.icon} ${t.desc}`))}
      <p>格子上方的標籤會顯示城池主人與過路費；滑鼠移到格子上可以看詳細資訊。</p>`,
  },
  {
    title: '🏯 城池',
    html: () => `
      <h4>佔領</h4>
      ${list([
        '骰子停在<b>無主城池</b>時，可以支付佔領費，派一名隨行武將與士兵駐守。',
        `守軍至少 ${MIN_GARRISON} 人；一名城池守軍約等於 ${GARRISON_STRENGTH} 名隨行士兵。`,
        '城池每回合為主人帶來靈石與士兵，繁榮度每回合成長，過路費也隨之上漲。',
        '同一位主公擁有的城池越多，每座城的過路費越貴。',
      ])}
      <h4>踏入他人城池</h4>
      ${list([
        '<b>繳納過路費</b>後離開；或是發起<b>戰鬥</b>。',
        '戰鬥獲勝免繳過路費（攻城戰獲勝則直接奪城）；<b>戰敗須付雙倍過路費</b>。',
      ])}
      <h4>地貌</h4>
      <p>每座城池依真實地理有不同地貌，影響靈石與士兵收入、守城戰力、駐守武將吸收的靈氣與繁榮成長：</p>
      ${terrainTable()}
      <h4>徵兵與調度</h4>
      ${list([`徵兵每名 ${SOLDIER_PRICE} 下品靈石。`, '「調度駐軍」可增派、撤回守軍或更換駐將。'])}`,
  },
  {
    title: '⚔️ 戰鬥',
    html: () => `
      <h4>擂台戰</h4>
      ${list([
        '雙方各派一名武將回合制單挑：攻擊累積能量，能量滿可施放功法技能。',
        '功法有金木水火土五行，<b>相剋</b>的一方傷害大增（金剋木、木剋土、土剋水、水剋火、火剋金）。',
        '戰鬥中可以使用丹藥、符籙、法器；靈獸也會參戰。',
      ])}
      <h4>煉丹／煉器／畫符／佈陣比試</h4>
      ${list([
        '雙方各派一名武將比拼該項能力，能力越高越有勝算。',
        `雙方各出 ${CONTEST_SOLDIERS} 兵維持秩序：<b>敗方 ${CONTEST_SOLDIERS} 兵全滅</b>，勝方也會折損。守軍不足 ${CONTEST_SOLDIERS} 的城池無法應戰。`,
      ])}
      <h4>攻城戰</h4>
      ${list([
        `<b>前 ${SIEGE_START_ROUND - 1} 輪不能攻城</b>，第 ${SIEGE_START_ROUND} 輪起開放。`,
        '最多派三名武將，率領所有未派遣的隨行士兵，對上該城守軍與駐將。',
        '武將武力越高，士兵統率加成越大；駐將防禦越高，守軍加成越大。',
        '<b>敗方兵力全滅</b>，勝方也會折損（雙方越接近折損越多）。',
        '攻破時若駐將正在閉關，會<b>走火入魔</b>：重傷並損失一半修為。',
      ])}
      <p>勝者在戰鬥中會掠奪敗者一成修為，偽靈根武將獲得雙倍。</p>`,
  },
  {
    title: '🧘 修煉與突破',
    html: () => `
      <h4>境界</h4>
      <p>${REALMS.map((r, i) => (i < REALM_EXP.length ? `${r}（${REALM_EXP[i]}）` : r)).join(' → ')}</p>
      <p>括號為該境界修為上限。修為滿了進入<b>瓶頸</b>，不再增加，需要在武將名冊手動<b>突破</b>。</p>
      <h4>修為來源</h4>
      ${list([
        '<b>周天吐納</b>：每回合自動增加，功法品階越高越多（黃階 +20 … 天階 +100）。',
        '<b>駐守城池</b>：依城池繁榮度額外增加，洛陽、長安為極品靈脈加倍；<b>閉關</b>再加倍，但城破會走火入魔。',
        '<b>生死歷練</b>：戰鬥勝利掠奪敗者修為。',
        '<b>秘境奇遇</b>：從秘境歸來獲得大量修為，低階者可能當場頓悟突破。',
        '<b>丹藥</b>：凝氣丹、真元丹直接增加修為。',
      ])}
      <h4>低階突破（${REALMS[0]} → ${REALMS[1]} → ${REALMS[2]}）</h4>
      ${list([
        '機率判定，名冊會顯示成功率；築基丹可把突破築基的成功率提升到 95%。',
        '失敗會<b>氣血翻湧</b>：扣一半血量與體力，下一輪才能再試。',
      ])}
      <h4>渡劫（${REALMS[2]}以上）</h4>
      ${list([
        `天降 ${TRIBULATION_BOLTS.join('、')} 道天雷（境界越高越多），全部撐過才能突破。`,
        '防禦、寶衣、避雷陣、五行防禦陣都能減傷；突破前先吃回血丹補滿。',
        '<b>血量歸零</b>：一半機率身死道消（武將死亡），一半機率兵解重修（跌回凡人）。',
        '敵人可用走火入魔符、幻境陣讓你的武將心魔纏身，突破更兇險。',
      ])}`,
  },
  {
    title: '👥 武將',
    html: () => `
      <h4>能力</h4>
      <p>修為、武力、防禦、血量，以及${(['alchemy', 'forging', 'talisman', 'formation'] as const).map((k) => STAT_NAMES[k]).join('、')}。四項技藝除了比試，也是使用物品的門檻。</p>
      <h4>靈根</h4>
      ${list((Object.keys(APTITUDE_NAMES) as (keyof typeof APTITUDE_NAMES)[]).map((k) => `<b>${APTITUDE_NAMES[k]}</b>：${APTITUDE_DESC[k]}`))}
      <h4>特殊體質</h4>
      ${list((Object.keys(TRAIT_NAMES) as (keyof typeof TRAIT_NAMES)[]).map((k) => `<b>${TRAIT_NAMES[k]}</b>：${TRAIT_DESC[k]}`))}
      <h4>隨行與宗門</h4>
      ${list([
        `主公身邊最多帶 <b>${PARTY_LIMIT}</b> 名隨行武將，其餘留在宗門。`,
        '只有在聽風樓、無主城池或自己的城池才能用「🏛️ 宗門」調度。',
        '聽風樓可招募各國尚未出仕的將領，本國將領較便宜，一次只能招募一位。',
      ])}
      <h4>功法</h4>
      <p>每位武將只能修習一種，學會後不可更換；想換只能<b>自廢修為</b>（境界歸零）。</p>`,
  },
  {
    title: '🎒 物品與商店',
    html: () => `
      ${list([
        '<b>使用方式</b>：選物品 → 選一名隨行武將使用（消耗體力、需達能力門檻）→ 選擇生效對象。',
        '丹藥看煉丹、法器看煉器、符籙看畫符、陣法看佈陣。',
        '百草堂（丹藥）、天工坊（神器寶衣，品階越高需要越高境界）、藏經閣（功法）、萬獸園（靈獸，限一隻）、天寶商行（法器陣法符籙）。',
      ])}
      <h4>丹藥</h4>
      ${list(PILL_IDS.map((id) => `<b>${ITEM_DEFS[id].name}</b>：${ITEM_DEFS[id].desc(0)}`))}
      <h4>法器、陣法、符籙</h4>
      ${list(ARTIFACT_IDS.map((id) => `<b>${ITEM_DEFS[id].name}</b>（${ITEM_DEFS[id].category}）：${ITEM_DEFS[id].desc(0)}`))}`,
  },
  {
    title: '🌀 秘境與出海',
    html: () => `
      <h4>秘境</h4>
      ${list([
        `停在秘境時，可派三名隨行武將探索，歷時 ${REALM_TURNS} 回合，期間無法出戰。`,
        '每名武將都可能隕落；綜合屬性越高，個別隕落機率越低。',
        '歸來時依隊伍屬性帶回神器、寶衣、丹藥、功法或靈獸其一，並獲得大量修為。',
      ])}
      <h4>⚓ 港口出海</h4>
      <p>港口城池：${[...PORT_CITIES].map((id) => BOARD_NAMES[id]).join('、')}。<b>停在港口城池，或擁有任一港口城池</b>，就能按「⛵ 出海」。</p>
      ${list([
        `<b>海外貿易</b>：派 1–3 名武將帶靈石出海，${TRADE_TURNS} 回合後歸來。煉器、煉丹最好的一人決定獲利倍率；全隊武力越高越不怕海盜。遇到海盜或船難則貨款全失，船難還可能折將。`,
        `<b>尋訪仙山</b>：派三名武將尋找${ISLANDS.join('、')}，${ISLAND_TURNS} 回合後歸來。隕落率比秘境高一半，但帶回兩份高階寶物與大量修為；可能得仙人點化直接突破，高階武將則獲得仙人護法（下次渡劫減傷 50%）。`,
      ])}`,
  },
  {
    title: '📜 九州風雲',
    html: () => `
      <p>每 ${EVENT_INTERVAL} 輪九州掀起一場風雲（隨機事件）；<b>災難類第 ${DISASTER_AFTER} 輪之後才會出現</b>。持續型事件會顯示在左上角，標註剩餘輪數。</p>
      ${(['economy', 'cultivation', 'politics'] as const).map((c) => eventGroup(c)).join('')}
      <hr class="help-divider">
      ${eventGroup('disaster')}`,
  },
  {
    title: '🏆 破產與勝利',
    html: () => `
      <h4>付不出錢時</h4>
      ${list([
        '先付掉身上所有靈石。',
        '不夠就從繁榮度最低的城池開始<b>變賣</b>（守軍回到主公、駐將回到身邊）。',
        '城池賣光仍不夠，<b>隨行武將隨機離開</b>投奔聽風樓，以身價抵債。',
        '只剩主公一人仍付不清，就<b>破產出局</b>。',
      ])}
      <h4>勝利條件</h4>
      ${list(['其他主公全部破產，剩你一人即一統天下。', `否則 ${MAX_ROUNDS} 輪結束時，依總資產（靈石、士兵、城池、將領、物品）排名。`])}`,
  },
  {
    title: '🖱️ 操作',
    html: () => `
      ${list([
        '左鍵拖曳旋轉視角、右鍵拖曳平移、滾輪縮放、WASD 或方向鍵移動視角。',
        '空白鍵擲骰、Enter 結束回合、Esc 取消傳送陣選位。',
        '右上角可切換 1×／2×／4× 遊戲速度。',
        '點擊格子或主公可在右側查看詳細資訊。',
      ])}`,
  },
];

/** 遊戲說明：分頁瀏覽各系統規則（獨立圖層，開始畫面也能開） */
export class HelpView {
  private el: HTMLDivElement;
  private page = 0;

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'help-backdrop hidden';
    root.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      if (e.target === this.el) this.close();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.el.classList.contains('hidden')) this.close();
    });
  }

  open() {
    this.el.classList.remove('hidden');
    this.render();
  }

  close() {
    this.el.classList.add('hidden');
  }

  private render() {
    const p = PAGES[this.page];
    this.el.innerHTML = `
      <div class="help-card scroll-card">
        <div class="help-head"><h2>📖 遊戲說明</h2><button class="btn close">關閉 ✕</button></div>
        <div class="help-main">
          <nav class="help-tabs">${PAGES.map((x, i) => `<button class="help-tab ${i === this.page ? 'on' : ''}" data-i="${i}">${x.title}</button>`).join('')}</nav>
          <article class="help-body"><h3>${p.title}</h3>${p.html()}</article>
        </div>
      </div>`;
    (this.el.querySelector('.close') as HTMLButtonElement).onclick = () => this.close();
    this.el.querySelectorAll<HTMLButtonElement>('.help-tab').forEach((b) => {
      b.onclick = () => {
        this.page = Number(b.dataset.i);
        this.render();
      };
    });
  }
}
