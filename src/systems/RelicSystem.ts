import type { GameState, Lord } from '../game/types';
import { addExp, maxHp } from './GeneralSystem';
/** A hollow 5×5 square: clockwise outer ring, never enters the empty 3×3 center. */
export const RELIC_CELLS:readonly (readonly[number,number])[]=[
  [2,4],[1,4],[0,4],[0,3],[0,2],[0,1],[0,0],[1,0],
  [2,0],[3,0],[4,0],[4,1],[4,2],[4,3],[4,4],[3,4],
];
export const RELIC_EVENTS=[
  {name:'歸元門',icon:'☯',good:'歸元靈禮',bad:'門靈索費',kind:'stones',chance:.7},
  {name:'聚寶泉',icon:'💎',good:'泉湧靈石',bad:'假泉吞金',kind:'stones',chance:.6},
  {name:'古戰碑',icon:'⚔',good:'兵魂歸隊',bad:'兵魂散去',kind:'soldiers',chance:.5},
  {name:'百草澗',icon:'🌿',good:'靈草療傷',bad:'毒霧侵身',kind:'health',chance:.65},
  {name:'問道臺',icon:'📖',good:'心有所悟',bad:'雜念耗神',kind:'exp',chance:.6},
  {name:'劫雷石',icon:'ϟ',good:'雷淬筋骨',bad:'驚雷灼傷',kind:'health',chance:.4},
  {name:'藏珍窟',icon:'◇',good:'拾得古藏',bad:'落入幻財',kind:'stones',chance:.5},
  {name:'兵家陣',icon:'⚑',good:'援軍應召',bad:'陣中失散',kind:'soldiers',chance:.55},
  {name:'天機眼',icon:'✧',good:'洞悉玄機',bad:'天機反噬',kind:'exp',chance:.5},
  {name:'玉露池',icon:'💧',good:'玉露回春',bad:'寒氣入體',kind:'health',chance:.6},
  {name:'流金沙',icon:'⌛',good:'砂中淘金',bad:'流沙埋財',kind:'stones',chance:.45},
  {name:'幻兵谷',icon:'♜',good:'幻兵相助',bad:'疑陣折兵',kind:'soldiers',chance:.45},
  {name:'清心亭',icon:'♧',good:'心境澄明',bad:'心魔低語',kind:'exp',chance:.65},
  {name:'陰陽井',icon:'◒',good:'生息回流',bad:'陰氣侵襲',kind:'health',chance:.5},
  {name:'星落坪',icon:'★',good:'星砂化金',bad:'隕石毀財',kind:'stones',chance:.55},
  {name:'山河印',icon:'▧',good:'山河賜福',bad:'承印耗神',kind:'exp',chance:.65},
] as const;
export interface RelicJourney {entryTile:number;steps:number;lastResult:string;}
export const relicItemAllowed=(lord:Pick<Lord,'relicJourney'>)=>!lord.relicJourney;
export function enterRelic(lord:Lord){if(lord.relicJourney)return false;lord.relicJourney={entryTile:lord.position,steps:0,lastResult:'已入山河圖，走滿16格才可離開。圖內禁止使用道具。'};lord.lastTile=null;lord.forkExit=null;return true;}
/** Caller supplies authoritative RNG. Effects never kill, delete gear, or create negative resources. */
export function advanceRelic(state:GameState,lord:Lord,random=Math.random){
  const journey=lord.relicJourney;if(!journey||journey.steps>=16)throw Error('尚未進入山河圖或已完成');
  journey.steps++;const event=RELIC_EVENTS[journey.steps%16],good=random()<event.chance;
  const magnitude=.5+random()*.5;
  const team=Object.values(state.generals).filter(g=>g.owner===lord.id&&(g.isLord||g.status==='free'));
  let detail='';
  switch(event.kind){
    case 'stones':{const n=good?Math.round(200+400*magnitude):Math.min(lord.stones,Math.max(20,Math.round(lord.stones*.03*magnitude)));lord.stones+=good?n:-n;detail=`靈石 ${good?'+':'−'}${n} 下品`;break;}
    case 'soldiers':{const n=good?Math.round(100+250*magnitude):Math.min(lord.soldiers,Math.round(lord.soldiers*.025*magnitude));lord.soldiers+=good?n:-n;detail=`士兵 ${good?'+':'−'}${n}`;break;}
    case 'health':{for(const g of team){if(good)g.hp=Math.min(maxHp(g),g.hp+Math.round(maxHp(g)*.08*magnitude));else g.hp=Math.max(1,g.hp-Math.ceil(g.hp*.08*magnitude));}detail=good?'隨行隊伍恢復氣血':'隨行隊伍損失少量當前氣血，最低保留1';break;}
    case 'exp':{const n=Math.round(30+70*magnitude);let total=0;for(const g of team){const before=g.exp;if(good)addExp(g,n);else g.exp=Math.max(0,g.exp-n);total+=Math.abs(g.exp-before);}detail=`隨行修為共 ${good?'+':'−'}${total}`;break;}
  }
  journey.lastResult=`${event.icon} ${event.name}：${good?event.good:event.bad}，${detail}。`;
  return{step:journey.steps,text:journey.lastResult,good,complete:journey.steps===16};
}
export function leaveRelic(lord:Lord){
  const journey=lord.relicJourney;if(!journey||journey.steps<16)return false;
  lord.position=journey.entryTile;lord.lastTile=null;lord.forkExit=null;lord.forcedTile=null;lord.stayThisTurn=false;
  delete lord.relicJourney;return true;
}
