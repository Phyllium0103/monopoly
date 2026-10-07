import type { Item } from '../game/types';
import type { Choice } from './Dialog';
import { itemIconUrl } from './Icons';
import { ITEM_DEFS, PILL_GRADES, STAT_NAMES, itemName, requirementOf } from '../data/items';

export const CATEGORY_STYLE: Record<string, { icon: string; color: string }> = {
  丹藥: { icon: '💊', color: '#3fa35a' },
  陣法: { icon: '🔯', color: '#7a52b8' },
  符籙: { icon: '📿', color: '#c9722a' },
  法器: { icon: '🔔', color: '#2a7ac9' },
};

/** 黃、玄、地、天四階的代表色 */
export const TIER_COLORS = ['#b8982e', '#4a74b0', '#8a5a34', '#a45ae8'];

const TIMING = { preroll: '擲骰前', battle: '戰鬥中', both: '平時／戰鬥', event: '事件觸發' } as const;

/** 物品名稱列：圖示、名稱與品階徽章 */
export function itemLabel(defId: string, tier: number): string {
  const d = ITEM_DEFS[defId];
  const c = CATEGORY_STYLE[d.category];
  const multi = d.price.length > 1;
  const badge = multi ? `<span class="tier-badge" style="background:${TIER_COLORS[tier]}">${PILL_GRADES[tier]}</span>` : '';
  return `<span class="item-icon" style="background:${c.color}">${c.icon}</span><span class="item-name">${d.name}</span>${badge}<span class="item-cat" style="color:${c.color}">${d.category}</span>`;
}

/** 物品說明列：效果與使用門檻（能力值、體力）、使用時機 */
export function itemInfoHtml(defId: string, tier: number): string {
  const d = ITEM_DEFS[defId];
  if (d.noUser) return `<span class="item-effect">${d.desc(tier)}</span><span class="item-chips"><span class="ichip time">事件觸發，直接使用</span></span>`;
  const t = Math.min(tier, d.min.length - 1);
  return `<span class="item-effect">${d.desc(tier)}</span><span class="item-chips"><span class="ichip req" title="武將的${STAT_NAMES[d.stat]}需達到此數值">${STAT_NAMES[d.stat]} ≥ ${d.min[t]}</span><span class="ichip sta" title="使用後消耗的體力">⚡ 體力 ${d.stamina[t]}</span><span class="ichip time">${TIMING[d.timing]}</span></span>`;
}

/** 行囊中的物品：依類別分組、合併相同品階，附效果提示 */
export function bagHtml(items: Item[]): string {
  if (!items.length) return '<span class="muted">無</span>';
  const groups = new Map<string, { defId: string; tier: number; count: number }>();
  for (const i of items) {
    const key = `${i.defId}:${i.tier}`;
    const g = groups.get(key);
    if (g) g.count++;
    else groups.set(key, { defId: i.defId, tier: i.tier, count: 1 });
  }
  const byCategory = new Map<string, { defId: string; tier: number; count: number }[]>();
  for (const g of groups.values()) {
    const cat = ITEM_DEFS[g.defId].category;
    byCategory.set(cat, [...(byCategory.get(cat) ?? []), g]);
  }
  return [...Object.keys(CATEGORY_STYLE)]
    .filter((cat) => byCategory.has(cat))
    .map((cat) => {
      const c = CATEGORY_STYLE[cat];
      const chips = byCategory
        .get(cat)!
        .sort((a, b) => b.tier - a.tier)
        .map((g) => {
          const d = ITEM_DEFS[g.defId];
          const multi = d.price.length > 1;
          const border = multi ? TIER_COLORS[g.tier] : c.color;
          return `<span class="bag-chip" style="border-color:${border}" title="${d.desc(g.tier)}｜${requirementOf(g.defId, g.tier)}">${itemName(g.defId, g.tier)}${g.count > 1 ? ` ×${g.count}` : ''}</span>`;
        })
        .join('');
      return `<div class="bag-row"><span class="bag-cat" style="background:${c.color}">${c.icon} ${cat}</span>${chips}</div>`;
    })
    .join('');
}

/** 選擇物品的清單：相同的物品合併顯示數量 */
export function itemChoices(items: Item[]): Choice<Item>[] {
  const seen = new Map<string, { item: Item; count: number }>();
  for (const i of items) {
    const key = `${i.defId}:${i.tier}`;
    const g = seen.get(key);
    if (g) g.count++;
    else seen.set(key, { item: i, count: 1 });
  }
  return [...seen.values()].map(({ item, count }) => ({
    label: `${itemLabel(item.defId, item.tier)}${count > 1 ? `<span class="item-count">×${count}</span>` : ''}`,
    sub: itemInfoHtml(item.defId, item.tier),
    value: item,
    icon: itemIconUrl(item.defId),
    color: CATEGORY_STYLE[ITEM_DEFS[item.defId].category].color,
  }));
}

/** 分類與清單之間逐層返回；保留上次分類供使用者返回物品清單。 */
export async function chooseCategorizedItem(dialog: import('./Dialog').Dialog, items: Item[], selection: { category: string | null }): Promise<Item | null> {
  for (;;) {
    if (!selection.category) {
      const category = await dialog.choose('使用物品・選擇分類', '選擇分類後查看物品。',
        ['全部', ...Object.keys(CATEGORY_STYLE)].map(cat => ({
          label: cat, value: cat, disabled: !items.some(i => cat === '全部' || ITEM_DEFS[i.defId].category === cat), reason: '沒有此類可用物品',
        })), '關閉');
      if (!category) return null;
      selection.category = category;
    }
    const item = await dialog.choose('使用物品・' + selection.category, '先選物品，再選使用者與生效對象。',
      itemChoices(items.filter(i => selection.category === '全部' || ITEM_DEFS[i.defId].category === selection.category)), '返回分類');
    if (item) return item;
    selection.category = null;
  }
}
