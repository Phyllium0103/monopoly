/** Remove thin red contamination at the outer contour; keep solid artwork and gold. */
export function cleanCommandHudMatte(pixels:Uint8ClampedArray,width:number,height:number){
  const inside=new Uint8Array(width*height),core=new Uint8Array(width*height);
  for(let p=0;p<inside.length;p++)inside[p]=pixels[p*4+3]>=235?1:0;
  for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
    const p=y*width+x;
    core[p]=inside[p-width-1]&inside[p-width]&inside[p-width+1]&inside[p-1]&inside[p]&inside[p+1]&inside[p+width-1]&inside[p+width]&inside[p+width+1];
  }
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=(y*width+x)*4;
    if(pixels[i]<=pixels[i+1]*1.5||pixels[i]<=pixels[i+2]*1.5)continue;
    if(!core[y*width+x]){pixels[i+3]=0;continue;}
    let coverage=0;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      const px=x+dx,py=y+dy;
      // The canvas sides are crop boundaries, not necessarily outer contours.
      coverage+=core[Math.max(0,Math.min(height-1,py))*width+Math.max(0,Math.min(width-1,px))];
    }
    pixels[i+3]=Math.min(pixels[i+3],Math.round(coverage/9*255));
  }
}
