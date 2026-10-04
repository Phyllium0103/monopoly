import { DEFAULT_ROUNDS, PARTY_LIMIT, START_SOLDIERS, START_STONES } from '../game/GameState';
import { fmtStones } from '../game/Currency';
import { APTITUDE_DESC, APTITUDE_NAMES, REALMS, REALM_EXP } from '../data/generals';
import { BEASTS, ELEMENT_NAMES, ITEM_CATEGORIES, ITEM_DEFS, PILL_GRADES, STAT_NAMES, beastPower, describeBeast, equipRealm, techniqueExp, tierName, tierPrice } from '../data/items';
import { MIN_GARRISON, GARRISON_STRENGTH, SOLDIER_PRICE } from '../systems/CitySystem';
import { CONTEST_SOLDIERS, SIEGE_START_ROUND, SURRENDER_HP, WOUNDED_HP, WOUNDED_REDUCE } from '../systems/BattleSystem';
import { TRIBULATION_BOLTS } from '../systems/GeneralSystem';
import { REALM_LEVELS, REALM_MAX_PARTY, REALM_MIN_PARTY } from '../systems/RealmSystem';
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

/** 各類物品的效果、使用時機、能力門檻與體力消耗 */
function itemTable(category: (typeof ITEM_CATEGORIES)[number]): string {
  const timing = { preroll: '擲骰前', battle: '戰鬥中', both: '皆可' };
  const range = (a: number[]) => (a[0] === a[a.length - 1] ? `${a[0]}` : `${a[0]}～${a[a.length - 1]}`);
  const rows = Object.values(ITEM_DEFS)
    .filter((d) => d.category === category)
    .map((d) => {
      const multi = d.price.length > 1;
      const last = d.price.length - 1;
      const effect = multi ? `<b>${PILL_GRADES[0]}</b> ${d.desc(0)}<br><b>${PILL_GRADES[last]}</b> ${d.desc(last)}` : d.desc(0);
      return `<tr><td><b>${d.name}</b>${multi ? '<small>黃玄地天四階</small>' : ''}</td><td>${timing[d.timing]}</td><td>${effect}</td><td>${STAT_NAMES[d.stat]} ≥ ${range(d.min)}</td><td>${range(d.stamina)}</td><td>${fmtStones(d.price[0], true)}${multi ? `<br>～${fmtStones(d.price[last], true)}` : ''}</td></tr>`;
    });
  return `<table class="terrain-table item-table"><tr><th>名稱</th><th>時機</th><th>效果</th><th>能力門檻</th><th>體力</th><th>價格</th></tr>${rows.join('')}</table>`;
}

/** 功法十二階：能力加成、技能倍率、每回合修為與價格 */
function techniqueTable(): string {
  const rows = Array.from({ length: 12 }, (_, t) => {
    const power = Math.round((0.05 + t * 0.03) * 100);
    const skill = Math.round((1.6 + t * 0.15) * 100) / 100;
    return `<tr><td>${tierName(t, '階')}</td><td>+${power}%</td><td>×${skill}</td><td>+${techniqueExp({ tier: t } as never)}</td><td>${fmtStones(tierPrice(t, 700), true)}</td></tr>`;
  });
  return `<table class="terrain-table"><tr><th>品階</th><th>武力加成</th><th>技能傷害</th><th>每回合修為</th><th>價格</th></tr>${rows.join('')}</table>`;
}

