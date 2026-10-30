import {WorkerRequest} from '../performance/WorkerRequest';
import {prepareDicePhysics,simulateDiceRoll,type DiceLaunch,type PhysicalDiceRoll} from './DicePhysics';
import {unpackDiceRoll,type DiceWorkerData} from './DiceWorkerData';
const rpc=new WorkerRequest(()=>new Worker(new URL('./dice.worker.ts',import.meta.url),{type:'module'}));
export async function prepareDiceWorker():Promise<void>{
  if(rpc.supported){try{await rpc.run({type:'prepare'});return;}catch(error){console.warn('Dice worker unavailable; using cooperative fallback.',error);}}
  await prepareDicePhysics();
}
export async function simulateDiceInWorker(values:readonly number[],seed:number,launch?:DiceLaunch):Promise<PhysicalDiceRoll>{
  if(rpc.supported){try{return unpackDiceRoll(await rpc.run<DiceWorkerData>({type:'roll',values:[...values],seed,launch}));}catch(error){console.warn('Dice worker fallback.',error);}}
  return simulateDiceRoll(values,()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/0x100000000),launch);
}
