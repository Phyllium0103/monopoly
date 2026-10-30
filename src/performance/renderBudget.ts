/** Keep high-DPI 3D surfaces within a pixel budget; DOM text keeps native resolution. */
export function renderPixelRatio(width:number,height:number,maxPixels=2_500_000):number{
 const device=typeof devicePixelRatio==='number'?devicePixelRatio:1;
 return Math.min(device,1.5,Math.sqrt(maxPixels/Math.max(1,width*height)));
}
