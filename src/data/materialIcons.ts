import { assetUrl } from './assetUrl';
import type { MaterialGroup } from './weaponCatalog';

// Generated from the selected six-family / three-tier flat illustration set.
export const MATERIAL_ICON_FILES: Record<MaterialGroup, readonly [string, string, string]> = {
  "魄": [
    "art/icons/materials/iron-1.webp",
    "art/icons/materials/iron-2.webp",
    "art/icons/materials/iron-3.webp"
  ],
  "髓": [
    "art/icons/materials/ice-1.webp",
    "art/icons/materials/ice-2.webp",
    "art/icons/materials/ice-3.webp"
  ],
  "銅": [
    "art/icons/materials/copper-1.webp",
    "art/icons/materials/copper-2.webp",
    "art/icons/materials/copper-3.webp"
  ],
  "砂": [
    "art/icons/materials/sand-1.webp",
    "art/icons/materials/sand-2.webp",
    "art/icons/materials/sand-3.webp"
  ],
  "絲": [
    "art/icons/materials/silk-1.webp",
    "art/icons/materials/silk-2.webp",
    "art/icons/materials/silk-3.webp"
  ],
  "玉": [
    "art/icons/materials/jade-1.webp",
    "art/icons/materials/jade-2.webp",
    "art/icons/materials/jade-3.webp"
  ]
};

export function materialIconUrl(group: MaterialGroup, stage: number, base?: string): string {
  const file = MATERIAL_ICON_FILES[group]?.[stage];
  return file ? assetUrl(file, base) : '';
}
