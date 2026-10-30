import {prepareDicePhysics,simulateDiceRoll,type DiceLaunch} from './DicePhysics';
import {packDiceRoll} from './DiceWorkerData';
interface Request {id:number;payload:{type:'prepare'}|{type:'roll';values:number[];seed:number;launch?:DiceLaunch}}
const port=self as unknown as {onmessage:((event:MessageEvent<Request>)=>void)|null;postMessage:(value:unknown,transfer?:Transferable[])=>void};
let queue=Promise.resolve();
port.onmessage=event=>{const {id,payload}=event.data;queue=queue.then(async()=>{
  try{
    if(payload.type==='prepare'){await prepareDicePhysics();port.postMessage({id,value:true});return;}
    let seed=payload.seed;
    const roll=await simulateDiceRoll(payload.values,()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/0x100000000),payload.launch);
    const data=packDiceRoll(roll);port.postMessage({id,value:data},[data.poses.buffer]);
  }catch(error){port.postMessage({id,error:error instanceof Error?error.message:String(error)});}
});};
