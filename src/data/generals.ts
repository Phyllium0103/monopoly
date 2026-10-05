import type { Aptitude, LordId } from '../game/types';

export const REALMS = ['凡人', '煉氣', '築基', '金丹', '元嬰', '化神', '煉虛', '合體', '大乘', '渡劫', '真仙'] as const;
/** 各境界修為上限；達到上限即進入瓶頸，需手動突破 */
export const REALM_EXP = [150, 350, 800, 1600, 3200, 6000, 10000, 16000, 24000, 36000];
export const REALM_MULT = [1, 1.25, 1.6, 2.1, 2.8, 3.8, 5, 6.5, 8.5, 11, 15];

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
  /** 主公本人（可出戰，但不能派進城池、不會戰死） */
  lord?: boolean;
}

type Row = [string, string, number, number, number, number, number, number, number, number, Aptitude, string?];

/** 旗標：S=開局麾下、SG=開局駐守首都、L=主公本人（個人被動見 passives.ts） */
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
      start: tokens.includes('S') || tokens.includes('SG') || tokens.includes('L'),
      garrison: tokens.includes('SG'),
      lord: tokens.includes('L'),
    };
  });
}

/**
 * 能力值依史書評價與演義形象：猛將武力高、防禦血量看體格與打法，
 * 謀士技藝高而體弱，工匠、方士各有偏門。每國開局 15 人。
 * 欄位：id 名 武力 防禦 血量 煉丹 煉器 畫符 佈陣 境界 靈根 旗標
 */
