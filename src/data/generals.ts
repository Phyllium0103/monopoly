import type { LordId } from '../game/types';

export const REALMS = ['凡人', '練氣', '築基', '金丹', '元嬰', '化神'] as const;
/** 突破至下一境界所需修為 */
export const REALM_EXP = [100, 300, 800, 2000, 5000];
export const REALM_MULT = [1, 1.25, 1.6, 2.1, 2.8, 3.8];

export interface GeneralSeed {
  id: string;
  name: string;
  origin: LordId;
  /** 武力 防禦 血量 煉丹 煉器 畫符 佈陣 */
  s: [number, number, number, number, number, number, number];
  realm: number;
  /** 開局即在麾下 */
  start?: boolean;
  /** 開局駐守首都 */
  garrison?: boolean;
}

export const GENERAL_SEEDS: GeneralSeed[] = [
  // 劉備
  { id: 'guanyu', name: '關羽', origin: 'liu', s: [97, 85, 700, 20, 40, 25, 60], realm: 1, start: true },
  { id: 'zhangfei', name: '張飛', origin: 'liu', s: [98, 70, 750, 10, 35, 10, 30], realm: 1, start: true },
  { id: 'zhaoyun', name: '趙雲', origin: 'liu', s: [95, 88, 680, 30, 45, 30, 50], realm: 1, start: true, garrison: true },
  { id: 'zhugeliang', name: '諸葛亮', origin: 'liu', s: [45, 60, 420, 75, 70, 92, 99], realm: 1, start: true },
  { id: 'huangzhong', name: '黃忠', origin: 'liu', s: [92, 72, 620, 25, 50, 20, 35], realm: 0, start: true },
  { id: 'machao', name: '馬超', origin: 'liu', s: [95, 75, 660, 15, 40, 15, 30], realm: 1 },
  { id: 'weiyan', name: '魏延', origin: 'liu', s: [88, 75, 640, 20, 45, 20, 45], realm: 0 },
  { id: 'pangtong', name: '龐統', origin: 'liu', s: [40, 55, 400, 70, 55, 85, 92], realm: 0 },
  { id: 'jiangwei', name: '姜維', origin: 'liu', s: [88, 80, 620, 50, 55, 65, 80], realm: 0 },
  { id: 'fazheng', name: '法正', origin: 'liu', s: [35, 50, 380, 60, 50, 80, 85], realm: 0 },
  // 孫權
  { id: 'zhouyu', name: '周瑜', origin: 'sun', s: [70, 70, 520, 70, 60, 80, 95], realm: 1, start: true },
  { id: 'lusu', name: '魯肅', origin: 'sun', s: [50, 65, 480, 65, 55, 70, 80], realm: 0, start: true, garrison: true },
  { id: 'lvmeng', name: '呂蒙', origin: 'sun', s: [85, 78, 600, 40, 50, 55, 75], realm: 0 },
  { id: 'luxun', name: '陸遜', origin: 'sun', s: [75, 72, 540, 60, 55, 85, 95], realm: 0 },
  { id: 'ganning', name: '甘寧', origin: 'sun', s: [94, 72, 640, 20, 40, 25, 40], realm: 1, start: true },
  { id: 'taishici', name: '太史慈', origin: 'sun', s: [93, 75, 650, 20, 45, 20, 35], realm: 0, start: true },
  { id: 'huanggai', name: '黃蓋', origin: 'sun', s: [82, 85, 680, 35, 70, 25, 45], realm: 0, start: true },
  { id: 'zhoutai', name: '周泰', origin: 'sun', s: [88, 90, 720, 15, 40, 15, 30], realm: 0 },
  { id: 'chengpu', name: '程普', origin: 'sun', s: [80, 80, 620, 40, 55, 40, 60], realm: 0 },
  { id: 'lingtong', name: '凌統', origin: 'sun', s: [86, 72, 600, 20, 40, 25, 35], realm: 0 },
  // 曹操
  { id: 'xiahoudun', name: '夏侯惇', origin: 'cao', s: [91, 82, 680, 25, 55, 25, 50], realm: 1, start: true, garrison: true },
  { id: 'xiahouyuan', name: '夏侯淵', origin: 'cao', s: [90, 72, 620, 20, 45, 25, 45], realm: 0 },
  { id: 'zhangliao', name: '張遼', origin: 'cao', s: [93, 82, 660, 30, 50, 30, 70], realm: 1, start: true },
  { id: 'xuchu', name: '許褚', origin: 'cao', s: [96, 85, 740, 10, 35, 10, 20], realm: 0, start: true },
  { id: 'dianwei', name: '典韋', origin: 'cao', s: [97, 88, 760, 10, 40, 10, 20], realm: 1, start: true },
  { id: 'guojia', name: '郭嘉', origin: 'cao', s: [30, 50, 360, 80, 55, 90, 95], realm: 0, start: true },
  { id: 'xunyu', name: '荀彧', origin: 'cao', s: [35, 55, 400, 85, 60, 80, 90], realm: 0 },
  { id: 'simayi', name: '司馬懿', origin: 'cao', s: [65, 80, 520, 75, 65, 90, 97], realm: 1 },
  { id: 'xuhuang', name: '徐晃', origin: 'cao', s: [90, 80, 640, 25, 55, 30, 55], realm: 0 },
  { id: 'caoren', name: '曹仁', origin: 'cao', s: [85, 90, 700, 30, 60, 30, 70], realm: 0 },
  // 董卓
  { id: 'lvbu', name: '呂布', origin: 'dong', s: [100, 85, 800, 10, 45, 15, 30], realm: 2, start: true },
  { id: 'huaxiong', name: '華雄', origin: 'dong', s: [90, 75, 660, 15, 40, 15, 25], realm: 1, start: true, garrison: true },
  { id: 'lijue', name: '李傕', origin: 'dong', s: [78, 70, 580, 20, 40, 30, 40], realm: 0 },
  { id: 'guosi', name: '郭汜', origin: 'dong', s: [76, 68, 560, 20, 40, 25, 35], realm: 0 },
  { id: 'zhangji', name: '張濟', origin: 'dong', s: [72, 70, 560, 25, 45, 25, 40], realm: 0 },
  { id: 'fanchou', name: '樊稠', origin: 'dong', s: [78, 72, 580, 15, 40, 15, 30], realm: 0 },
  { id: 'liru', name: '李儒', origin: 'dong', s: [35, 50, 380, 85, 55, 90, 85], realm: 1, start: true },
  { id: 'jiaxu', name: '賈詡', origin: 'dong', s: [40, 60, 420, 80, 60, 95, 95], realm: 1, start: true },
  { id: 'xurong', name: '徐榮', origin: 'dong', s: [82, 78, 600, 25, 50, 30, 65], realm: 0, start: true },
  { id: 'niufu', name: '牛輔', origin: 'dong', s: [70, 70, 560, 30, 40, 30, 40], realm: 0 },
];
