import type { Aptitude, City, Element, GameState, General, Item, Lord } from '../game/types';
import { BLOOD_LIFESTEAL, BONE_HP, BOW_DAMAGE, BOWL_GAIN, BREAK_BOOST, CHARGE_ENERGY, ESSENCE_EXP, HEAL, ITEM_DEFS, MEND_HEAL, MIST_ATK, POISON, POISON_PREROLL, QI_EXP, RAGE_ATK, REVIVE_HP, REVIVE_REALM_LOSS, RING_TURNS, SACRIFICE_LOSS, SHIELD_RATIO, SOLDIER_CALL, STAMINA_UP, STAT_NAMES, STAT_UP, VEIN_PROSPERITY, itemName, makeItem, rollItemId, rollItemTier, type ItemDef } from '../data/items';
import { freeGenerals, killGeneral, nextUid, reviveGeneral } from '../game/GameState';
import { addExp, craft, expCap, maxHp, maxStamina } from './GeneralSystem';
import type { Duel, DuelEvent, Side } from './BattleSystem';
import { fmtStones } from '../game/Currency';
import { LORDS } from '../faction/Faction';
import { fx } from '../data/passives';
import { APTITUDE_NAMES } from '../data/generals';
import { eliminate } from './CitySystem';

export const def = (item: Item): ItemDef => ITEM_DEFS[item.defId];
export const nameOf = (item: Item): string => itemName(item.defId, item.tier);
export const ITEM_USE_EXP = 3;
export function requirement(item: Item, user?: General) {
 const d=def(item),i=Math.min(item.tier,d.min.length-1);
 return {stat:d.stat,min:d.min[i],stamina:d.noUser?0:Math.max(0,Math.round(d.stamina[i]*(1-(user?(fx(user).itemStamina??0):0))))};
}
export function requirementText(item: Item): string {const r=requirement(item);return def(item).noUser?'事件觸發，直接使用':STAT_NAMES[r.stat]+' ≥ '+r.min+'・體力 '+r.stamina;}
export function canUse(item: Item,user: General): {ok:boolean;reason:string} {
 if(user.status==='dead')return {ok:false,reason:'武將已死亡'};
 if(def(item).noUser)return {ok:true,reason:''};
 const r=requirement(item,user);
 if(craft(user,r.stat)<r.min)return {ok:false,reason:STAT_NAMES[r.stat]+'不足（需 '+r.min+'）'};
 if(user.stamina<r.stamina)return {ok:false,reason:'體力不足（需 '+r.stamina+'）'};
 return {ok:true,reason:''};
}
export function usableIn(item: Item,context:'preroll'|'battle'): boolean {const t=def(item).timing;return t==='both'||t===context;}
export function consumeItem(lord:Lord,item:Item,user?:General):number {
 if(lord.itemsLocked>0||!lord.items.some(i=>i.uid===item.uid))throw Error('物品不可使用');
 if(!def(item).noUser&&(!user||!canUse(item,user).ok))throw Error('使用者能力或體力不足');
 const cost=user?requirement(item,user).stamina:0;
 if(user)user.stamina-=cost;
 const keep=user ? ({'丹藥':fx(user).keepPill,'法器':fx(user).keepArtifact,'符籙':fx(user).keepTalisman,'陣法':fx(user).keepFormation}[def(item).category]??0) : 0;
 if (!(keep>0 && Math.random()<keep)) lord.items=lord.items.filter(i=>i.uid!==item.uid);
 return user?addExp(user,cost*ITEM_USE_EXP):0;
}
/** Only the effect tier changes; original requirements, stamina and owned item remain unchanged. */
function enhancedItem(item:Item,user:General):Item {
 const chance=def(item).category==='陣法' ? fx(user).upgradeFormation??0 : def(item).category==='符籙' ? fx(user).upgradeTalisman??0 : 0;
 return chance>0 && Math.random()<chance ? {...item,tier:Math.min(item.tier+1,def(item).price.length-1)} : item;
}
export function unloadTechnique(state:GameState,g:General):void {
 if(!g.technique)return;
 const owner=g.owner&&state.lords[g.owner];
 if(owner&&!owner.scrolls.some(t=>t.uid===g.technique!.uid))owner.scrolls.push(g.technique);
 g.technique=null;
}
export function changeAptitude(state:GameState,g:General,aptitude:Aptitude):void {
 g.aptitude=aptitude;
 if(g.technique&&aptitude!=='heaven'&&aptitude!==g.technique.element)unloadTechnique(state,g);
}
export interface PrerollTarget {general?:General;lord?:Lord;city?:City;ownCity?:City;tile?:number;dice?:number;element?:Element;damagedGeneral?:General;}
export async function usePreroll(state:GameState,lord:Lord,item:Item,user:General,target:PrerollTarget,blocked=false,onFatal?: (g:General)=>Promise<boolean>):Promise<string> {
 if(!usableIn(item,'preroll'))throw Error('此物品不可在擲骰前使用');
 if(item.defId==='five'&&(!target.general||['waste','heaven'].includes(target.general.aptitude)||!target.element))throw Error('五行轉生丹只能對五行靈根使用');
 delete target.damagedGeneral;
 const gain=consumeItem(lord,item,user);
 const effect=enhancedItem(item,user);
 const kept=lord.items.some(i=>i.uid===item.uid);
 let msg=blocked?user.name+'使用'+nameOf(item)+'，但被護法抵消。':applyPreroll(state,lord,effect,user,target);
 const victim=(target as PrerollTarget).damagedGeneral;
 if (!blocked && victim && victim.hp<=0) {
  let saved=false;
  if(onFatal) saved=await onFatal(victim);
  else {
   const owner=victim.owner&&state.lords[victim.owner],totem=owner?.items.find(i=>i.defId==='totem');
   if(owner?.alive&&!owner.itemsLocked&&totem){consumeItem(owner,totem);victim.hp=maxHp(victim);saved=true;}
   else {killGeneral(state,victim);if(victim.isLord&&owner)eliminate(state,owner);}
  }
  msg+=saved?'（不死圖騰生效，滿血復生）':'（'+victim.name+'死亡）';
 }
 return msg+(kept?'（被動生效：物品保留）':'')+(effect.tier>item.tier?'（被動生效：效果品階提升）':'')+(gain?'（'+user.name+'修為 +'+gain+'）':'');
}

