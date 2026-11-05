import { ITEM_DEFS } from './items';

const SHORT_NAMES: Record<string,string> = {
  poison:'斷腸丹',rootup1:'洗髓丹',rootup2:'伐骨丹',five:'轉生丹',citadel:'護城陣',
  fiveward:'五行陣',seven:'續命陣',invert:'陰陽陣',graft:'移花陣',ghost:'搬運符',
  demon:'入魔符',soldiers:'成兵符',move:'搬財符',rootdown:'絕根符',totem:'不死圖',
  cushion:'悟道墊',prison:'牢獄符',realmkey:'秘境鑰',realmescape:'遁空符',
};
/** Full names remain in the item tooltip; the aligned caption row uses three characters. */
export const shortItemName = (id:string) => SHORT_NAMES[id] ?? Array.from(ITEM_DEFS[id].name).slice(0,3).join('');
