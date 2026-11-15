const assert=require('node:assert/strict'),fs=require('node:fs'),{stripTypeScriptTypes}=require('node:module');
(async()=>{
 const source=stripTypeScriptTypes(fs.readFileSync('src/ui/commandHudMatte.ts','utf8'));
 const {cleanCommandHudMatte}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const width=24,height=20,data=new Uint8ClampedArray(width*height*4);
 const put=(x,y,color)=>data.set(color,(y*width+x)*4);
 for(let y=5;y<17;y++)for(let x=4;x<20;x++)put(x,y,[170,35,25,250]);
 for(let x=4;x<20;x++)put(x,4,[250,25,15,150]);
 put(8,1,[255,20,10,254]);put(2,2,[190,145,60,250]);
 cleanCommandHudMatte(data,width,height);
 assert.equal(data[(1*width+8)*4+3],0,'isolated opaque red speck is removed');
 assert.equal(data[(4*width+10)*4+3],0,'translucent contour halo is removed');
 assert.equal(data[(10*width+10)*4+3],250,'solid red lacquer remains intact');
 assert.deepEqual([...data.slice((2*width+2)*4,(2*width+2)*4+4)],[190,145,60,250],'fine gold details keep their exact RGBA');
 console.log('PASS contour matte removes red fringe and isolated specks, preserving lacquer interior and gold');
})().catch(error=>{console.error(error);process.exitCode=1;});