/** 神器、寶衣十二階 */
function equipTable(): string {
  const rows = Array.from({ length: 12 }, (_, t) => {
    return `<tr><td>${tierName(t)}</td><td>武力 +${4 + t * 5}</td><td>防禦 +${3 + t * 4}・血量 +${20 + t * 25}</td><td>${REALMS[equipRealm(t)]}</td><td>${fmtStones(tierPrice(t), true)}</td></tr>`;
  });
  return `<table class="terrain-table"><tr><th>品階</th><th>神器</th><th>寶衣</th><th>需要境界</th><th>價格</th></tr>${rows.join('')}</table>`;
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
      <p>天地靈氣復甦，三國群雄得以修仙。選擇 ${LORD_IDS.map((id) => LORDS[id].name).join('、')} 其中一位，其餘三位由電腦操控，輪流在依真實地理繪製的地圖上擲骰前進。</p>
      <h4>每回合流程</h4>
      ${list([
        '<b>回合開始</b>：城池收入靈石與士兵、武將周天吐納增加修為、秘境倒數。',
        '<b>擲骰前</b>：可以使用物品、徵兵、整備武將（裝備、功法、突破）；在自己的城池上還能調度駐軍與宗門。',
        '<b>擲骰移動</b>：走骰子點數的格數，<b>只有停下的那一格</b>會觸發效果；路上遇到<b>岔路</b>時<b>隨機</b>走其中一條。',
        '<b>結束回合</b>：按「結束回合」或 Enter。',
      ])}
      <h4>開局資源</h4>
      ${list([`靈石 ${fmtStones(START_STONES)}`, `隨行士兵 ${START_SOLDIERS}`, '首都一座，以及 15 名本國將領（1 名駐守首都，其餘隨行最多 10 人、剩下的在宗門）；各國另有 25 名將領可在聽風樓招募（共 160 位人物）'])}
      <h4>靈石</h4>
      <p>分為下品、中品、上品、極品，每 100 個自動換算成高一階。例如 15230 下品會顯示為「1上品 52中品 30下品」。</p>`,
  },
  {
    title: '🗺️ 地圖格子',
    html: () => `
      ${list(Object.values(TILE_INFO).map((t) => `${t.icon} ${t.desc}`))}
      <h4>岔路與走向</h4>
      ${list([
        '地圖不是一個圈，而是依真實地理鋪成的路網：城池之間以道路、關隘（虎牢關、潼關、劍閣……）相連，洛陽、鄴城、長沙等樞紐有三四條路通往不同方向。',
        '走到<b>岔路口</b>（地圖上標 🔱）時，會<b>隨機</b>走向其中一條路，無法自己選擇；開局時主公的出發方向也是隨機的。',
        '地圖四個角落的路上各有一座<b>傳送陣</b>（東北居庸關、西北河西走廊、西南瀘水、東南會稽），踩到會被隨機傳送到地圖上另一格。',
        '<b>同一次擲骰不能走回頭路</b>（死路例外），下一回合起可以自由選擇任何方向。',
        '<b>秘境</b>只有六處，分散在各地的要道上：太行洞天、華山仙境、泰山福地、廬山幽谷、峨眉金頂、東海仙島。地圖上沒有死路，所有道路都能走通。',
        '商店與聽風樓散布在各條要道上：往哪走，決定你能買到什麼。',
        '滑鼠移到任何格子都能看到它<b>通往哪些地點</b>。',
      ])}
      <p>格子上方的標籤會顯示城池主人與過路費；滑鼠移到格子上可以看詳細資訊。</p>`,
  },
  {
    title: '🏯 城池',
    html: () => `
      <h4>佔領</h4>
      ${list([
        '骰子停在<b>無主城池</b>時，可以支付佔領費，派 1～3 名隨行武將與士兵駐守；駐將越多守城越強、收入加成也會相加。',
        `守軍至少 ${MIN_GARRISON} 人；一名城池守軍約等於 ${GARRISON_STRENGTH} 名隨行士兵。`,
        '城池每回合為主人帶來靈石與士兵，繁榮度每回合成長，過路費也隨之上漲（過路費 ≈ 繁榮度^1.2 × 7）。',
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
      <h4>繁榮度與城池榜</h4>
      ${list([
        '每座城池的繁榮度依東漢末年的實際盛衰各不相同：洛陽、成都、許昌、建業、長安、鄴城是天下名都；北平、武威、建寧等邊遠之地最為荒涼。',
        '右上角「🏆 城池榜」可查看繁榮度、靈石收入、士兵收入、過路費、守城戰力的排名，以及所有城池的總表；點選城池可把鏡頭移過去。',
        '滑鼠移到城池上，也會顯示它的繁榮度名次。',
      ])}
      <h4>徵兵與調度</h4>
      ${list([`徵兵每名 ${SOLDIER_PRICE} 下品靈石，用<b>拉條</b>自己決定徵多少。`, '「調度駐軍」可用拉條增派、撤回守軍，或調整駐將（最多 3 人，可撤回、可增派）；佔領城池、攻下城池時，同樣用拉條決定派多少士兵駐守。'])}`,
  },
  {
    title: '⚔️ 戰鬥',
    html: () => `
      <h4>擂台戰</h4>
      ${list([
        '雙方各派一名武將回合制單挑：攻擊累積能量，能量滿可施放功法技能。',
        `<b>瀕危</b>：血量低於 ${WOUNDED_HP * 100}% 的武將，受到的傷害減少 ${WOUNDED_REDUCE * 100}%。`,
        `<b>認輸</b>：血量被打到 ${SURRENDER_HP * 100}% 以下就會認輸，保住性命；認輸的一方判負。`,
        '<b>戰死</b>：若血量被一擊（攻擊、技能、物品）直接打到歸零，武將當場戰死，從此除名——所以別讓血量偏低的武將硬撐。',
        `上場前血量就低於 ${SURRENDER_HP * 100}% 的武將無法出戰擂台。`,
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
        '最多派三名武將，並用<b>拉條</b>決定出兵多少（畫面會即時比較我方與守方戰力），對上該城守軍與駐將。',
        '武將武力越高，士兵統率加成越大；駐將防禦越高，守軍加成越大。',
        '<b>敗方出征的士兵全滅</b>，勝方也會折損（雙方越接近折損越多）；沒派出去的士兵不受影響。',
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
        '失敗會損失 <b>20% 修為</b>（所以又要重新累積才能再試），並氣血翻湧：煉氣→築基失敗扣 10% 血量，築基→金丹失敗扣 20%，境界越高扣得越多。',
      ])}
      <h4>渡劫（${REALMS[2]}以上的每次突破）</h4>
      ${list([
        `天降天雷，全部撐過才能突破；境界越高越多：${TRIBULATION_BOLTS.map((n, i) => `${REALMS[i + 2]}→${REALMS[i + 3]} ${n} 道`).join('、')}。`,
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
      <h4>專屬被動</h4>
      <p>每位人物都有依其歷史評價、所屬陣營與實際戰力設計的專屬被動，可在武將名冊、聽風樓與擂台上查看。效果類型包括：</p>
      ${list([
        '<b>能力加乘</b>：武力、防禦、血量、四項技藝。',
        '<b>擂台</b>：傷害提升、減傷、先手、<b>機率連擊</b>、開場能量、功法技能加傷、低血量怒氣、吸血、震懾敵將。',
        '<b>攻守城</b>：<b>兵力倍增</b>（如張遼八百破十萬、郝昭陳倉之守）、攻城統率、守城戰力。',
        '<b>內政</b>：駐守城池時提高靈石或士兵收入。',
        '<b>修仙</b>：修為加成、突破率、雷劫減傷、秘境存活。',
        '<b>其他</b>：比試得分、物品體力消耗、百毒不侵、不受定身。',
      ])}
      <h4>隨行與宗門</h4>
      ${list([
        `主公身邊最多帶 <b>${PARTY_LIMIT}</b> 名隨行武將，其餘留在宗門。`,
        '只有<b>站在自己的城池</b>上，才能調度駐軍（「🏯 調度駐軍」）和用「🏛️ 宗門」調整隨行武將。',
        '武將在擂台戰死、渡劫身死或死在秘境後，可到<b>百草堂</b>花錢復活（修為歸零，歸入你的麾下）；因主公破產離開的武將則是真的離開，會出現在聽風樓等待招募。',
        '聽風樓可招募各國尚未出仕的將領（包含破產主公麾下離開的武將），本國將領較便宜，一次只能招募一位。',
      ])}
      <h4>功法</h4>
      <p>每位武將只能修習一種，學會後不可更換；想換只能<b>自廢修為</b>（境界歸零）。詳見「📜 功法・裝備・靈獸」。</p>`,
  },
  {
    title: '🎒 物品與商店',
    html: () => `
      ${list([
        '<b>使用方式</b>：選物品 → 選一名隨行武將使用（消耗體力、需達能力門檻）→ 選擇生效對象。',
        '丹藥看煉丹、法器看煉器、符籙看畫符、陣法看佈陣。',
        '百草堂（丹藥）、天工坊（神器寶衣，品階越高需要越高境界）、藏經閣（功法）、萬獸園（靈獸，限一隻）、天寶商行（法器陣法符籙）。',
        '<b>每件物品都有使用門檻</b>：武將對應的技藝（煉丹／佈陣／畫符／煉器）要達到能力值，並消耗體力；威力越強的物品門檻與體力消耗越高。體力每回合自動回復 15。',
        '丹藥、部分陣法、符籙、法器分<b>黃、玄、地、天</b>四階，階越高效果越強，門檻、體力與價格也越高。',
        '驛道上的奇遇也可能送你丹藥、符籙、陣法、法器、士兵，甚至黃、玄階的功法與神器。',
      ])}
      ${ITEM_CATEGORIES.map((c) => `<h4>${c}（${{ 丹藥: '煉丹', 陣法: '佈陣', 符籙: '畫符', 法器: '煉器' }[c]}）</h4>${itemTable(c)}`).join('')}`,
  },
  {
    title: '📜 功法・裝備・靈獸',
    html: () => `
      <h4>功法</h4>
      ${list([
        '每位武將只能修習一種功法，學會後不可更換；想換只能<b>自廢修為</b>（境界歸零）。在武將名冊「學習功法」。',
        '功法分<b>天地玄黃 × 上中下</b>共 12 階，另有 <b>金木水火土</b> 五行屬性與 1～5 星<b>難度</b>。',
        '<b>能力加成</b>：武力提升（防禦提升其一半）；<b>每回合修為</b>：功法品階越高，周天吐納越多。',
        '<b>技能</b>：擂台戰攻擊累積能量，能量滿 100 就能施放功法技能，造成 ×技能倍率的傷害。',
        `<b>五行</b>：${ELEMENT_NAMES.metal}剋${ELEMENT_NAMES.wood}、${ELEMENT_NAMES.wood}剋${ELEMENT_NAMES.earth}、${ELEMENT_NAMES.earth}剋${ELEMENT_NAMES.water}、${ELEMENT_NAMES.water}剋${ELEMENT_NAMES.fire}、${ELEMENT_NAMES.fire}剋${ELEMENT_NAMES.metal}：剋制方傷害 ×1.35，被剋 ×0.75，相生 ×0.9。五行輪轉事件期間，當令屬性傷害再 +30%。`,
        '<b>難度</b>：功法難度越高，低階突破成功率越低（每多一星 −3%）。',
        '買得到的地方：藏經閣；也可能從秘境、驛道奇遇（黃、玄階）、拍賣會取得。',
      ])}
      ${techniqueTable()}
      <h4>神器與寶衣</h4>
      ${list([
        '<b>神器</b>加武力，<b>寶衣</b>加防禦與血量，各武將一件，在武將名冊裝備；換下的回到行囊。',
        '同樣分 12 階，<b>品階越高需要越高境界</b>才能裝備（黃階凡人、玄階煉氣、地階築基、天階金丹）。',
        '買得到的地方：天工坊；也可能從秘境、驛道奇遇、兵器庫事件、拍賣會取得。',
      ])}
      ${equipTable()}
      <h4>靈獸</h4>
      ${list([
        '每位主公<b>只能擁有一隻</b>靈獸，新得到的會取代舊的。在萬獸園購買，或從秘境、拍賣會取得。',
        '同樣分 12 階，階越高效果越強；靈獸也會在攻城時提供戰力加成。',
        `<b>技能類型</b>：${(['attack', 'shield', 'heal', 'treasure', 'buff'] as const).map((k) => describeBeast(k, 0).replace(/^[^：]+：/, '') + '→' + describeBeast(k, 11).replace(/^[^：]+：/, '')).join('；')}（黃階下 → 天階上）。`,
        `例如：${BEASTS.map((b) => b.name).join('、')}。`,
        `攻城加成：約 ${beastPower({ tier: 0 } as never).siege * 10} ～ ${beastPower({ tier: 11 } as never).siege * 10} 戰力。`,
      ])}`,
  },
  {
    title: '🛤️ 驛道奇遇',
    html: () => `
      <p>停在<b>驛道</b>（路上的關隘與驛站）時，約七成機率遇到奇遇，獎勵會隨回合推進而更豐厚。</p>
      <h4>好事</h4>
      ${list([
        '<b>錢財與兵源</b>：拾得遺財、義勇來投、潰兵來降。',
        '<b>療傷與修煉</b>：靈泉（全員回 20%）、野店歇腳（體力 +25）、高人論道（隨行武將修為增加）。',
        '<b>丹藥、符籙、陣法、法器</b>：散修贈丹、古洞遺丹、老道贈符、殘破陣盤、鐵匠贈器。',
        '<b>黃、玄階功法與神器</b>：荒廟壁畫（功法）、古戰場兵刃（神器）、老將贈甲（寶衣）。',
      ])}
      <h4>壞事</h4>
      ${list(['山賊伏擊（折損士兵）、夜來盜賊（被盜靈石）、毒瘴（隨行武將損血）。'])}
      <h4>需要抉擇</h4>
      ${list([
        '<b>受困商旅</b>：出手相救（折損少量士兵，換得靈石與丹藥）或視而不見。',
        '<b>山中棋局</b>：由佈陣最強的武將對弈，勝算看佈陣能力；贏了得陣法與修為，輸了損失靈石。',
        '<b>關隘盤查</b>：打點通關（花靈石）或強行闖關（折損士兵）。',
      ])}
      <p>此外還有<b>黃巾賊窩</b>（黃巾餘黨事件）：停在賊窩要繳買路錢，否則損兵。</p>`,
  },
  {
    title: '⚙️ 其他功能',
    html: () => `
      ${list([
        '<b>遊戲模式</b>：開局選擇最大回合數（20～100 輪，到時比總資產），或<b>無盡模式</b>（一直打到只剩一位主公沒破產）。',
        '<b>🤖 託管</b>：右上角按鈕，讓電腦暫時代打你的回合；開啟時若正輪到你，電腦會立刻接手，隨時可以取消。',
        '<b>🏆 城池榜</b>：查看各城池的繁榮度、收入、過路費、守城戰力排名與總表。',
        '<b>🧪 測試</b>：獲得大量靈石、士兵與所有物品，方便試玩各種功能。',
        '<b>可突破提示</b>：武將修為圓滿時，回合開始會提示；頂部主公欄與「👥 武將」按鈕會閃爍，名冊中可突破的武將排在最前面。',
        '<b>電腦行動結果</b>：電腦每回合結束後，畫面中央顯示最後的行動結果；右側「天下紀事」保留完整紀錄。',
        '<b>每回合自動回復</b>：所有武將回復 12% 最大血量與 15 體力。',
        '<b>傳送陣</b>：四個角落的路上各有一座，踩到會被隨機傳送；岔路口也會隨機轉向。',
      ])}`,
  },
  {
    title: '🌀 秘境',
    html: () => `
      <h4>秘境</h4>
      ${list([
        `停在秘境時，<b>難度每次隨機</b>決定（簡單／中等／困難），再選擇派遣 ${REALM_MIN_PARTY}–${REALM_MAX_PARTY} 名隨行武將，不想冒險可取消。地圖上只有六處秘境，都在要道之上。`,
        `難度影響：${REALM_LEVELS.map((l) => `${l.icon}${l.name}（${l.turns} 回合・隕落率 ×${l.risk}・寶物品階 ${l.tier >= 0 ? '+' : ''}${l.tier}・修為 ×${l.exp}${l.rolls > 1 ? `・寶物 ${l.rolls} 份` : ''}）`).join('、')}。`,
        '人越多個別隕落率越低；四人以上多得一份寶物。',
        '每名武將都可能隕落；綜合屬性越高，個別隕落機率越低。',
        '歸來時依隊伍屬性帶回神器、寶衣、丹藥、功法或靈獸（難度越高品階越好），並獲得大量修為。',
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
        '不夠就要<b>割地賠款</b>：玩家可以自己<b>選擇賣哪一座</b>（電腦從繁榮度最低的開始賣）；變賣價是繁榮度 ×150，約佔領費的 2.5 倍，守軍回到主公、駐將歸隊。',
        '城池賣光仍不夠，<b>隨行武將隨機離開</b>投奔聽風樓，以身價抵債；離開的武將不會復活，而是真的成為無主將領，可在聽風樓被招募。',
        '只剩主公一人仍付不清，就<b>破產出局</b>。',
      ])}
      <h4>勝利條件</h4>
      ${list(['其他主公全部破產，剩你一人即一統天下。', `開局可選擇最大回合數（預設 ${DEFAULT_ROUNDS} 輪）：回合數結束時，依總資產（靈石、士兵、城池、將領、物品）排名。`, '<b>無盡模式</b>：沒有回合上限，一直打到只剩一位主公沒破產。'])}`,
  },
  {
    title: '🖱️ 操作',
    html: () => `
      ${list([
        '左鍵拖曳旋轉視角、右鍵拖曳平移、滾輪縮放、WASD 或方向鍵移動視角。',
        '空白鍵擲骰、Enter 結束回合；<b>Esc</b> 可關閉大部分彈出視窗（取消選單、離開商店、關閉說明），也能取消傳送陣選位。',
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
