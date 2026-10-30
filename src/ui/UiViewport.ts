import './proportional-ui.css';

export function proportionalViewport(width:number,height:number){
  const scale=Math.min(Math.max(1,width)/1280,Math.max(1,height)/720);
  return {scale,width:width/scale,height:height/scale};
}
export function uiViewportSize(){
  return proportionalViewport(typeof innerWidth==='number'?innerWidth:1280,typeof innerHeight==='number'?innerHeight:720);
}
const installed=new WeakSet<HTMLElement>();
/** All panels share one logical coordinate space; map rendering stays physical. */
export function installUiViewport(root:HTMLElement){
  if(installed.has(root))return;installed.add(root);root.classList.add('proportional-ui');
  const update=()=>{
    const {scale,width,height}=uiViewportSize();
    root.style.setProperty('--ui-scale',String(scale));
    root.style.setProperty('--ui-width',width+'px');root.style.setProperty('--ui-height',height+'px');
    root.style.setProperty('--ui-vw',width/100+'px');root.style.setProperty('--ui-vh',height/100+'px');
    root.dataset.uiScale=String(scale);root.dataset.uiLogicalSize=JSON.stringify([width,height]);
  };
  update();addEventListener('resize',update,{passive:true});
}