export const GENERAL_SEEDS: GeneralSeed[] = [
  ...rows('liu', [
    ['liubei', '劉備', 70, 74, 600, 50, 50, 50, 72, 1, 'earth', 'L'],
    ['guanyu', '關羽', 96, 84, 720, 20, 40, 25, 60, 1, 'earth', 'S'],
    ['zhangfei', '張飛', 94, 68, 760, 8, 30, 8, 25, 1, 'pseudo', 'S'],
    ['zhaoyun', '趙雲', 93, 86, 700, 28, 45, 30, 50, 1, 'heaven', 'SG'],
    ['zhugeliang', '諸葛亮', 38, 60, 400, 80, 72, 94, 99, 1, 'heaven', 'S'],
    ['huangzhong', '黃忠', 91, 70, 620, 25, 50, 20, 35, 0, 'earth', 'S'],
    ['machao', '馬超', 94, 72, 670, 15, 40, 15, 30, 1, 'pseudo', 'S'],
    ['weiyan', '魏延', 87, 76, 640, 20, 45, 20, 48, 0, 'pseudo', 'S'],
    ['pangtong', '龐統', 36, 52, 380, 72, 55, 86, 93, 0, 'heaven', 'S'],
    ['jiangwei', '姜維', 86, 80, 620, 50, 55, 65, 82, 0, 'heaven', 'S'],
    ['fazheng', '法正', 34, 48, 360, 60, 50, 82, 86, 0, 'earth', 'S'],
    ['madai', '馬岱', 80, 72, 590, 25, 45, 30, 45, 0, 'earth', 'S'],
    ['guanping', '關平', 82, 78, 620, 25, 45, 25, 40, 0, 'earth', 'S'],
    ['maliang', '馬良', 28, 48, 350, 72, 60, 84, 78, 0, 'heaven', 'S'],
    ['jianyong', '簡雍', 28, 48, 350, 55, 45, 68, 55, 0, 'earth', 'S'],
    ['mizhu', '糜竺', 24, 50, 360, 62, 72, 50, 45, 0, 'earth', 'S'],
    ['guanxing', '關興', 84, 70, 600, 25, 40, 30, 40, 0, 'earth'],
    ['zhangbao', '張苞', 85, 68, 640, 15, 40, 15, 30, 0, 'pseudo'],
    ['wangping', '王平', 76, 84, 600, 30, 50, 35, 72, 0, 'earth'],
    ['liaohua', '廖化', 75, 74, 600, 25, 45, 25, 40, 0, 'earth'],
    ['yanyan', '嚴顏', 82, 82, 650, 30, 50, 30, 50, 0, 'earth'],
    ['huangquan', '黃權', 54, 72, 480, 55, 55, 60, 75, 0, 'earth'],
    ['liyan', '李嚴', 70, 72, 540, 50, 62, 55, 70, 0, 'earth'],
    ['masu', '馬謖', 50, 52, 420, 55, 50, 72, 82, 0, 'earth'],
    ['jiangwan', '蔣琬', 32, 55, 380, 72, 55, 75, 80, 0, 'earth'],
    ['feiyi', '費禕', 36, 55, 380, 68, 55, 80, 78, 0, 'earth'],
    ['sunqian', '孫乾', 26, 48, 360, 58, 50, 66, 50, 0, 'earth'],
    ['yiji', '伊籍', 28, 50, 360, 62, 52, 70, 55, 0, 'earth'],
    ['zhoucang', '周倉', 82, 70, 640, 15, 50, 15, 25, 0, 'pseudo'],
    ['chendao', '陳到', 86, 82, 640, 25, 45, 30, 62, 0, 'earth'],
    ['liufeng', '劉封', 82, 72, 600, 20, 40, 25, 40, 0, 'earth'],
    ['mengda', '孟達', 64, 66, 520, 40, 55, 62, 60, 0, 'earth'],
    ['dengzhi', '鄧芝', 52, 64, 460, 50, 50, 70, 68, 0, 'earth'],
    ['menghuo', '孟獲', 90, 78, 720, 15, 40, 15, 25, 0, 'pseudo'],
    ['zhurongfuren', '祝融夫人', 82, 72, 600, 30, 60, 40, 35, 0, 'earth'],
    ['huangyueying', '黃月英', 40, 55, 400, 60, 95, 55, 80, 0, 'heaven'],
    ['shamoke', '沙摩柯', 84, 70, 640, 20, 40, 20, 25, 0, 'pseudo'],
    ['guansuo', '關索', 82, 74, 600, 25, 45, 25, 40, 0, 'earth'],
    ['mifang', '糜芳', 60, 62, 500, 35, 50, 30, 40, 0, 'earth'],
    ['zhugezhan', '諸葛瞻', 52, 60, 440, 55, 50, 70, 78, 0, 'earth'],
    ['zhangxingcai', '張星彩', 80, 74, 580, 30, 50, 30, 45, 0, 'earth'],
  ]),
  ...rows('sun', [
    ['sunquan', '孫權', 62, 70, 560, 55, 55, 60, 78, 1, 'earth', 'L'],
    ['zhouyu', '周瑜', 72, 70, 540, 70, 60, 82, 96, 1, 'heaven', 'S'],
    ['lusu', '魯肅', 50, 68, 480, 66, 55, 70, 80, 0, 'earth', 'SG'],
    ['lvmeng', '呂蒙', 84, 78, 600, 40, 50, 55, 76, 0, 'earth', 'S'],
    ['luxun', '陸遜', 72, 72, 540, 62, 55, 86, 95, 0, 'heaven', 'S'],
    ['ganning', '甘寧', 92, 70, 640, 20, 40, 25, 40, 1, 'pseudo', 'S'],
    ['taishici', '太史慈', 92, 74, 650, 20, 45, 22, 36, 1, 'earth', 'S'],
    ['huanggai', '黃蓋', 80, 86, 680, 35, 72, 25, 45, 0, 'earth', 'S'],
    ['zhoutai', '周泰', 88, 90, 740, 15, 40, 15, 30, 1, 'pseudo', 'S'],
    ['chengpu', '程普', 80, 80, 620, 40, 55, 40, 62, 0, 'earth', 'S'],
    ['lingtong', '凌統', 85, 70, 600, 20, 40, 25, 36, 0, 'earth', 'S'],
    ['handang', '韓當', 80, 78, 600, 25, 50, 25, 45, 0, 'earth', 'S'],
    ['zhangzhao', '張昭', 28, 55, 380, 76, 55, 70, 75, 0, 'earth', 'S'],
    ['zhugejin', '諸葛瑾', 36, 58, 400, 68, 55, 70, 76, 0, 'earth', 'S'],
    ['xusheng', '徐盛', 83, 78, 620, 30, 55, 35, 66, 0, 'earth', 'S'],
    ['zhuran', '朱然', 80, 80, 600, 35, 50, 40, 66, 0, 'earth', 'S'],
    ['jiangqin', '蔣欽', 80, 74, 600, 25, 45, 25, 40, 0, 'earth'],
    ['dingfeng', '丁奉', 84, 76, 620, 30, 50, 35, 60, 0, 'earth'],
    ['panzhang', '潘璋', 80, 70, 600, 25, 45, 25, 40, 0, 'earth'],
    ['zhuhuan', '朱桓', 83, 76, 620, 30, 50, 30, 56, 0, 'earth'],
    ['yufan', '虞翻', 40, 55, 400, 72, 50, 84, 70, 0, 'heaven'],
    ['guyong', '顧雍', 30, 55, 380, 70, 55, 68, 74, 0, 'earth'],
    ['lukang', '陸抗', 70, 76, 540, 56, 55, 75, 90, 0, 'heaven'],
    ['sunce', '孫策', 94, 78, 700, 25, 45, 30, 60, 1, 'pseudo'],
    ['sunshangxiang', '孫尚香', 80, 68, 560, 35, 76, 40, 50, 0, 'earth'],
    ['lvfan', '呂範', 58, 66, 480, 50, 60, 55, 70, 0, 'earth'],
    ['heqi', '賀齊', 78, 76, 580, 30, 62, 35, 55, 0, 'earth'],
    ['sunjian', '孫堅', 91, 80, 720, 22, 50, 25, 55, 1, 'pseudo'],
    ['bulianshi', '步練師', 28, 50, 380, 78, 60, 72, 78, 0, 'earth'],
    ['daqiao', '大喬', 30, 50, 380, 76, 62, 70, 72, 0, 'earth'],
    ['xiaoqiao', '小喬', 32, 48, 360, 72, 60, 78, 74, 0, 'earth'],
    ['zhugeke', '諸葛恪', 58, 62, 480, 55, 50, 70, 82, 0, 'earth'],
    ['sunjiao', '孫皎', 74, 72, 560, 30, 45, 30, 55, 0, 'earth'],
    ['zhoufang', '周魴', 52, 64, 460, 50, 50, 66, 72, 0, 'earth'],
    ['lukai', '陸凱', 46, 66, 460, 56, 52, 66, 70, 0, 'earth'],
    ['wuguotai', '吳國太', 24, 52, 400, 70, 55, 64, 60, 0, 'earth'],
    ['sunluban', '孫魯班', 30, 50, 380, 60, 55, 62, 64, 0, 'earth'],
    ['zhuzhi', '朱治', 70, 74, 560, 32, 48, 36, 56, 0, 'earth'],
    ['sundeng', '孫登', 50, 66, 500, 52, 50, 56, 66, 0, 'earth'],
    ['liuzan', '留贊', 82, 72, 620, 18, 40, 20, 36, 0, 'pseudo'],
  ]),
  ...rows('cao', [
    ['caocao', '曹操', 72, 72, 620, 65, 60, 70, 92, 1, 'heaven', 'L'],
    ['xiahoudun', '夏侯惇', 90, 82, 680, 25, 55, 25, 50, 1, 'pseudo', 'SG'],
    ['xiahouyuan', '夏侯淵', 90, 72, 620, 20, 45, 25, 45, 1, 'earth', 'S'],
    ['zhangliao', '張遼', 92, 82, 660, 30, 50, 30, 70, 1, 'earth', 'S'],
    ['xuchu', '許褚', 94, 86, 740, 10, 35, 10, 20, 1, 'pseudo', 'S'],
    ['dianwei', '典韋', 95, 86, 760, 10, 40, 10, 20, 1, 'pseudo', 'S'],
    ['guojia', '郭嘉', 28, 46, 340, 80, 55, 90, 95, 0, 'heaven', 'S'],
    ['xunyu', '荀彧', 34, 55, 400, 85, 60, 80, 90, 0, 'heaven', 'S'],
    ['xuhuang', '徐晃', 89, 80, 640, 25, 55, 30, 56, 0, 'earth', 'S'],
    ['caoren', '曹仁', 84, 90, 700, 30, 60, 30, 70, 0, 'earth', 'S'],
    ['zhanghe', '張郃', 90, 82, 660, 25, 50, 35, 72, 0, 'earth', 'S'],
    ['chengyu', '程昱', 45, 60, 420, 70, 55, 80, 85, 0, 'earth', 'S'],
    ['xunyou', '荀攸', 34, 55, 400, 75, 55, 85, 92, 0, 'heaven', 'S'],
    ['yujin', '于禁', 80, 84, 620, 30, 55, 35, 70, 0, 'earth', 'S'],
    ['yuejin', '樂進', 85, 76, 620, 20, 45, 25, 45, 0, 'pseudo', 'S'],
    ['caohong', '曹洪', 80, 78, 620, 25, 50, 25, 45, 0, 'earth', 'S'],
    ['simayi', '司馬懿', 62, 82, 520, 75, 65, 90, 97, 1, 'heaven'],
    ['caozhen', '曹真', 80, 80, 620, 35, 55, 40, 70, 0, 'earth'],
    ['lidian', '李典', 76, 78, 600, 42, 55, 45, 65, 0, 'earth'],
    ['pangde', '龐德', 91, 78, 660, 15, 45, 20, 35, 0, 'pseudo'],
    ['wenpin', '文聘', 80, 84, 620, 25, 50, 30, 55, 0, 'earth'],
    ['manchong', '滿寵', 68, 82, 560, 50, 60, 60, 80, 0, 'earth'],
    ['zhongyao', '鍾繇', 28, 50, 360, 72, 60, 86, 70, 0, 'earth'],
    ['chenqun', '陳群', 30, 55, 380, 72, 55, 70, 78, 0, 'earth'],
    ['dengai', '鄧艾', 84, 82, 640, 45, 55, 55, 92, 0, 'heaven'],
    ['haozhao', '郝昭', 74, 90, 620, 30, 60, 40, 82, 0, 'earth'],
    ['caopi', '曹丕', 68, 70, 520, 60, 55, 70, 75, 0, 'earth'],
    ['caozhang', '曹彰', 90, 76, 700, 10, 35, 10, 25, 0, 'pseudo'],
    ['caoang', '曹昂', 70, 74, 560, 40, 45, 35, 50, 0, 'earth'],
    ['xushu', '徐庶', 56, 60, 460, 66, 55, 74, 86, 0, 'heaven'],
    ['zhonghui', '鍾會', 62, 66, 500, 62, 58, 76, 88, 0, 'heaven'],
    ['simazhao', '司馬昭', 60, 72, 520, 58, 55, 68, 78, 0, 'earth'],
    ['caozhi', '曹植', 38, 48, 360, 72, 50, 90, 68, 0, 'heaven'],
    ['simashi', '司馬師', 74, 76, 580, 55, 60, 72, 86, 0, 'earth'],
    ['caiwenji', '蔡文姬', 28, 46, 340, 70, 55, 92, 72, 0, 'heaven'],
    ['zhenji', '甄姬', 30, 48, 360, 74, 58, 84, 70, 0, 'earth'],
    ['xuyou', '許攸', 40, 52, 400, 60, 55, 76, 82, 0, 'earth'],
    ['jianggan', '蔣幹', 28, 48, 360, 58, 50, 68, 60, 0, 'earth'],
    ['niujin', '牛金', 84, 74, 620, 18, 42, 20, 36, 0, 'pseudo'],
    ['wangshuang', '王雙', 88, 70, 640, 12, 40, 15, 28, 0, 'pseudo'],
  ]),
  ...rows('dong', [
    ['dongzhuo', '董卓', 88, 80, 780, 25, 40, 25, 40, 1, 'pseudo', 'L'],
    ['lvbu', '呂布', 98, 76, 800, 10, 45, 15, 30, 1, 'pseudo', 'S'],
    ['huaxiong', '華雄', 89, 76, 660, 15, 40, 15, 25, 1, 'pseudo', 'SG'],
    ['lijue', '李傕', 78, 70, 580, 20, 40, 30, 40, 0, 'earth', 'S'],
    ['guosi', '郭汜', 76, 68, 560, 20, 40, 25, 35, 0, 'earth', 'S'],
    ['liru', '李儒', 34, 50, 380, 86, 55, 90, 85, 1, 'heaven', 'S'],
    ['jiaxu', '賈詡', 38, 60, 420, 80, 60, 95, 95, 1, 'heaven', 'S'],
    ['xurong', '徐榮', 82, 78, 600, 25, 50, 30, 66, 0, 'earth', 'S'],
    ['gaoshun', '高順', 86, 88, 660, 25, 60, 30, 76, 0, 'earth', 'S'],
    ['chengong', '陳宮', 40, 60, 420, 70, 55, 85, 90, 0, 'heaven', 'S'],
    ['zhangji', '張濟', 72, 70, 560, 25, 45, 25, 40, 0, 'earth', 'S'],
    ['zhangxiu', '張繡', 88, 74, 620, 25, 45, 30, 55, 0, 'earth', 'S'],
    ['hucheer', '胡車兒', 84, 70, 620, 15, 42, 15, 25, 0, 'pseudo', 'S'],
    ['diaochan', '貂蟬', 42, 52, 400, 72, 60, 86, 80, 0, 'heaven', 'S'],
    ['zangba', '臧霸', 84, 80, 620, 25, 50, 30, 60, 0, 'earth'],
    ['mateng', '馬騰', 86, 80, 660, 25, 50, 30, 60, 0, 'earth'],
    ['hansui', '韓遂', 78, 76, 600, 42, 55, 55, 76, 0, 'earth'],
    ['lisu', '李肅', 70, 64, 520, 40, 45, 55, 60, 0, 'earth'],
    ['yanxing', '閻行', 88, 74, 640, 20, 45, 22, 45, 0, 'pseudo'],
    ['chenggongying', '成公英', 44, 58, 420, 66, 55, 78, 82, 0, 'earth'],
    ['zhanglu', '張魯', 50, 68, 480, 82, 55, 80, 70, 0, 'heaven'],
    ['yanliang', '顏良', 90, 76, 680, 12, 40, 15, 30, 0, 'pseudo', 'S'],
    ['wenchou', '文丑', 89, 74, 660, 12, 40, 15, 30, 0, 'pseudo'],
    ['jiling', '紀靈', 85, 78, 640, 20, 50, 22, 48, 0, 'earth'],
    ['juyi', '鞠義', 78, 76, 580, 25, 55, 28, 72, 0, 'earth'],
    ['jushou', '沮授', 34, 56, 400, 70, 55, 82, 90, 0, 'heaven'],
    ['tianfeng', '田豐', 30, 52, 380, 72, 55, 86, 88, 0, 'heaven'],
    ['lvlingqi', '呂玲綺', 90, 76, 640, 15, 40, 20, 40, 0, 'earth', 'S'],
    ['yuanshao', '袁紹', 68, 72, 620, 40, 55, 45, 70, 0, 'earth'],
    ['yuanshu', '袁術', 60, 66, 560, 45, 60, 40, 55, 0, 'earth'],
    ['zhangjiao', '張角', 52, 64, 520, 82, 55, 92, 78, 1, 'heaven'],
    ['zhangbaoyj', '張寶', 66, 66, 560, 60, 50, 76, 60, 0, 'earth'],
    ['zhangliang', '張梁', 74, 70, 600, 40, 45, 60, 55, 0, 'earth'],
    ['gongsunzan', '公孫瓚', 86, 76, 660, 15, 45, 25, 55, 0, 'earth'],
    ['liubiao', '劉表', 50, 66, 500, 45, 50, 45, 68, 0, 'earth'],
    ['shenpei', '審配', 54, 74, 520, 40, 55, 50, 78, 0, 'earth'],
    ['taoqian', '陶謙', 48, 66, 500, 40, 50, 40, 60, 0, 'earth'],
    ['gaolan', '高覽', 84, 76, 620, 20, 45, 25, 45, 0, 'earth'],
    ['wutugu', '兀突骨', 96, 92, 900, 10, 30, 10, 20, 0, 'pseudo'],
    ['mulu', '木鹿大王', 66, 64, 580, 70, 45, 80, 60, 0, 'earth'],
  ]),
];

