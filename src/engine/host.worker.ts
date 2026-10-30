import {advance,type GameRecord} from './server';
const port=self as unknown as {onmessage:((event:MessageEvent<{id:number;payload:GameRecord}>)=>void)|null;postMessage:(value:unknown)=>void};
// Each seeded replay completes before another can replace Math.random.
let queue=Promise.resolve();
port.onmessage=event=>{const {id,payload}=event.data;queue=queue.then(async()=>{
  try{port.postMessage({id,value:await advance(payload)});}catch(error){port.postMessage({id,error:error instanceof Error?error.message:String(error)});}
});};
