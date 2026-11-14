import type { GameState, General, Lord, Stats } from '../game/types';
import { DISPLAY_FACILITY_LOTS } from '../data/displayFacilities';
import { maxHp } from './GeneralSystem';

export type AcademyKind = 'martial' | 'arts';
export interface TrainingGain { stat: keyof Stats; min: number; max: number; }
export interface TrainingCourse { id: string; name: string; price: number; gains: TrainingGain[]; }
export interface TrainingResult { id: number; generalId: string; course: string; gains: { stat: keyof Stats; value: number }[]; }
export interface TrainingVisit { kind: AcademyKind; usedCourses: string[]; trained: string[]; results: TrainingResult[]; }
export interface TrainingAssignment { courseId:string; generalId:string; }
export const ACADEMY_NAMES = { martial: '淬體武院', arts: '四藝道院' } as const;
export const TRAINING_STAT_NAMES: Record<keyof Stats,string> = { force:'武力',defense:'防禦',hp:'最大血量',alchemy:'煉丹',forging:'煉器',talisman:'畫符',formation:'佈陣' };
const gain = (stat: keyof Stats,min:number,max:number):TrainingGain => ({stat,min,max});
export const TRAINING_COURSES: Record<AcademyKind,TrainingCourse[]> = {
 martial:[
  {id:'spear',name:'破陣槍式',price:2500,gains:[gain('force',2,5)]},
  {id:'stance',name:'金剛站樁',price:2500,gains:[gain('defense',2,5)]},
  {id:'bath',name:'藥浴淬體',price:2500,gains:[gain('hp',20,50)]},
  {id:'dragon',name:'龍象合練',price:6000,gains:[gain('force',3,7),gain('defense',3,7)]},
  {id:'marrow',name:'易筋洗髓',price:7000,gains:[gain('hp',40,80),gain('force',1,3),gain('defense',1,3)]},
 ],
 arts:[
  {id:'pill',name:'丹火精研',price:3000,gains:[gain('alchemy',3,7)]},
  {id:'metal',name:'百鍊識金',price:3000,gains:[gain('forging',3,7)]},
  {id:'ink',name:'靈紋入筆',price:3000,gains:[gain('talisman',3,7)]},
  {id:'array',name:'星圖推演',price:3000,gains:[gain('formation',3,7)]},
  {id:'all',name:'四藝通玄',price:8000,gains:[gain('alchemy',2,4),gain('forging',2,4),gain('talisman',2,4),gain('formation',2,4)]},
 ],
};
export const academyAt = (tile:number):AcademyKind|null => {
 const lot=DISPLAY_FACILITY_LOTS.find(l=>(l.type==='martial'||l.type==='arts')&&l.frontageTiles.includes(tile));
 return lot ? lot.type as AcademyKind : null;
};
export const trainingEligible = (g:General,lord:Lord) => g.owner===lord.id && ['free','garrison','sect'].includes(g.status) && !g.ghostSourceId && !g.mortalTrial;
export const trainingGenerals = (state:GameState,lord:Lord) => Object.values(state.generals).filter(g=>trainingEligible(g,lord));
export const beginTraining = (kind:AcademyKind):TrainingVisit => ({kind,usedCourses:[],trained:[],results:[]});
/** The engine alone draws results; validate everything before charging or mutating. */
function train(state:GameState,lord:Lord,visit:TrainingVisit,courseId:string,generalId:string,random= Math.random):{ok:boolean;message:string} {
 const course=TRAINING_COURSES[visit.kind].find(c=>c.id===courseId),g=state.generals[generalId];
 if(!course||!g||!trainingEligible(g,lord))return{ok:false,message:'此武將目前無法修練。'};
 if(visit.usedCourses.includes(courseId))return{ok:false,message:'本項修練已分配。'};
 if(visit.trained.includes(generalId))return{ok:false,message:'每名武將本次只能修練一項。'};
 if(lord.stones<course.price)return{ok:false,message:'靈石不足。'};
 const values=course.gains.map(x=>({stat:x.stat,value:x.min+Math.floor(Math.max(0,Math.min(1-Number.EPSILON,random()))*(x.max-x.min+1))}));
 const oldMax=maxHp(g);
 lord.stones-=course.price;
 for(const x of values)g.base[x.stat]+=x.value;
 // Raising maximum health also grants the newly gained health, preserving existing injury.
 g.hp=Math.min(maxHp(g),g.hp+maxHp(g)-oldMax);
 visit.usedCourses.push(courseId);visit.trained.push(generalId);
 visit.results.push({id:visit.usedCourses.length,generalId,course:course.name,gains:values});
 return{ok:true,message:`${g.name}完成${course.name}，基礎${values.map(x=>TRAINING_STAT_NAMES[x.stat]+'＋'+x.value).join('、')}。`};
}

/** Validate the complete allocation before any charge, random draw or stat change. */
export function trainBatch(state:GameState,lord:Lord,visit:TrainingVisit,assignments:TrainingAssignment[],random=Math.random):{ok:boolean;message:string} {
 if(!Array.isArray(assignments)||!assignments.length||assignments.length>5||visit.results.length)return{ok:false,message:'請分配一至五個修練項目，每次造訪只能結算一次。'};
 const courses=new Set<string>(),generals=new Set<string>();let total=0;
 for(const a of assignments){
  if(!a||typeof a.courseId!=='string'||typeof a.generalId!=='string')return{ok:false,message:'修練分配無效。'};
  const c=TRAINING_COURSES[visit.kind].find(c=>c.id===a.courseId),g=state.generals[a.generalId];
  if(!c||!g||!trainingEligible(g,lord)||courses.has(c.id)||generals.has(g.id))return{ok:false,message:'每項修練限一人，每位武將最多一項，且須為可修練的己方武將。'};
  courses.add(c.id);generals.add(g.id);total+=c.price;
 }
 if(lord.stones<total)return{ok:false,message:'靈石不足，尚未扣款。'};
 const messages=assignments.map(a=>train(state,lord,visit,a.courseId,a.generalId,random).message);
 return{ok:true,message:messages.join('\n')};
}
