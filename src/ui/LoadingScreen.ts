/** Real completed work drives progress. Errors remain visible with a retry. */
export class LoadingScreen{
 private el=document.querySelector<HTMLElement>('#boot-loading')!;private value=0;
 show(label='正在準備山河…'){this.value=0;this.el.hidden=false;this.set(0,label);}
 set(value:number,label:string){this.value=Math.max(this.value,Math.min(100,value));this.el.querySelector('progress')!.value=this.value;this.el.querySelector('.boot-percent')!.textContent=Math.floor(this.value)+'%';this.el.querySelector('.boot-message')!.textContent=label;}
 async finish(){this.set(100,'準備完成');await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));this.el.hidden=true;}
 fail(error:unknown,retry:()=>void){this.el.hidden=false;console.error('Opening resources failed',error);this.el.querySelector('.boot-message')!.textContent='部分資源無法載入，請檢查網路後重試。';const button=this.el.querySelector('button')!;button.hidden=false;button.onclick=()=>{button.hidden=true;retry();};}
}
export const loadingScreen=new LoadingScreen();
