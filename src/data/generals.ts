import type { Aptitude, LordId } from '../game/types';

export const REALMS = ['凡人', '練氣', '築基', '金丹', '元嬰', '化神'] as const;
/** 各境界修為上限；達到上限即進入瓶頸，需手動突破 */
export const REALM_EXP = [150, 400, 1000, 2000, 4000];
export const REALM_MULT = [1, 1.25, 1.6, 2.1, 2.8, 3.8];

export const APTITUDE_NAMES: Record<Aptitude, string> = { heaven: '天靈根', earth: '地靈根', pseudo: '偽靈根' };
export const APTITUDE_DESC: Record<Aptitude, string> = {
  heaven: '修煉極快，突破成功率較高',
  earth: '資質平穩',
  pseudo: '吸收靈氣慢，但戰鬥勝利獲得雙倍修為',
};

export interface GeneralSeed {
  id: string;
  name: string;
  origin: LordId;
  /** 武力 防禦 血量 煉丹 煉器 畫符 佈陣 */
  s: [number, number, number, number, number, number, number];
  realm: number;
  aptitude: Aptitude;
  /** 開局即在麾下 */
  start?: boolean;
  /** 開局駐守首都 */
  garrison?: boolean;
}

type Row = [string, string, number, number, number, number, number, number, number, number, Aptitude, string?];

/** 旗標：S=開局麾下、SG=開局駐守首都（個人被動見 passives.ts） */
function rows(origin: LordId, list: Row[]): GeneralSeed[] {
  return list.map(([id, name, f, d, hp, al, fo, ta, fm, realm, aptitude, flags = '']) => {
    const tokens = flags.split(' ');
    return {
      id,
      name,
      origin,
      s: [f, d, hp, al, fo, ta, fm],
      realm,
      aptitude,
      start: tokens.includes('S') || tokens.includes('SG'),
      garrison: tokens.includes('SG'),
    };
  });
}

