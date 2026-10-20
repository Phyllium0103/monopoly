/** Inverse projection: a 320×640 ground rectangle appears square at elevation30/azimuth45. */
export const FLOOR_SIZE=320;
export const FLOOR_DEPTH=640;
export const FLOOR_ROTATION=-Math.PI/4;
const SQRT2=Math.SQRT2;
export const projectGround=(x:number,z:number)=>({u:(x+z)/SQRT2,v:(x-z)/SQRT2*.5});
export const unprojectGround=(u:number,v:number)=>({x:(u+v*2)/SQRT2,z:(u-v*2)/SQRT2});
/** Clamp viewport extent, not just camera center. Oversized overview stays centered. */
export function clampMapTarget(x:number,z:number,width:number,height:number,targetHeight=0){
  const p=projectGround(x,z),hu=Math.max(0,(FLOOR_SIZE-width)/2),hv=Math.max(0,(FLOOR_SIZE-height)/2);
  const offset=targetHeight*Math.cos(Math.PI/6);
  return unprojectGround(Math.max(-hu,Math.min(hu,p.u)),Math.max(-hv,Math.min(hv,p.v+offset))-offset);
}
