import { MAP_MODELS } from '../data/mapModels';

export interface RoofPalette {
  name: string;
  main: string;
  light: string;
  dark: string;
  reason: string;
}
export interface RoofStudy {
  key: keyof typeof MAP_MODELS;
  name: string;
  purpose: string;
  treatment: string;
  materials: Record<string, 'main' | 'light' | 'dark'>;
  /** Shared roof/paving or canopy/curtain materials are restricted by original model height. */
  minHeight?: number;
  maxHeight?: number;
  minUpNormal?: number;
  noRoof?: string;
  palettes: RoofPalette[];
}
const p = (name: string, main: string, light: string, dark: string, reason: string): RoofPalette => ({name, main, light, dark, reason});

/** Review-only palettes. No runtime game material or delivered GLB is changed. */
export const ROOF_STUDIES: RoofStudy[] = [
  {
    key:'forge', name:'天工坊', purpose:'鍛造・寶衣', treatment:'主屋頂瓦面；木構、煙垢、銅鐵與爐火維持原色。',
    materials:{RFmat_roof:'main'},
    palettes:[
      p('鐵青爐火','#354953','#71828A','#202D33','鐵青屋面襯托橙色爐火，保留工坊的沉穩重量感。'),
      p('赭陶銅韻','#965D40','#C18A63','#583E32','溫暖赭陶呼應銅器與窯爐，與青綠系商店拉開距離。'),
      p('霧銀舊瓦','#8A8D87','#BBC0B3','#555E59','淺霧銀瓦呼應鍛造金屬，明度高於鐵青方案，讓爐火與深色工具更突出。'),
    ],
  },
  {
    key:'herb', name:'百草堂', purpose:'藥草・丹藥', treatment:'藥房瓦頂與瓦邊；透明溫室、植物及藥罐維持原色。',
    materials:{BHmat_roof:'main',BHmat_roofedge:'dark'},
    palettes:[
      p('藥園鼠尾草','#71866A','#ADBA93','#435F4A','灰綠藥瓦搭配深綠瓦邊，呼應藥草與療癒用途。'),
      p('月白青瓷','#B1CBC2','#DEE3D1','#537E79','淺青瓷形成清潔明亮的醫藥氣質，也能從深色建築中跳出。'),
      p('暖杏藥香','#BA9567','#E3CB9E','#78694D','暖杏與草木褐讓藥房像古樸丹坊，避免與綠色園林混成一片。'),
    ],
  },
  {
    key:'treasure', name:'天寶商行', purpose:'法器・陣法・符籙', treatment:'主樓與塔樓瓦面、深色瓦帶；金屬飾件與商品維持原色。',
    materials:{TBmat_roof:'main',TBmat_roofdark:'dark'},
    palettes:[
      p('孔雀寶藍','#285C78','#6C9AA9','#173D53','寶藍配金飾，強化珍奇貨品與商行的華麗感。'),
      p('琥珀鎏金','#A67A37','#D4AE62','#6C4D27','以琥珀色瓦面呼應財富；深褐瓦帶保留屋面層次。'),
      p('紫檀珍藏','#744E70','#A17C9A','#412F49','紫檀與淡紫形成收藏閣氣質，與醫藥、招募建築區分。'),
    ],
  },
  {
    key:'library', name:'藏經閣', purpose:'典籍・功法', treatment:'多層屋頂瓦面及瓦邊；書卷、書架與金色細節維持原色。',
    materials:{LBmat_roof:'main',LBmat_roofedge:'dark'},
    palettes:[
      p('藏書靛青','#3F526F','#8696A8','#29384D','靛青帶出安靜學府感，與象牙書頁形成清楚對比。'),
      p('硯墨灰瓦','#626B6A','#ADB3A8','#394747','硯墨灰綠抑制華麗感，讓卷軸與樓層節奏主導外觀。'),
      p('竹簡茶褐','#90744E','#C7AC7B','#544B38','竹簡茶褐回應古籍材質，呈現較溫暖的傳承之所。'),
    ],
  },
  {
    key:'beast', name:'萬獸園', purpose:'靈獸・馴養', treatment:'主屋頂與圓頂的深淺瓦面；獸欄、布簾和植物維持原色。',
    materials:{BZmat_roof:'main',BZmat_rooflight:'light',BZmat_roofdark:'dark'},
    palettes:[
      p('雨林翡翠','#3D7664','#90B496','#254B42','翡翠與嫩綠雙色呼應靈獸棲地，圓頂與主樓仍有明暗層次。'),
      p('獸紋赭金','#A47A3F','#D0B273','#624F31','赭金帶出獸皮、草原與馴養的自然感，暖色圓頂辨識鮮明。'),
      p('山嵐藍綠','#4E7E8A','#9CBAB8','#2D535B','低飽和藍綠帶出山林靈氣，保留與植被不同的屋頂輪廓。'),
    ],
  },
  {
    key:'tavern', name:'聽風樓', purpose:'招募・交遊', treatment:'主樓、側翼與瞭望亭的三段瓦色；酒器、燈籠與木樓維持原色。',
    materials:{TW17mat_roof:'main',TW17mat_rooflight:'light',TW17mat_roofdark:'dark'},
    palettes:[
      p('酒旗胭脂','#995B62','#CA9190','#603C4B','胭脂瓦搭配暖燈，讓熱鬧招募酒樓有溫度而不過度鮮紅。'),
      p('晚霞橘陶','#B6794E','#DDA87B','#77513D','橘陶深淺屋面呼應人間煙火，與書閣的冷色相對。'),
      p('遠山青黛','#536F7D','#A2B0AA','#354B5A','青黛帶出聽風望遠的清雅氣質，燈籠仍是暖色焦點。'),
    ],
  },
  {
    key:'casino', name:'乾坤骰殿', purpose:'骰運・博戲', treatment:'折面屋頂的主瓦及亮瓦；紅柱、骰面與金色細節維持原色。',
    materials:{'MAT-QK18_roof':'main','MAT-QK18_rooflight':'light'},
    palettes:[
      p('朱砂金運','#A94640','#D88064','#682F30','朱砂與朱橙折面呼應骰運和喜慶，以原本金飾收邊。'),
      p('帝紫雙彩','#71518F','#AF8BB5','#453158','紫色折瓦形成華麗殿閣印象，與商店和民居明顯區別。'),
      p('金雀琉璃','#A88F3D','#DAC778','#65592D','黃綠琉璃帶出幸運、籌碼和財氣，避免使用刺眼亮黃。'),
    ],
  },
  {
    key:'secret', name:'秘境', purpose:'探索・試煉', treatment:'三組紫瓦材質對應主、亮、暗屋面；入口、光效及植被維持原色。',
    materials:{'MAT-secret-roof-purple-0':'main','MAT-secret-roof-purple-1':'light','MAT-secret-roof-purple-2':'dark'},
    palettes:[
      p('暮紫仙闕','#755B98','#AB91B9','#45345F','暮紫深淺屋瓦強化異界入口，與一般服務設施拉開氣質。'),
      p('寒潭碧影','#307F80','#88B7AC','#225458','寒碧帶出深潭與幽境，讓入口光效有冷暖分離。'),
      p('月砂銀藍','#96A7BD','#D1D4D2','#586C8B','淺銀藍像月光中的秘閣，降低飽和度保留神祕感。'),
    ],
  },
  {
    key:'martial', name:'淬體武院', purpose:'練武・淬體', treatment:'折疊陶瓦的主、次兩組屋面；練武石、木樁與旗幟維持原色。', minHeight:0.55,
    materials:{MAT_CT2_FoldedTerracotta:'main',MAT_CT2_FoldedTerracottaAlt:'light'},
    palettes:[
      p('赤陶武風','#A15E42','#C8895C','#61412F','赤陶呼應火煉與體魄，保留武院樸實而強悍的性格。'),
      p('玄鐵蒼瓦','#3F535E','#7B9098','#293A42','玄鐵灰藍回應兵器與練功石，降低裝飾性、提高力量感。'),
      p('沙金軍瓦','#A18B5A','#C8B686','#645B3D','沙金與深褐瓦脊呈現軍營式秩序，適合露天練武場。'),
    ],
  },
  {
    key:'arts', name:'四藝道院', purpose:'丹・器・符・陣', treatment:'銅綠屋面與淺色瓦邊；四藝器具、講席、庭園維持原色。',
    materials:{MAT_AR6_RoofPatina:'main',MAT_AR6_RoofCreamEdge:'light'},
    palettes:[
      p('古銅青綠','#537D72','#D0C8A1','#344E49','古銅綠配米色瓦邊，將四藝器具統整為清雅道院。'),
      p('丹砂墨緣','#9D6554','#C8AB85','#503C39','低飽和丹砂帶出丹、符意象，米褐收邊保持書院氣質。'),
      p('煙藍象牙','#677C96','#D5D4BC','#414E64','煙藍大屋面與象牙瓦邊形成乾淨層次，辨識度來自冷暖分區。'),
    ],
  },
  {
    key:'appraisal', name:'萬寶鑑定所', purpose:'鑑寶・品評', treatment:'主瓦面、次瓦面與頂端採光頂一起換色；鑑寶台、珠玉與招牌維持原色。',
    materials:{MAT_APP_TealRoof:'main',MAT_APP_TealRoofAlt:'light',MAT_APP_SourceTintCrownGlass:'light'},
    palettes:[
      p('青瓷鑑寶','#3E8583','#87B4A8','#285D60','青瓷深淺瓦色呼應玉器，以穩重底色托出珠玉。'),
      p('珍珠暖灰','#9B9A89','#D1CDB3','#66695E','珍珠灰與淺米帶出細緻中立的鑑定場所，避免搶走展品色彩。'),
      p('寶石鈷藍','#3E638C','#80A0BA','#2A425E','鈷藍讓鑑定所像寶石匣，在小尺寸下仍有明確色塊。'),
    ],
  },
  {
    key:'ghost', name:'鬼市', purpose:'幽市・奇珍', treatment:'四組琉璃瓦、暗瓦、瓦邊；鬼火、帷幕、商品與金屬雕飾維持原色。',
    materials:{MAT_GS5_BlueBlackTile:'dark',MAT_GS5_SourceGlazedBlueTile0:'main',MAT_GS5_SourceGlazedBlueTile1:'light',MAT_GS5_SourceGlazedBlueTile2:'main',MAT_GS5_SourceGlazedBlueTile3:'dark',MAT_GS5_TileEdge:'dark',MAT_GS5_AgedJadeRoofEdge:'light'},
    palettes:[
      p('幽紫墨瓦','#51436F','#807A9D','#272A40','幽紫與墨瓦呼應夜市和異寶，保留原有青色鬼火作焦點。'),
      p('深潭孔雀','#285D63','#6D9690','#1C363F','深孔雀綠形成陰翳瓦面，亮瓦與鬼火仍有明暗分離。'),
      p('殘銅暗赭','#725647','#A98E6C','#3B3338','暗赭與殘銅表達古物交易的歲月感，與紫布、青火形成三色關係。'),
    ],
  },
  {
    key:'recruitment', name:'募兵司', purpose:'徵兵・軍務', treatment:'軍帳上蓋布面；牆面、虎首、招牌及地坪維持原色。', minHeight:0.48,
    materials:{MB_MAT_indigo_cloth:'main',MB_MAT_indigo_seam:'dark',MB_MAT_subtle_indigo_weave:'light',MB_MAT_canvas_subtle_embroidery:'main'},
    palettes:[
      p('軍令靛藍','#344D73','#7084A2','#24344C','靛藍軍帳呼應軍令、名冊與秩序，金色虎首更清楚。'),
      p('戎裝赭紅','#8C4F44','#B88368','#56342F','赭紅帆布帶出招募與軍營的動員氣氛，避免與亮紅柱混色。'),
      p('行軍苔綠','#637458','#9CA789','#3C4D36','苔綠軍帳回應野營裝備，與石製設施形成材質和色相區分。'),
    ],
  },
  {
    key:'relic', name:'山河社稷圖', purpose:'圖卷・獨立試煉', treatment:'畫卷下方的玉瓦屋面；畫卷、卷軸、山石、光效及地面維持原色。',
    materials:{'MAT-relic-jade':'main','MAT-relic-jade-mid':'main','MAT-relic-jade-light':'light','MAT-relic-jade-dark':'dark'},
    minHeight:0.45, maxHeight:0.65, minUpNormal:0.12,
    palettes:[
      p('山河碧玉','#397960','#8CB49C','#254A3D','碧玉深淺瓦面延續山河意象，畫卷保持原有山水色彩。'),
      p('昆侖雪玉','#A7BDB3','#D8DED0','#5D7D70','雪玉淺頂讓上方山水畫卷更突出，帶出仙山入口的清透感。'),
      p('玄青雲闕','#405D7B','#93A7B8','#293D54','玄青屋瓦像山水畫中的遠山，與玉綠卷軸形成兩層辨識色。'),
    ],
  },
  {
    key:'vein', name:'礦脈', purpose:'靈礦・資源', treatment:'保留原色。', materials:{},
    noRoof:'以礦坑、岩層、晶簇和木支架構成，沒有獨立屋頂；保留礦石與晶體原色，避免屋頂改色擴及資源本體。', palettes:[],
  },
];
