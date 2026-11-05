/**
 * 由 src/ 的遊戲資料產生 docs/game-data.md（完整數值表）。
 * 用法：npm run docs:data
 * 只讀資料、不用亂數，同一份資料重跑的輸出完全相同。
 */
const fs = require('node:fs'), path = require('node:path');
const { registerHooks, stripTypeScriptTypes } = require('node:module');
const { pathToFileURL, fileURLToPath } = require('node:url');

registerHooks({
  resolve(s, c, n) {
    if (s.startsWith('.') && !path.extname(s) && c.parentURL) {
      const p = path.resolve(path.dirname(fileURLToPath(c.parentURL)), s + '.ts');
      if (fs.existsSync(p)) return n(pathToFileURL(p).href, c);
    }
    return n(s, c);
  },
  load(u, c, n) {
    return u.endsWith('.ts')
      ? { format: 'module', shortCircuit: true, source: stripTypeScriptTypes(fs.readFileSync(fileURLToPath(u), 'utf8'), { mode: 'transform' }) }
      : n(u, c);
  },
});
process.removeAllListeners('warning');

const src = (p) => require(path.join('..', 'src', p));
const { REALMS, REALM_EXP, REALM_MULT, GENERAL_SEEDS, HIDDEN_SEEDS } = src('data/generals.ts');
const { PASSIVES } = src('data/passives.ts');
const { WEAPON_CATALOG, WEAPON_GRADES, WEAPON_PENETRATION, WEAPON_UPGRADE_COST, MATERIAL_GROUPS, MATERIAL_NAMES } = src('data/weaponCatalog.ts');
const Items = src('data/items.ts');
const { TALENTS, TALENT_TREES, TALENT_BY_ID, ROW_POINTS, ROW_REALM, talentPointsFor } = src('data/talents.ts');
const { BOARD } = src('data/board.ts');
const { SELECTED_LAYOUT } = src('data/selectedLayout.ts');
const { LORDS, LORD_IDS } = src('faction/Faction.ts');
const City = src('systems/CitySystem.ts');
const { TRIBULATION_BOLTS, TRIBULATION_HP_RATIO } = src('systems/GeneralSystem.ts');
const { REALM_LEVELS, deathChance } = src('systems/RealmSystem.ts');
const { RELIC_EVENTS } = src('systems/RelicSystem.ts');
const { WORLD_EVENTS, FIXED_WORLD_EVENTS } = src('systems/EventSystem.ts');

