/** A local worker is lazy, time-bounded and cannot strand a gameplay promise. */
export class WorkerRequest {
  private worker: Worker | null = null;
  private sequence = 0;
  private failed = false;
  private pending = new Map<number, {resolve:(value:unknown)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
  constructor(private create:()=>Worker) {}
  get supported() { return typeof Worker !== 'undefined' && !this.failed; }
  run<T>(payload:unknown, timeout=30_000):Promise<T> {
    if(!this.supported) return Promise.reject(new Error('Local worker unavailable'));
    if(!this.worker) {
      try{this.worker=this.create();}
      catch(error){const failure=error instanceof Error?error:new Error(String(error));this.stop(failure);return Promise.reject(failure);}
      this.worker.onmessage=(event:MessageEvent<{id:number;value?:unknown;error?:string}>)=>{
        const p=this.pending.get(event.data.id);if(!p)return;
        clearTimeout(p.timer);this.pending.delete(event.data.id);
        if(event.data.error)p.reject(new Error(event.data.error));else p.resolve(event.data.value);
      };
      this.worker.onerror=()=>this.stop(new Error('Local worker failed'));
      this.worker.onmessageerror=()=>this.stop(new Error('Invalid local worker response'));
    }
    const id=++this.sequence;
    return new Promise<T>((resolve,reject)=>{
      const timer=setTimeout(()=>this.stop(new Error('Local worker timed out')),timeout);
      this.pending.set(id,{resolve:value=>resolve(value as T),reject,timer});
      try{this.worker!.postMessage({id,payload});}catch(error){this.stop(error instanceof Error?error:new Error(String(error)));}
    });
  }
  private stop(error:Error){
    this.failed=true;this.worker?.terminate();this.worker=null;
    for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(error);}this.pending.clear();
  }
}
