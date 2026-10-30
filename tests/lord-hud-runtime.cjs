const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {registerHooks,stripTypeScriptTypes}=require('node:module');
registerHooks({resolve(s,c,n){if(s.startsWith('.')&&!/\.[a-z]+$/i.test(s))return n(s+'.ts',c);return n(s,c)},load(u,c,n){if(u.endsWith('.css'))return{format:'module',shortCircuit:true,source:''};return u.endsWith('.ts')?{format:'module',shortCircuit:true,source:stripTypeScriptTypes(fs.readFileSync(new URL(u),'utf8'),{mode:'transform'})}:n(u,c)}});
const repo=path.resolve(__dirname,'..');
const {LORD_HUD_RUNTIME_BASE,lordHudAssetUrl}=require('../src/data/lordHudRuntime.ts');
const {prepareLordTextureJobs,LordActorHud}=require('../src/ui/LordActorHud.ts');
const {assetUrl}=require('../src/data/assetUrl.ts');
const root=path.join(repo,'public',LORD_HUD_RUNTIME_BASE),source=path.join(repo,'public/art/lord-hud');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
(async()=>{
 assert.equal(manifest.files,53);let bytes=0;
 for(const [file,hash] of Object.entries(manifest.sources))assert.equal(sha(fs.readFileSync(path.join(source,file))),hash,'original source preserved: '+file);
 for(const a of manifest.assets){
  const b=fs.readFileSync(path.join(root,a.file));assert.equal(sha(b),a.sha256);assert.equal(b.toString('ascii',8,12),'WEBP');
  assert.equal(b.toString('ascii',12,16),'VP8X');assert.ok(b[20]&16,'transparent alpha');let found=false;
  for(let i=12;i+8<b.length;){const tag=b.toString('ascii',i,i+4),length=b.readUInt32LE(i+4);if(tag==='VP8 '){
   assert.equal(b.subarray(i+11,i+14).toString('hex'),'9d012a');assert.deepEqual([b.readUInt16LE(i+14)&0x3fff,b.readUInt16LE(i+16)&0x3fff],[768,384]);assert.equal(a.alphaExact,true);assert.ok(Math.max(...a.rgbMeanAbsoluteError)<8);found=true;
  }i+=8+length+(length&1);}
  assert.ok(found,'high-quality pre-sized runtime WebP');bytes+=b.length;
 }
 assert.equal(bytes,manifest.bytes);assert.ok(bytes<manifest.sourceBytes,'smaller runtime download');
 let poses=0;
 for(const id of ['liu','cao','sun','dong'])for(const clip of ['prep','throw',...(id==='liu'?[]:['recovery'])]){
  const a=JSON.parse(fs.readFileSync(path.join(source,id,clip+'-16.json'),'utf8')),b=JSON.parse(fs.readFileSync(path.join(root,id,clip+'-16.json'),'utf8'));
  assert.equal(b.width,a.width);assert.equal(b.height,a.height);assert.equal(b.pixelsPerUnit,a.pixelsPerUnit);assert.equal(b.duration,a.duration);assert.deepEqual(b.times,a.times);assert.deepEqual(b.release,a.release);assert.equal(b.frames.length,a.frames.length);
  a.frames.forEach((old,i)=>{const actual=b.frames[i],{sheet:oldIndex,...before}=old,{sheet:newIndex,...after}=actual;assert.deepEqual(after,before,'all source-local anchors, bounds and expressions remain fixed');const file=actual.externalSheet??b.sheets[newIndex];assert.equal(file,old.externalSheet??a.sheets[oldIndex]);assert.ok(fs.existsSync(path.join(root,id,file)));poses++;});
 }
 assert.equal(lordHudAssetUrl('liu','prep-16.json'),assetUrl(LORD_HUD_RUNTIME_BASE+'/liu/prep-16.json'));
 for(const base of ['/', '/monopoly/'])assert.equal(assetUrl(LORD_HUD_RUNTIME_BASE+'/liu/prep-16.json',base),base+LORD_HUD_RUNTIME_BASE+'/liu/prep-16.json');
 console.log(`PASS ${manifest.files} pre-sized high-quality sprites, ${poses} unchanged poses, original SHA/alpha and deployment paths; ${manifest.sourceBytes} -> ${bytes} bytes`);
 const {Texture,TextureLoader}=require('three'),originalLoader=TextureLoader.prototype.loadAsync;
 try{
  const image={width:768,height:384},texture=new Texture(image),actor={id:'liu',textures:new Map(),pending:new Map()};let requests=0;
  TextureLoader.prototype.loadAsync=async url=>{requests++;assert.ok(url.includes(LORD_HUD_RUNTIME_BASE+'/liu/'));return texture;};
  const first=LordActorHud.prototype.texture.call({},actor,'test.webp'),second=LordActorHud.prototype.texture.call({},actor,'test.webp');assert.equal(first,second,'duplicate loads share one promise');
  const actual=await first;assert.equal(actual.image,image,'runtime image is used directly without resizing');assert.equal(actual.flipY,true);assert.equal(actual.generateMipmaps,false);assert.equal(requests,1);
  assert.equal(await LordActorHud.prototype.texture.call({},actor,'test.webp'),texture);assert.equal(requests,1);
  TextureLoader.prototype.loadAsync=async()=>new Texture({width:1774,height:887});
  await assert.rejects(LordActorHud.prototype.texture.call({},actor,'wrong.webp'),/dimensions/);assert.equal(actor.pending.size,0,'bad texture does not remain in pending cache');
 }finally{TextureLoader.prototype.loadAsync=originalLoader;}
 console.log('PASS direct pre-sized texture, normal orientation, deduplication and rejected oversized resource');
 const pending=[],started=[],completed=[];let active=0,peak=0;
 const run=prepareLordTextureJobs([0,1,2,3,4,5,6],async n=>{started.push(n);active++;peak=Math.max(peak,active);await new Promise(resolve=>pending.push(resolve));active--;completed.push(n);});
 for(let turn=0;turn<20&&completed.length<7;turn++){while(pending.length)pending.shift()();for(let i=0;i<6;i++)await Promise.resolve();}
 await run;assert.equal(peak,3);assert.deepEqual(started,[0,1,2,3,4,5,6]);assert.equal(new Set(completed).size,7);
 let failedStarts=0;
 await assert.rejects(prepareLordTextureJobs([0,1,2,3,4],async n=>{failedStarts++;if(n===0)throw new Error('image failed');await Promise.resolve();}),/image failed/);assert.ok(failedStarts<=3,'failure stops scheduling more images');
 await prepareLordTextureJobs([],async()=>assert.fail('empty workload'));
 console.log('PASS maximum three concurrent texture jobs, no duplicate/missing work, error propagation and empty loading');
})().catch(e=>{console.error(e);process.exitCode=1});
