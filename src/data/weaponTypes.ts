import { WEAPON_CATALOG } from './weaponCatalog';

/** 專屬武器的 22 種外型分類，每類一張圖示：public/art/icons/兵器/<分類>.webp */
export const WEAPON_TYPES = [
  '單劍', '雙劍', '單刀', '雙刀', '長柄刀', '長槍矛', '雙槍矛', '戟鉤', '斧鉞', '錘棒', '弓',
  '弩', '盾牌', '扇', '樂器', '文房器具', '法杖拐杖', '拂塵旗幡', '暗器', '容器法器', '印璽占卜', '念珠',
] as const;
export type WeaponType = typeof WEAPON_TYPES[number];

// 依第一階武器名稱的關鍵字分類，由上往下第一個符合的為準：
// 雙持、盾、長柄等較具體的寫法要排在泛用的「刀」「劍」之前（如「鋼刀與鐵盾」是盾牌、「青龍刀」是長柄刀）。
const RULES: [WeaponType, RegExp][] = [
  ['雙槍矛', /雙矛/],
  ['雙劍', /雙股劍|雙劍/],
  ['雙刀', /雙刀|雙短刀/],
  ['戟鉤', /戟|鉤/],
  ['長柄刀', /偃月刀|三尖|青龍刀/],
  ['盾牌', /盾/],
  ['斧鉞', /斧|鉞/],
  ['錘棒', /狼牙棒|骨朵|椎|錘|鞭/],
  ['長槍矛', /槍|矛|槊/],
  ['弩', /弩/],
  ['弓', /弓/],
  ['扇', /扇/],
  ['樂器', /琴|笳|笛/],
  ['文房器具', /筆|竹簡|籌|棋盤|笏|戒尺/],
  ['暗器', /飛刀|簪|針/],
  ['容器法器', /壺|葫蘆|藥箱/],
  ['印璽占卜', /璽|龜甲/],
  ['念珠', /念珠/],
  ['拂塵旗幡', /拂塵|幡|傘/],
  ['法杖拐杖', /杖/],
  ['單刀', /刀/],
  ['單劍', /劍/],
];

/** 依武器名稱判斷外型分類；沒有符合的規則時回傳 undefined */
export const classifyWeapon = (name: string): WeaponType | undefined => RULES.find(([, re]) => re.test(name))?.[0];

/** 武將 id → 專屬武器外型分類（以第一階名稱判斷，升階後外型不變） */
export const WEAPON_TYPE_BY_GENERAL: Record<string, WeaponType | undefined> = Object.fromEntries(
  Object.entries(WEAPON_CATALOG).map(([id, d]) => [id, classifyWeapon(d.names[0])]),
);