export interface HiddenSeed {
  id: string;
  name: string;
  s: GeneralSeed['s'];
  realm: number;
  aptitude: Aptitude;
}

/** 隱藏武將：不屬於任何勢力，只有「仙人出山」事件才會現身聽風樓（欄位同上，不含旗標） */
export const HIDDEN_SEEDS: HiddenSeed[] = [
  { id: 'zuoci', name: '左慈', s: [45, 70, 520, 80, 70, 99, 90], realm: 3, aptitude: 'heaven' },
  { id: 'yuji', name: '于吉', s: [38, 66, 480, 88, 62, 97, 85], realm: 3, aptitude: 'heaven' },
  { id: 'huatuo', name: '華佗', s: [30, 62, 460, 99, 78, 70, 60], realm: 2, aptitude: 'heaven' },
  { id: 'guanlu', name: '管輅', s: [36, 62, 460, 70, 62, 90, 99], realm: 3, aptitude: 'heaven' },
  { id: 'shuijing', name: '水鏡先生', s: [30, 60, 420, 85, 60, 80, 99], realm: 2, aptitude: 'heaven' },
  { id: 'pangdegong', name: '龐德公', s: [34, 60, 440, 80, 60, 78, 92], realm: 2, aptitude: 'heaven' },
  { id: 'huangchengyan', name: '黃承彥', s: [40, 60, 440, 70, 92, 70, 86], realm: 2, aptitude: 'earth' },
  { id: 'xushao', name: '許劭', s: [28, 52, 380, 70, 55, 86, 78], realm: 2, aptitude: 'heaven' },
  { id: 'zhangzhongjing', name: '張仲景', s: [26, 56, 420, 99, 60, 70, 60], realm: 2, aptitude: 'heaven' },
  { id: 'dongfeng', name: '董奉', s: [30, 58, 440, 96, 55, 66, 60], realm: 2, aptitude: 'heaven' },
  { id: 'guanning', name: '管寧', s: [32, 70, 460, 72, 60, 70, 80], realm: 2, aptitude: 'earth' },
  { id: 'nanhua', name: '南華老仙', s: [70, 80, 640, 80, 70, 98, 92], realm: 3, aptitude: 'heaven' },
  { id: 'pujing', name: '普靜禪師', s: [60, 92, 700, 78, 60, 86, 80], realm: 3, aptitude: 'heaven' },
];
