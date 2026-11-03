import './proportional-ui.css';

/** 介面的邏輯設計尺寸：所有面板以此排版再整體縮放。原本 1280×720 在常見螢幕上放太大，改為 1600×900（約縮小為 80%） */
export const UI_DESIGN_WIDTH=1600;
export const UI_DESIGN_HEIGHT=900;
/** 小視窗的保底：比舊尺寸（1280×720）最多只縮到 90%，字才不會小到看不清 */
const LEGACY_WIDTH=1280,LEGACY_HEIGHT=720,SMALL_SCREEN_FLOOR=.9;
export function proportionalViewport(width:number,height:number){
  const w=Math.max(1,width),h=Math.max(1,height);
  const fit=Math.min(w/UI_DESIGN_WIDTH,h/UI_DESIGN_HEIGHT);
  const floor=Math.min(1,Math.min(w/LEGACY_WIDTH,h/LEGACY_HEIGHT)*SMALL_SCREEN_FLOOR);
  const scale=Math.max(fit,floor);
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
