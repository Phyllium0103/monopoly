import {WorkerRequest} from '../performance/WorkerRequest';
import {advance,type GameRecord,type StepResult} from '../engine/server';
const rpc=new WorkerRequest(()=>new Worker(new URL('../engine/host.worker.ts',import.meta.url),{type:'module'}));
export async function advanceRoom(record:GameRecord):Promise<StepResult>{
  if(rpc.supported){try{return await rpc.run<StepResult>(record);}catch(error){console.warn('Host worker unavailable; replaying locally.',error);}}
  return advance(record);
}