export const GENERAL_SEEDS: GeneralSeed[] = [
  ...rows('liu', [
    ['guanyu', '關羽', 97, 85, 700, 20, 40, 25, 60, 1, 'earth', 'S'],
    ['zhangfei', '張飛', 98, 70, 750, 10, 35, 10, 30, 1, 'pseudo', 'S'],
    ['zhaoyun', '趙雲', 95, 88, 680, 30, 45, 30, 50, 1, 'heaven', 'SG'],
    ['zhugeliang', '諸葛亮', 45, 60, 420, 75, 70, 92, 99, 1, 'heaven', 'S'],
    ['huangzhong', '黃忠', 92, 72, 620, 25, 50, 20, 35, 0, 'earth', 'S'],
    ['machao', '馬超', 95, 75, 660, 15, 40, 15, 30, 1, 'pseudo', 'S'],
    ['weiyan', '魏延', 88, 75, 640, 20, 45, 20, 45, 0, 'pseudo', 'S'],
    ['pangtong', '龐統', 40, 55, 400, 70, 55, 85, 92, 0, 'heaven', 'S'],
    ['jiangwei', '姜維', 88, 80, 620, 50, 55, 65, 80, 0, 'heaven'],
    ['fazheng', '法正', 35, 50, 380, 60, 50, 80, 85, 0, 'earth'],
    ['madai', '馬岱', 82, 74, 600, 25, 45, 30, 45, 0, 'earth'],
    ['guanping', '關平', 84, 76, 620, 25, 45, 25, 40, 0, 'earth'],
    ['guanxing', '關興', 85, 72, 600, 25, 40, 30, 40, 0, 'earth'],
    ['zhangbao', '張苞', 86, 70, 620, 15, 40, 15, 30, 0, 'pseudo'],
    ['wangping', '王平', 78, 82, 600, 30, 50, 35, 70, 0, 'earth'],
    ['liaohua', '廖化', 76, 74, 580, 25, 45, 25, 40, 0, 'earth'],
    ['yanyan', '嚴顏', 83, 80, 640, 30, 50, 30, 50, 0, 'earth'],
    ['huangquan', '黃權', 55, 70, 480, 55, 55, 60, 75, 0, 'earth'],
    ['liyan', '李嚴', 72, 72, 540, 50, 60, 55, 70, 0, 'earth'],
    ['maliang', '馬良', 30, 50, 360, 70, 60, 82, 78, 0, 'heaven'],
    ['masu', '馬謖', 50, 55, 420, 55, 50, 70, 80, 0, 'earth'],
    ['jiangwan', '蔣琬', 35, 55, 380, 70, 55, 75, 80, 0, 'earth'],
    ['feiyi', '費禕', 38, 55, 380, 68, 55, 78, 78, 0, 'earth'],
    ['jianyong', '簡雍', 30, 50, 360, 55, 45, 65, 55, 0, 'earth'],
    ['mizhu', '糜竺', 25, 50, 360, 60, 70, 50, 45, 0, 'earth'],
    ['sunqian', '孫乾', 28, 48, 360, 58, 50, 66, 50, 0, 'earth'],
    ['yiji', '伊籍', 30, 50, 360, 60, 52, 70, 55, 0, 'earth'],
    ['wuyi', '吳懿', 75, 76, 580, 35, 50, 35, 60, 0, 'earth'],
    ['zhangyi', '張翼', 77, 74, 580, 30, 45, 30, 50, 0, 'earth'],
    ['zhoucang', '周倉', 84, 70, 640, 15, 45, 15, 25, 0, 'pseudo', ''],
  ]),
  ...rows('sun', [
    ['zhouyu', '周瑜', 70, 70, 520, 70, 60, 80, 95, 1, 'heaven', 'S'],
    ['lusu', '魯肅', 50, 65, 480, 65, 55, 70, 80, 0, 'earth', 'SG'],
    ['lvmeng', '呂蒙', 85, 78, 600, 40, 50, 55, 75, 0, 'earth', 'S'],
    ['luxun', '陸遜', 75, 72, 540, 60, 55, 85, 95, 0, 'heaven'],
    ['ganning', '甘寧', 94, 72, 640, 20, 40, 25, 40, 1, 'pseudo', 'S'],
    ['taishici', '太史慈', 93, 75, 650, 20, 45, 20, 35, 1, 'earth', 'S'],
    ['huanggai', '黃蓋', 82, 85, 680, 35, 70, 25, 45, 0, 'earth', 'S'],
    ['zhoutai', '周泰', 88, 90, 720, 15, 40, 15, 30, 1, 'pseudo', 'S'],
    ['chengpu', '程普', 80, 80, 620, 40, 55, 40, 60, 0, 'earth', 'S'],
    ['lingtong', '凌統', 86, 72, 600, 20, 40, 25, 35, 0, 'earth'],
    ['handang', '韓當', 80, 78, 600, 25, 50, 25, 45, 0, 'earth'],
    ['jiangqin', '蔣欽', 80, 74, 600, 25, 45, 25, 40, 0, 'earth'],
    ['chenwu', '陳武', 82, 72, 620, 20, 40, 20, 35, 0, 'pseudo'],
    ['xusheng', '徐盛', 84, 78, 620, 30, 55, 35, 65, 0, 'earth'],
    ['dingfeng', '丁奉', 85, 76, 620, 30, 50, 35, 60, 0, 'earth'],
    ['panzhang', '潘璋', 80, 72, 600, 25, 45, 25, 40, 0, 'earth'],
    ['zhuhuan', '朱桓', 84, 76, 620, 30, 50, 30, 55, 0, 'earth'],
    ['zhuran', '朱然', 80, 80, 600, 35, 50, 40, 65, 0, 'earth'],
    ['zhangzhao', '張昭', 30, 55, 380, 75, 55, 70, 75, 0, 'earth'],
    ['zhanghong', '張紘', 32, 52, 380, 70, 55, 72, 72, 0, 'earth'],
    ['zhugejin', '諸葛瑾', 38, 58, 400, 68, 55, 70, 76, 0, 'earth'],
    ['kanze', '闞澤', 35, 52, 380, 65, 55, 78, 70, 0, 'earth'],
    ['yufan', '虞翻', 40, 55, 400, 72, 50, 82, 70, 0, 'heaven'],
    ['guyong', '顧雍', 32, 55, 380, 70, 55, 68, 74, 0, 'earth'],
    ['buzhi', '步騭', 45, 60, 420, 60, 55, 65, 72, 0, 'earth'],
    ['lukang', '陸抗', 72, 74, 540, 55, 55, 75, 90, 0, 'heaven'],
    ['sunce', '孫策', 96, 80, 700, 25, 45, 30, 60, 1, 'pseudo', ''],
    ['sunshangxiang', '孫尚香', 82, 70, 560, 35, 75, 40, 50, 0, 'earth'],
    ['lvfan', '呂範', 60, 66, 480, 50, 60, 55, 70, 0, 'earth'],
    ['heqi', '賀齊', 78, 76, 580, 30, 60, 35, 55, 0, 'earth'],
  ]),
  ...rows('cao', [
    ['xiahoudun', '夏侯惇', 91, 82, 680, 25, 55, 25, 50, 1, 'pseudo', 'SG'],
    ['xiahouyuan', '夏侯淵', 90, 72, 620, 20, 45, 25, 45, 1, 'earth', 'S'],
    ['zhangliao', '張遼', 93, 82, 660, 30, 50, 30, 70, 1, 'earth', 'S'],
    ['xuchu', '許褚', 96, 85, 740, 10, 35, 10, 20, 1, 'pseudo', 'S'],
    ['dianwei', '典韋', 97, 88, 760, 10, 40, 10, 20, 1, 'pseudo', 'S'],
    ['guojia', '郭嘉', 30, 50, 360, 80, 55, 90, 95, 0, 'heaven', 'S'],
    ['xunyu', '荀彧', 35, 55, 400, 85, 60, 80, 90, 0, 'heaven', 'S'],
    ['simayi', '司馬懿', 65, 80, 520, 75, 65, 90, 97, 1, 'heaven', ''],
    ['xuhuang', '徐晃', 90, 80, 640, 25, 55, 30, 55, 0, 'earth', 'S'],
    ['caoren', '曹仁', 85, 90, 700, 30, 60, 30, 70, 0, 'earth'],
    ['caohong', '曹洪', 82, 78, 620, 25, 50, 25, 45, 0, 'earth'],
    ['caochun', '曹純', 84, 76, 620, 25, 50, 30, 55, 0, 'earth'],
    ['caozhen', '曹真', 82, 80, 620, 35, 55, 40, 70, 0, 'earth'],
    ['caoxiu', '曹休', 80, 76, 600, 30, 50, 35, 60, 0, 'earth'],
    ['yuejin', '樂進', 86, 76, 620, 20, 45, 25, 45, 0, 'pseudo'],
    ['yujin', '于禁', 82, 82, 620, 30, 55, 35, 70, 0, 'earth'],
    ['lidian', '李典', 78, 78, 600, 40, 55, 45, 65, 0, 'earth'],
    ['zhanghe', '張郃', 92, 82, 660, 25, 50, 35, 70, 0, 'earth'],
    ['pangde', '龐德', 93, 78, 660, 15, 45, 20, 35, 0, 'pseudo'],
    ['wenpin', '文聘', 82, 82, 620, 25, 50, 30, 55, 0, 'earth'],
    ['manchong', '滿寵', 70, 80, 560, 50, 60, 60, 80, 0, 'earth'],
    ['chengyu', '程昱', 45, 60, 420, 70, 55, 80, 85, 0, 'earth'],
    ['xunyou', '荀攸', 35, 55, 400, 75, 55, 85, 92, 0, 'heaven'],
    ['liuye', '劉曄', 38, 52, 380, 70, 75, 78, 80, 0, 'earth'],
    ['zhongyao', '鍾繇', 30, 50, 360, 72, 60, 85, 70, 0, 'earth'],
    ['chenqun', '陳群', 32, 55, 380, 72, 55, 70, 78, 0, 'earth'],
    ['dengai', '鄧艾', 85, 82, 640, 45, 55, 55, 92, 0, 'heaven'],
    ['haozhao', '郝昭', 76, 90, 620, 30, 60, 40, 80, 0, 'earth'],
    ['xiahouba', '夏侯霸', 84, 74, 600, 25, 45, 30, 50, 0, 'earth'],
    ['caopi', '曹丕', 70, 70, 520, 60, 55, 70, 75, 0, 'earth'],
  ]),
  ...rows('dong', [
    ['lvbu', '呂布', 100, 85, 800, 10, 45, 15, 30, 2, 'pseudo', 'S'],
    ['huaxiong', '華雄', 90, 75, 660, 15, 40, 15, 25, 1, 'pseudo', 'SG'],
    ['lijue', '李傕', 78, 70, 580, 20, 40, 30, 40, 0, 'earth', 'S'],
    ['guosi', '郭汜', 76, 68, 560, 20, 40, 25, 35, 0, 'earth', 'S'],
    ['zhangji', '張濟', 72, 70, 560, 25, 45, 25, 40, 0, 'earth'],
    ['fanchou', '樊稠', 78, 72, 580, 15, 40, 15, 30, 0, 'earth'],
    ['liru', '李儒', 35, 50, 380, 85, 55, 90, 85, 1, 'heaven', 'S'],
    ['jiaxu', '賈詡', 40, 60, 420, 80, 60, 95, 95, 1, 'heaven', 'S'],
    ['xurong', '徐榮', 82, 78, 600, 25, 50, 30, 65, 0, 'earth', 'S'],
    ['niufu', '牛輔', 70, 70, 560, 30, 40, 30, 40, 0, 'earth'],
    ['gaoshun', '高順', 88, 86, 660, 25, 60, 30, 75, 0, 'earth', 'S'],
    ['chengong', '陳宮', 40, 60, 420, 70, 55, 85, 90, 0, 'heaven'],
    ['zhangxiu', '張繡', 88, 76, 620, 25, 45, 30, 55, 0, 'earth'],
    ['hucheer', '胡車兒', 85, 72, 620, 15, 40, 15, 25, 0, 'pseudo', ''],
    ['huzhen', '胡軫', 78, 72, 580, 20, 40, 20, 35, 0, 'earth'],
    ['duanwei', '段煨', 72, 78, 560, 35, 50, 40, 60, 0, 'earth'],
    ['yangfeng', '楊奉', 76, 70, 560, 25, 45, 25, 40, 0, 'earth'],
    ['hanxian', '韓暹', 74, 68, 560, 20, 40, 25, 35, 0, 'earth'],
    ['dongmin', '董旻', 68, 66, 520, 30, 45, 35, 45, 0, 'earth'],
    ['dongyue', '董越', 72, 70, 540, 25, 45, 25, 40, 0, 'earth'],
    ['weixu', '魏續', 74, 70, 560, 20, 45, 20, 35, 0, 'earth'],
    ['songxian', '宋憲', 75, 70, 560, 20, 45, 20, 35, 0, 'earth'],
    ['houcheng', '侯成', 74, 72, 560, 25, 45, 25, 40, 0, 'earth'],
    ['zangba', '臧霸', 84, 80, 620, 25, 50, 30, 60, 0, 'earth'],
    ['haomeng', '郝萌', 72, 68, 540, 20, 40, 20, 30, 0, 'earth'],
    ['caoxing', '曹性', 80, 70, 580, 20, 45, 25, 35, 0, 'earth'],
    ['diaochan', '貂蟬', 45, 55, 420, 70, 60, 85, 80, 0, 'heaven', ''],
    ['mateng', '馬騰', 88, 80, 660, 25, 50, 30, 60, 0, 'earth'],
    ['hansui', '韓遂', 80, 76, 600, 40, 55, 55, 75, 0, 'earth'],
    ['wangfang', '王方', 76, 70, 560, 20, 40, 20, 35, 0, 'earth'],
  ]),
];