const cell = (v) => String(v ?? '').replace(/\|/g, '｜').replace(/\s*\n\s*/g, ' ');
const pct = (n, digits = 0) => `${(n * 100).toFixed(digits)}%`;
const table = (head, rows) => [
  `| ${head.join(' | ')} |`,
  `| ${head.map(() => '---').join(' | ')} |`,
  ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`),
].join('\n');

const out = [];
const add = (...lines) => out.push(...lines, '');

add(
  '<!-- 自動產生，請勿手改。來源是 src/ 的遊戲資料，更新請執行 npm run docs:data。 -->',
  '# 遊戲完整數值表',
  '',
  '這份文件由 `scripts/build-game-data-doc.cjs` 從程式資料自動產生，是資料的查閱用副本。要改數值請改 `src/data/`，再執行 `npm run docs:data`。規則說明見 [game-content.md](game-content.md)。',
);

// ───────── 總覽 ─────────
const allGenerals = [...GENERAL_SEEDS, ...HIDDEN_SEEDS];
const objectKinds = {};
for (const o of SELECTED_LAYOUT.objects) objectKinds[o.type] = (objectKinds[o.type] ?? 0) + 1;
const KIND_NAMES = { city: '城池', herb: '百草堂', forge: '天工坊', treasure: '天寶商行', library: '藏經閣', beast: '萬獸園', tavern: '聽風樓', casino: '乾坤骰殿', secret: '秘境', relic: '山河社稷圖', vein: '礦脈（靈脈）', recruitment: '募兵司' };
add(
  '## 總覽',
  '',
  table(['項目', '數量'], [
    ['人物（含主公與方外）', allGenerals.length],
    ['物品種類', Items.ITEM_CATALOG?.length ?? Object.keys(Items.ITEM_DEFS).length],
    ['物品品階列數', Object.values(Items.ITEM_DEFS).reduce((s, d) => s + d.price.length, 0)],
    ['寶衣款式', Items.EQUIP_DESIGNS.length],
    ['靈獸', Items.BEASTS.length],
    ['天賦節點', TALENTS.length],
    ['九州風雲事件', WORLD_EVENTS.length],
    ['固定活動', FIXED_WORLD_EVENTS.length],
    ['道路格', BOARD.tiles.length],
    ['地圖建築（有事件）', SELECTED_LAYOUT.objects.length],
  ]),
);
add('### 地圖建築', '', table(['建築', '數量'], Object.entries(objectKinds).map(([k, n]) => [KIND_NAMES[k] ?? k, n])));

// ───────── 境界 ─────────
add(
  '## 境界',
  '',
  '「修為上限」是該境界進入瓶頸前需要的修為。「天雷」與「平均傷害」是從該境界突破時的雷劫，傷害以基礎境界血量的比例計算。',
  '',
  table(['編號', '境界', '修為上限', '武防血倍率', '四藝倍率', '突破入此境的天賦點', '天雷', '平均傷害'], REALMS.map((name, r) => [
    r, name, REALM_EXP[r] ?? '—', REALM_MULT[r], (1 + r * 0.1).toFixed(1), r === 0 ? '—' : talentPointsFor(r),
    r >= 2 && r - 2 < TRIBULATION_BOLTS.length ? TRIBULATION_BOLTS[r - 2] : '—',
    r >= 2 && r - 2 < TRIBULATION_HP_RATIO.length ? pct(TRIBULATION_HP_RATIO[r - 2]) : '—',
  ])),
);

// ───────── 武將 ─────────
const place = (g) => g.lord ? '主公' : g.garrison ? '駐守首都' : g.start ? '麾下' : '聽風樓';
const generalRow = (g, where) => {
  const p = PASSIVES[g.id], w = WEAPON_CATALOG[g.id];
  return [g.name, REALMS[g.realm], ...g.s, where, p?.name ?? '—', p?.effectText ?? '—', w?.names.join(' → ') ?? '—', w?.material ?? '—'];
};
const GENERAL_HEAD = ['人物', '起始', '武', '防', '血', '丹', '器', '符', '陣', '開局', '技能', '效果', '專屬武器（黃→玄→地→天）', '材料'];
add('## 武將', '', '靈根在每局建立人物時隨機決定，不列在表中。');
for (const id of LORD_IDS) {
  const rows = GENERAL_SEEDS.filter((g) => g.origin === id);
  add(`### ${LORDS[id].kingdom}（${rows.length} 位）`, '', table(GENERAL_HEAD, rows.map((g) => generalRow(g, place(g)))));
}
add(`### 方外（${HIDDEN_SEEDS.length} 位）`, '', table(GENERAL_HEAD, HIDDEN_SEEDS.map((g) => generalRow(g, '隱藏'))));

// ───────── 專屬武器 ─────────
const weaponCount = (group) => Object.values(WEAPON_CATALOG).filter((w) => w.material === group).length;
add(
  '## 專屬武器與材料',
  '',
  table(['武器品階', '無視防禦', '升到下一階的消耗'], WEAPON_GRADES.map((g, i) => [
    g, pct(WEAPON_PENETRATION[i]), WEAPON_UPGRADE_COST[i] === undefined ? '已滿階' : `${WEAPON_UPGRADE_COST[i]} 顆${['基礎', '中階', '高階'][i]}材料`,
  ])),
  '',
  table(['材料組', '基礎', '中階', '高階', '武將數'], MATERIAL_GROUPS.map((g) => [g, ...MATERIAL_NAMES[g], weaponCount(g)])),
);

