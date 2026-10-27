import { MATERIAL_GROUPS, MATERIAL_NAMES, type MaterialGroup } from '../data/weaponCatalog';
import { materialIconUrl } from '../data/materialIcons';
import type { Lord } from '../game/types';

/** Static catalog text only: safe for dialogs and serializable P2P prompts. */
export function materialLabel(group: MaterialGroup, stage: number): string {
  const name = MATERIAL_NAMES[group]?.[stage], url = materialIconUrl(group, stage);
  if (!name || !url) return '';
  return `<span class="material-label"><img class="material-icon" src="${url}" alt="" width="32" height="32">${name}</span>`;
}

export function materialsHtml(lord: Lord): string {
  return `<div class="materials-grid">${MATERIAL_GROUPS.map(group =>
    `<div class="material-family">${MATERIAL_NAMES[group].map((_, stage) =>
      `<span class="material-quantity">${materialLabel(group, stage)}<b>${lord.materials[group][stage]} 顆</b></span>`
    ).join('')}</div>`
  ).join('')}</div>`;
}
