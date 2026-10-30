const port=self as unknown as {onmessage:((event:MessageEvent<{id:number;payload:unknown}>)=>void)|null;postMessage:(value:unknown)=>void};
port.onmessage=event=>{const {id,payload}=event.data;
 try{port.postMessage({id,value:JSON.stringify(payload,(key,value)=>key==='tiles'?undefined:value)});}catch(error){port.postMessage({id,error:error instanceof Error?error.message:String(error)});}
};
