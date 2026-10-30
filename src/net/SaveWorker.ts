import {WorkerRequest} from '../performance/WorkerRequest';
const rpc=new WorkerRequest(()=>new Worker(new URL('./save.worker.ts',import.meta.url),{type:'module'}));
export async function serializeHostSave(value:unknown):Promise<string>{
 if(rpc.supported){try{return await rpc.run<string>(value);}catch(error){console.warn('Save worker unavailable.',error);}}
 return JSON.stringify(value,(key,v)=>key==='tiles'?undefined:v);
}
