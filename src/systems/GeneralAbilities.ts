import type { GameState, General, Lord } from '../game/types';
import { PARTY_LIMIT, freeGenerals, nextUid, reviveGeneral } from '../game/GameState';
import { fx } from '../data/passives';
import { ITEM_DEFS, itemName, makeItem, rollItemTier } from '../data/items';
import { maxHp } from './GeneralSystem';

/** Abilities share the same authoritative functions for human players and AI. */
export function abilityUsers(state: GameState, lord: Lord): General[] {
  return freeGenerals(state,lord.id).filter(g=>!g.ghostSourceId && (fx(g).produceCategory || fx(g).reviveAbility || fx(g).ghostAbility));
}
export function abilityReady(state: GameState, lord: Lord, g: General): {ok:boolean;reason:string} {
  if (g.owner!==lord.id || g.status!=='free' || g.ghostSourceId || !lord.alive) return {ok:false,reason:'必須存活並隨行'};
  const f=fx(g);
  if (f.produceCategory || f.reviveAbility) return g.stamina>=100 ? {ok:true,reason:''} : {ok:false,reason:'需要 100 體力'};
  if (f.ghostAbility) {
    if ((g.ghostReadyTurn??0)>(lord.personalTurn??0)) return {ok:false,reason:`冷卻剩餘 ${(g.ghostReadyTurn??0)-(lord.personalTurn??0)} 回合`};
    if (Object.values(state.generals).some(p=>p.owner===lord.id&&p.ghostSourceId)) return {ok:false,reason:'已有冤魂隨行'};
    if (freeGenerals(state,lord.id).length>=PARTY_LIMIT) return {ok:false,reason:'需空出一個隨行名額'};
    return {ok:true,reason:''};
  }
  return {ok:false,reason:'沒有可主動使用的神通'};
}
export function abilityTargets(state: GameState, lord: Lord, g: General): General[] {
  return Object.values(state.generals).filter(p=>p.status==='dead'&&!p.isLord&&!p.ghostSourceId&&(!fx(g).reviveAbility||p.lastOwner===lord.id));
}
export function useGeneralAbility(state: GameState, lord: Lord, g: General, target?: General): string {
  const ready=abilityReady(state,lord,g); if(!ready.ok) throw Error(ready.reason);
  const f=fx(g);
  if (f.produceCategory) {
    const pool=Object.keys(ITEM_DEFS).filter(id=>ITEM_DEFS[id].category===f.produceCategory);
    const id=pool[Math.floor(Math.random()*pool.length)];
    const item=makeItem(nextUid(state,'i'),id,rollItemTier(id,Math.min(.9,state.round/40)));
    g.stamina-=100; lord.items.push(item);
    return `${g.name}耗費 100 體力，獲得${itemName(item.defId,item.tier)}。`;
  }
  if (!target || !abilityTargets(state,lord,g).includes(target)) throw Error('目標不符合召喚或復活條件');
  if (f.reviveAbility) {
    g.stamina-=100; reviveGeneral(state,lord.id,target,1,1);
    return `${g.name}起死回生：${target.name}復活，血量全滿、境界降一級、修為歸零。`;
  }
  const ghost:General={...target,id:nextUid(state,'spirit'),name:`${target.name}冤魂`,ghostSourceId:target.id,ghostTurns:5,ghostReadyTurn:undefined,owner:lord.id,lastOwner:null,status:'free',cityId:null,secluded:false,isLord:false,base:{...target.base},weapon:null,armor:null,technique:null,sevenLife:false,ward:0,breakBoost:0};
  ghost.hp=maxHp(ghost);state.generals[ghost.id]=ghost;g.ghostReadyTurn=(lord.personalTurn??0)+5;
  return `${g.name}召喚${target.name}冤魂，保留境界與修為、血量全滿，隨行五回合。`;
}
export function tickGeneralAbilities(state: GameState,lord:Lord):string[] {
  lord.personalTurn=(lord.personalTurn??0)+1;
  const messages:string[]=[];
  for (const g of Object.values(state.generals)) {
    if (g.owner!==lord.id || !g.ghostSourceId) continue;
    g.ghostTurns=(g.ghostTurns??0)-1;
    if (g.ghostTurns<=0) {delete state.generals[g.id];messages.push(`${g.name}存在時間已到，離開隊伍。`);}
  }
  return messages;
}