function applyPreroll(state:GameState,lord:Lord,item:Item,user:General,target:PrerollTarget):string {
 const t=item.tier,g=target.general,head=user.name+'使用'+nameOf(item),elements=['metal','wood','water','fire','earth'] as const;
 switch(item.defId){
 case 'heal':{const h=Math.min(maxHp(g!)-g!.hp,Math.round(maxHp(g!)*HEAL[t]));g!.hp+=h;return head+'，'+g!.name+'回復 '+h+' 血量。';}
 case 'force':g!.base.force+=STAT_UP[t];return head+'，'+g!.name+'基礎武力 +'+STAT_UP[t]+'。';
 case 'guard':g!.base.defense+=STAT_UP[t];return head+'，'+g!.name+'基礎防禦 +'+STAT_UP[t]+'。';
 case 'qi':case 'essence':{const amount=item.defId==='qi'?QI_EXP[t]:(Number.isFinite(expCap(g!))?expCap(g!)*ESSENCE_EXP[t]:0);return head+'，'+g!.name+'修為 +'+addExp(g!,amount)+'（不超過境界上限）。';}
 case 'foundation':g!.foundation=true;return head+'，'+g!.name+'下次煉氣突破築基成功率 100%。';
 case 'vigor':g!.stamina=Math.min(maxStamina(g!),g!.stamina+STAMINA_UP[t]);return head+'，'+g!.name+'體力回復 '+STAMINA_UP[t]+'。';
 case 'poison':case 'bow':{const party=freeGenerals(state,target.lord!.id);if(!party.length)return head+'，對方沒有隨行武將。';const victim=party[Math.floor(Math.random()*party.length)];if(item.defId==='poison'&&fx(victim).poisonImmune)return head+'，'+victim.name+'百毒不侵。';const dmg=Math.max(0,Math.min(victim.hp,Math.round(maxHp(victim)*(item.defId==='poison'?POISON_PREROLL:BOW_DAMAGE)[t])));victim.hp-=dmg;target.damagedGeneral=victim;return head+'，'+victim.name+'受到 '+dmg+' 傷害。';}
 case 'clearmind':g!.demon=0;return head+'，'+g!.name+'心魔盡消。';
 case 'bone':g!.base.hp+=BONE_HP[t];return head+'，'+g!.name+'基礎血量 +'+BONE_HP[t]+'。';
 case 'breakpill':g!.breakBoost=Math.max(g!.breakBoost,BREAK_BOOST[t]);return head+'，'+g!.name+'下次雷劫傷害 -'+Math.round(g!.breakBoost*100)+'%。';
 case 'revive':{const oldExp=g!.exp;reviveGeneral(state,lord.id,g!,REVIVE_HP[t],REVIVE_REALM_LOSS[t]);if(t===3)g!.exp=oldExp;return head+'，'+g!.name+'復活，歸入你的麾下。';}
 case 'rootup1':case 'rootup2':if(g!.aptitude==='heaven')return head+'，'+g!.name+'已是天靈根。';changeAptitude(state,g!,item.defId==='rootup2'||g!.aptitude!=='waste'?'heaven':elements[Math.floor(Math.random()*5)]);return head+'，靈根提升為'+APTITUDE_NAMES[g!.aptitude]+'。';
 case 'reset':unloadTechnique(state,g!);return head+'，'+g!.name+'卸下功法，境界與修為保留。';
 case 'five':changeAptitude(state,g!,target.element!);return head+'，'+g!.name+'轉為'+APTITUDE_NAMES[g!.aptitude]+'，不符功法已退回原主公行囊。';
 case 'rootdown':changeAptitude(state,g!,'waste');return head+'，'+g!.name+'變為廢靈根，功法已退回原主公行囊。';
 case 'teleport':case 'cloud':return head+'，傳送至'+state.tiles[target.tile!].name+'！';
 case 'confuse':case 'confusing':target.lord!.forcedTile=target.tile!;return head+'，'+LORDS[target.lord!.id].name+'下回合擲骰時強制前往'+state.tiles[target.tile!].name+'。';
 case 'citadel':target.city!.shieldTurns=5;return head+'，'+target.city!.name+'守軍戰力 ×1.5（5 回合）。';
 case 'thunderward':case 'fiveward':g!.ward=Math.min(.8,g!.ward+(item.defId==='thunderward'?.5:.3));return head+'，'+g!.name+'下次雷劫減傷 '+Math.round(g!.ward*100)+'%。';
 case 'illusion':case 'demon':g!.demon=Math.max(g!.demon,2);return head+'，'+g!.name+'下次突破率 -60%，或雷劫威力 ×2。';
 case 'mend':{const party=freeGenerals(state,lord.id);for(const x of party)x.hp=Math.min(maxHp(x),x.hp+Math.round(maxHp(x)*MEND_HEAL[t]));return head+'，全體隨行武將回血 '+Math.round(MEND_HEAL[t]*100)+'%。';}
 case 'vein':target.city!.prosperity=Math.min(200,target.city!.prosperity+VEIN_PROSPERITY[t]);return head+'，'+target.city!.name+'繁榮度 +'+VEIN_PROSPERITY[t]+'。';
 case 'sacrifice':{const c=target.city!,loss=Math.round(c.garrisonSoldiers*SACRIFICE_LOSS[t]);c.garrisonSoldiers-=loss;return head+'，'+c.name+'守軍 -'+loss+'。';}
 case 'seven':g!.sevenLife=true;return head+'，'+g!.name+'下次渡劫若身死，滿血復生，修為減半。';
 case 'lock':case 'freeze':target.lord!.stunned=Math.max(1,target.lord!.stunned);target.lord!.itemsLocked=Math.max(1,target.lord!.itemsLocked);return head+'，'+LORDS[target.lord!.id].name+'下回合擲骰時原地停留並觸發所在格事件，該回合不能使用物品。';
 case 'graft':{const a=target.ownCity!,b=target.city!;[a.owner,b.owner]=[b.owner,a.owner];[a.garrisonGenerals,b.garrisonGenerals]=[b.garrisonGenerals,a.garrisonGenerals];[a.garrisonSoldiers,b.garrisonSoldiers]=[b.garrisonSoldiers,a.garrisonSoldiers];for(const c of [a,b])for(const id of c.garrisonGenerals)state.generals[id].cityId=c.id;return head+'，'+a.name+'與'+b.name+'交換所有權，駐將與士兵隨原主公轉移。';}
 case 'cushion':case 'prison':lord.stayThisTurn=true;return head+'，己方主公本回合擲骰時原地停留，並觸發所在格事件。';
 case 'dice':lord.fixedDice=target.dice!;return head+'，本回合骰子 '+target.dice+' 點。';
 case 'stride':lord.doubleDice=true;return head+'，本回合擲兩顆骰子。';
 case 'ghost':{const amount=Math.round(target.lord!.stones*.1);target.lord!.stones-=amount;lord.stones+=amount;return head+'，盜取'+fmtStones(amount)+'。';}
 case 'siegebreak':lord.siegeBoost=1.2;return head+'，本回合攻城戰力 ×1.2。';
 case 'soldiers':lord.soldiers+=SOLDIER_CALL[t];return head+'，化出 '+SOLDIER_CALL[t]+' 名士兵。';
 case 'transmission':return head+'，免費調遣'+target.city!.name+'，直到關閉。';
 case 'move':{const pool=target.lord!.items;if(!pool.length)return head+'，對方沒有可搬走的物品。';const taken=pool[Math.floor(Math.random()*pool.length)];target.lord!.items=pool.filter(i=>i.uid!==taken.uid);lord.items.push(taken);return head+'，搬走'+nameOf(taken)+'。';}
 case 'breath':lord.tollFreeTurns=Math.max(3,lord.tollFreeTurns);lord.tollFree=true;return head+'，本回合及接下來兩個己方回合免繳過路費。';
 case 'shuttle':lord.moveMultiplier=2;return head+'，本回合移動點數 ×2。';
 case 'bowl':{const amount=Math.round(lord.stones*BOWL_GAIN[t]);lord.stones+=amount;return head+'，獲得'+fmtStones(amount)+'。';}
 case 'bag':{const id=rollItemId();if(!id)return head+'，所有物品權重皆為0，未獲得物品。';const found=makeItem(nextUid(state,'i'),id,rollItemTier(id));lord.items.push(found);return head+'，獲得'+nameOf(found)+'。';}
 case 'wheel':lord.forkChoice=true;return head+'，下次遇岔路可選擇前進方向。';
 default:throw Error('尚未實作物品 '+item.defId);
 }
}
export function useInDuel(duel:Duel,side:Side,lord:Lord,item:Item,user:General):DuelEvent[]{
 if(duel.fighter(side).itemsSealed||!usableIn(item,'battle'))throw Error('此時不可使用物品');
 const gain=consumeItem(lord,item,user),effect=enhancedItem(item,user),me=duel.fighter(side),foe=duel.other(side),t=effect.tier,head=user.name+'使用'+nameOf(effect);let msg=head;
 if(lord.items.some(i=>i.uid===item.uid))msg+='（被動：物品保留）';
 if(effect.tier>item.tier)msg+='（被動：品階提升）';
 switch(item.defId){
 case 'heal':{const h=Math.min(me.maxHp-me.hp,Math.round(me.maxHp*HEAL[t]));me.hp+=h;msg+='，回血 '+h;break;}
 case 'poison':if(fx(foe.general).poisonImmune)msg+='，對方百毒不侵';else{foe.poison={dmg:POISON[t],turns:3};msg+='，敵將中毒三回合';}break;
 case 'rage':me.atk=Math.round(me.atk*(1+RAGE_ATK[t]));msg+='，武力提升至 '+me.atk;break;
 case 'mist':foe.atk=Math.round(foe.atk*(1-MIST_ATK[t]));msg+='，敵將武力降至 '+foe.atk;break;
 case 'invert':[me.atk,foe.atk]=[foe.atk,me.atk];[me.def,foe.def]=[foe.def,me.def];msg+='，雙方武力與防禦交換至戰鬥結束';break;
 case 'shield':case 'vajra':{const shield=Math.round(me.maxHp*(item.defId==='vajra'?.5:SHIELD_RATIO[t]));me.shield+=shield;msg+='，獲得 '+shield+' 護罩';break;}
 case 'charge':me.energy=Math.min(100,me.energy+CHARGE_ENERGY[t]);msg+='，能量補滿';break;
 case 'drain':foe.itemsSealed=true;msg+='，敵方本場戰鬥不能使用物品';break;
 case 'ring':if(fx(foe.general).freezeImmune)msg+='，敵將不受定身';else{foe.frozen=Math.max(foe.frozen,RING_TURNS[t]);msg+='，敵將無法攻擊 '+RING_TURNS[t]+' 回合';}break;
 case 'blood':me.itemLifesteal={rate:BLOOD_LIFESTEAL[t],turns:5};msg+='，接下來五回合傷害吸血 '+Math.round(BLOOD_LIFESTEAL[t]*100)+'%';break;
 default:throw Error('尚未實作戰鬥物品 '+item.defId);
 }
 return [{text:msg,kind:'item'},...(gain?[{text:user.name+'修為 +'+gain,kind:'info' as const}]:[])];
}
