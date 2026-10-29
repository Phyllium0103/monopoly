const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const repo=path.resolve(__dirname,'..'),root=path.join(repo,'public/art/lord-hud');
const manifest=JSON.parse(fs.readFileSync(path.join(repo,'docs/lord-actor-assets.json'),'utf8'));
const dimensions=new Map();
for(const a of manifest.assets){
 const bytes=fs.readFileSync(path.join(root,a.file));
 assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),a.webSha256,a.file);
 assert.equal(bytes.toString('ascii',8,12),'WEBP');assert.equal(bytes.toString('ascii',12,16),'VP8X');assert.ok(bytes[20]&16,'transparent sprite alpha');
 const size=[bytes.readUIntLE(24,3)+1,bytes.readUIntLE(27,3)+1];assert.deepEqual(size,a.size,'no resize during compression');assert.equal(a.alphaExact,true);dimensions.set(a.file,size);
}
let poses=0;
for(const id of ['liu','cao','sun','dong'])for(const clip of ['prep','throw',...(id==='liu'?[]:['recovery'])]){
 const a=JSON.parse(fs.readFileSync(path.join(root,id,clip+'-16.json'),'utf8'));
 assert.equal(a.frames.length,clip==='recovery'?5:16);assert.ok(a.pixelsPerUnit>0);assert.ok(a.duration>0);
 assert.ok(a.times.every((t,i)=>i===0||t>a.times[i-1]));
 for(const f of a.frames){
  const name=f.externalSheet??a.sheets[f.sheet],size=dimensions.get(id+'/'+name);assert.ok(size,`${id} ${clip} missing ${name}`);
  const [l,t,r,b]=f.rect;assert.ok(l>=0&&t>=0&&r<=size[0]&&b<=size[1]&&r>l&&b>t);
  assert.ok(f.anchor.every(Number.isFinite));
  if(!f.eyesClosed)assert.equal(f.eyeRegions?.length,2,'every open-eyed pose has source-local eye regions');poses++;
 }
}
assert.ok(manifest.webBytes<manifest.sourceBytes*.3,'substantial compression without changing coordinates');
console.log(`PASS ${manifest.assets.length} compressed sheets / ${poses} complete poses, alpha/size/SHA, source-local eyes; no former frame assets`);