// ───────── 物品 ─────────
const STAT = { alchemy: '煉丹', forging: '煉器', talisman: '畫符', formation: '佈陣' };
const TIMING = { preroll: '擲骰前', battle: '戰鬥', both: '擲骰前／戰鬥', event: '事件觸發' };
add('## 物品', '', '「權重」決定隨機出現的機率，0 表示不隨機出現。「回收」是沒有成交紀錄時的回收參考價。價格單位是下品靈石。');
for (const category of Items.ITEM_CATEGORIES) {
  const rows = [];
  for (const [id, d] of Object.entries(Items.ITEM_DEFS)) {
    if (d.category !== category) continue;
    d.price.forEach((price, t) => rows.push([
      t === 0 ? d.name : '〃', d.price.length === 1 ? '單一' : Items.PILL_GRADES[t], t === 0 ? d.weight : '', t === 0 ? STAT[d.stat] ?? '—' : '', t === 0 ? TIMING[d.timing] ?? d.timing : '',
      d.min[t], d.stamina[t], price, d.sellPrice[t], d.desc(t),
    ]));
  }
  add(`### ${category}`, '', table(['物品', '品階', '權重', '技藝', '時機', '門檻', '體力', '售價', '回收', '效果'], rows));
}

// ───────── 寶衣 ─────────
const armor = (design, tier) => Items.makeEquipment('doc', 'armor', tier, design.id);
const craftText = (e) => Object.entries(e.craft).map(([k, v]) => `${STAT[k]} ${v}`).join('、') || '—';
add(
  '## 寶衣',
  '',
  '共 12 個品階，下表列出最低與最高品階的數值。裝備需要的境界是「品階編號除以 2 取整」。',
  '',
  table(['款式', '黃品下 武/防/血', '黃品下 技藝', '黃品下 售價', '天品上 武/防/血', '天品上 技藝', '天品上 售價'], Items.EQUIP_DESIGNS.map((d) => {
    const lo = armor(d, 0), hi = armor(d, 11);
    return [d.name, `${lo.force}/${lo.defense}/${lo.hp}`, craftText(lo), lo.price, `${hi.force}/${hi.defense}/${hi.hp}`, craftText(hi), hi.price];
  })),
  '',
  table(['編號', '品階', '需要境界'], Array.from({ length: 12 }, (_, t) => [t, Items.tierName(t), REALMS[Items.equipRealm(t)]])),
);

// ───────── 功法 ─────────
const element = (t) => Items.makeTechnique('doc', t, 'metal');
const art = (t) => Items.makeTechnique('doc', t, 'alchemy');
add(
  '## 功法',
  '',
  '### 五行功法',
  '',
  table(['品階', '修練速度', '武力', '技能倍率', '售價'], Array.from({ length: 12 }, (_, t) => {
    const k = element(t);
    return [Items.tierName(t, '階'), `+${pct(Items.techniqueSpeed(k))}`, `+${pct(Items.techniqueForce(k))}`, `×${Items.techniqueSkillPower(k).toFixed(1)}`, k.price];
  })),
  '',
  '### 技藝功法',
  '',
  `技藝功法從${Items.tierName(Items.CRAFT_MIN_TIER, '階')}起才有，不加武力。`,
  '',
  table(['品階', '修練速度', '對應物品不消耗機率', '售價'], Array.from({ length: 12 - Items.CRAFT_MIN_TIER }, (_, i) => {
    const k = art(i + Items.CRAFT_MIN_TIER);
    return [Items.tierName(k.tier, '階'), `+${pct(Items.techniqueSpeed(k))}`, pct(Items.techniqueKeep(k, Items.CRAFT_ITEM.alchemy)), k.price];
  })),
);

// ───────── 靈獸 ─────────
const SKILL = { attack: '追擊', shield: '護盾', treasure: '尋寶', buff: '增武' };
add(
  '## 靈獸',
  '',
  table(['靈獸', '類型'], Items.BEASTS.map((b) => [b.name, SKILL[b.skill]])),
  '',
  table(['品階', '追擊傷害', '開場護盾', '每回合尋寶', '武力倍率', '攻城加成', '售價'], Array.from({ length: 12 }, (_, tier) => {
    const p = Items.beastPower({ tier });
    return [Items.tierName(tier, '階'), p.attack, p.shield, p.treasure, `×${p.buff.toFixed(2)}`, p.siege, Items.tierPrice(tier, 800)];
  })),
);

