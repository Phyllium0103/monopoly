/** Painted-paper dice floating and turning independently, active only under the pointer. */
export class CommandDice {
  private canvas=document.createElement('canvas');
  private context:CanvasRenderingContext2D|null;
  private atlas=new Image();
  private loaded=false;
  private frame=0;
  private started=0;
  private request=0;
  private hovering=false;
  private readonly count=64;
  private readonly duration=3200;
  constructor(private button:HTMLButtonElement){
    const host=button.querySelector<HTMLElement>('.roll-dice')!;
    this.canvas.width=384;this.canvas.height=256;this.canvas.className='command-dice-motion';
    this.canvas.setAttribute('aria-hidden','true');this.canvas.hidden=true;host.append(this.canvas);
    this.context=this.canvas.getContext('2d');
    const ready=()=>{
      this.loaded=true;if(!this.context)return;
      this.canvas.hidden=false;host.classList.add('has-motion');this.paint(0);
      this.button.dataset.diceReady='true';
      if(this.hovering)this.play();
    };
    this.atlas.onload=ready;this.atlas.src=new URL('./command-dice-hover.webp',import.meta.url).href;
    this.button.dataset.diceRenderer='painted-hover-rotation';
    button.addEventListener('pointerenter',()=>{this.hovering=true;this.play();});
    button.addEventListener('pointerleave',()=>{this.hovering=false;this.stop();});
    button.addEventListener('pointercancel',()=>{this.hovering=false;this.stop();});
    button.addEventListener('click',()=>{this.hovering=false;this.stop();});
    new MutationObserver(()=>{if(button.classList.contains('hidden'))this.stop();}).observe(button,{attributes:true,attributeFilter:['class']});
  }
  private paint(frame:number,particles=0){
    if(!this.context)return;
    const ctx=this.context;ctx.clearRect(0,0,384,256);
    ctx.drawImage(this.atlas,frame%8*384,Math.floor(frame/8)*256,384,256,0,0,384,256);
    if(particles){
      ctx.save();ctx.fillStyle='#d9ae63';
      for(let i=0;i<22;i++){
        const angle=i*2.39996+frame/this.count*Math.PI*2,side=i%2;
        const x=(side?276:108)+Math.cos(angle)*(61+i%3*4)*1.08,y=(side?114:137)+Math.sin(angle)*72*1.08;
        ctx.globalAlpha=particles*(.1+.18*(.5+.5*Math.sin(i+frame*.15)));ctx.fillRect(x,y,i%3===0?1.5:1,i%3===0?1.5:1);
      }
      ctx.restore();
    }
    this.frame=frame;this.button.dataset.diceFrame=String(frame);
  }
  private play(){
    if(!this.hovering||!this.loaded||!this.context||this.request||this.button.disabled||this.button.classList.contains('hidden')||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    this.started=performance.now();this.button.dataset.diceMotion='playing';
    this.request=requestAnimationFrame(this.tick);
  }
  private tick=(now:number)=>{
    if(!this.hovering||this.button.disabled||document.hidden){this.stop();return;}
    const elapsed=now-this.started,progress=elapsed%this.duration/this.duration,frame=Math.floor(progress*this.count);
    if(frame!==this.frame)this.paint(frame,Math.min(1,elapsed/400));
    this.button.dataset.dicePhase='floating';this.request=requestAnimationFrame(this.tick);
  };
  private stop(){
    cancelAnimationFrame(this.request);this.request=0;
    if(this.loaded&&this.context)this.paint(0);
    this.button.dataset.diceMotion='settled';this.button.dataset.dicePhase='settle';
  }
}
