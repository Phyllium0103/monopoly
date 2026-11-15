/** 1920x1080 reference: both expanded sections share width changes; dice stays fixed. */
export function commandHudLayout(viewportWidth:number, viewportHeight:number, rulerCount:number) {
  const width=Math.max(1,viewportWidth),height=Math.max(1,viewportHeight*.3),scale=height/403,inset=0;
  const artHeight=height;
  const sharedChange=(width-2388*scale)/2;
  const rightWidth=287*scale,leftWidth=Math.max(1,1066*scale+sharedChange);
  const middleWidth=Math.max(1,width-leftWidth-rightWidth);
  const infoLeft=leftWidth*75/1066,infoWidth=leftWidth*971/1066;
  const rulerWidth=infoWidth/Math.max(1,rulerCount);
  const columnWidths=rulerCount===4?[250,232,234,255].map(p=>leftWidth*p/1066):Array.from({length:rulerCount},()=>rulerWidth);
 const spriteWidth=height*878/(403*4)*1.08;
  const seatOffset=height*.775,actorHeight=seatOffset+spriteWidth;
  return {width,height,inset,artHeight,leftWidth,rightWidth,middleWidth,unit:height/300,infoLeft,infoWidth,rulerWidth,spriteWidth,columnWidths,seatOffset,actorHeight};
}