// ───────── 天賦 ─────────
add(
  '## 天賦樹',
  '',
  table(['層', '需在此樹較低層投入', '需要隊伍曾達境界'], ROW_POINTS.slice(1).map((points, i) => [i + 1, `${points} 點`, REALMS[ROW_REALM[i + 1]]])),
);
for (const tree of TALENT_TREES) {
  const rows = TALENTS.filter((n) => n.tree === tree.id).map((n) => [n.row, n.name, n.max, n.requires.map((id) => TALENT_BY_ID[id].name).join('或') || '—', n.text]);
  add(`### ${tree.icon} ${tree.name}`, '', table(['層', '節點', '最高級', '前置（任一）', '每級效果'], rows));
}

// ───────── 城池 ─────────
const capitals = Object.fromEntries(LORD_IDS.map((id) => [LORDS[id].capital, id]));
const cityRow = (c) => {
  const city = { ...c, capital: !!capitals[c.id], owner: 'neutral' };
  const income = City.cityIncome(city, []);
  return [c.name, capitals[c.id] ? `${LORDS[capitals[c.id]].name}首都` : '無主', c.prosperity, City.toll(city, 1), City.occupyCost(city), income.stones, income.soldiers];
};
add(
  '## 城池',
  '',
  '依初始繁榮度排序。過路費、佔領費和收入都以初始繁榮度計算，不含同主公城池數、駐將與天賦加成。繁榮度上限 300。',
  '',
  table(['城池', '開局歸屬', '繁榮度', '過路費', '佔領費', '靈石／回合', '士兵／回合'], [...BOARD.cities].sort((a, b) => b.prosperity - a.prosperity || a.name.localeCompare(b.name, 'zh-Hant')).map(cityRow)),
);

// ───────── 秘境 ─────────
const member = (realm) => ({ id: 'doc', realm, base: {}, status: 'free' });
const risk = (gap, size) => {
  const level = 4, g = member(level + 1 - gap);
  return pct(deathChance(g, Array(size).fill(g), level));
};
add(
  '## 秘境',
  '',
  table(['難度', '獎勵品階加成', '修為倍率'], REALM_LEVELS.map((l) => [l.name, l.tier, `×${l.exp}`])),
  '',
  '### 個人隕落率',
  '',
  '依「秘境難度減個人境界」的差距與隊伍人數計算，不看戰力，未含隕落被動與世界事件。',
  '',
  table(['境界差', '1 人', '3 人', '5 人'], [-3, -2, -1, 0, 1, 2, 3, 4].map((gap) => [gap > 0 ? `+${gap}` : gap, risk(gap, 1), risk(gap, 3), risk(gap, 5)])),
);

// ───────── 山河社稷圖 ─────────
const RELIC_KIND = { stones: '靈石', soldiers: '士兵', health: '氣血', exp: '修為' };
add(
  '## 山河社稷圖',
  '',
  table(['格', '名稱', '影響', '吉運機率', '吉', '凶'], RELIC_EVENTS.map((e, i) => [i, e.name, RELIC_KIND[e.kind], pct(e.chance), e.good, e.bad])),
);

// ───────── 世界事件 ─────────
const CATEGORY = { economy: '經濟', cultivation: '修煉', politics: '政治', disaster: '災難' };
add('## 九州風雲');
for (const [id, name] of Object.entries(CATEGORY)) {
  add(`### ${name}`, '', table(['事件', '持續', '效果'], WORLD_EVENTS.filter((e) => e.category === id).map((e) => [`${e.icon} ${e.name}`, e.duration ? `${e.duration} 輪` : '當下', e.desc])));
}
add('### 固定活動', '', table(['活動', '效果'], FIXED_WORLD_EVENTS.map((e) => [`${e.icon} ${e.name}`, e.desc])));

const target = path.join(__dirname, '..', 'docs', 'game-data.md');
fs.writeFileSync(target, out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n');
console.log(`docs/game-data.md: ${allGenerals.length} 位人物、${Object.keys(Items.ITEM_DEFS).length} 種物品、${TALENTS.length} 個天賦節點`);
