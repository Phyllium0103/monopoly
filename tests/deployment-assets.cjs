const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const{registerHooks,stripTypeScriptTypes}=require('node:module');const{pathToFileURL,fileURLToPath}=require('node:url');
registerHooks({resolve(s,c,n){if(s.startsWith('.')&&!path.extname(s)&&c.parentURL){const p=path.resolve(path.dirname(fileURLToPath(c.parentURL)),s+'.ts');if(fs.existsSync(p))return n(pathToFileURL(p).href,c);}return n(s,c);},load(u,c,n){return u.endsWith('.ts')?{format:'module',shortCircuit:true,source:stripTypeScriptTypes(fs.readFileSync(fileURLToPath(u),'utf8'),{mode:'transform'})}:n(u,c);}});
const {assetUrl}=require('../src/data/assetUrl.ts');
const {maximumMapZoom,FLOOR_SIZE,forkDirection}=require('../src/data/mapView.ts');
for(const base of ['/','/monopoly/','./','/other-project']){
 const relative=assetUrl('/art/map-selected/city-3.glb',base);
 const u=new URL(relative,'https://example.test/monopoly/');
 assert.equal(u.pathname,base==='/'?'/art/map-selected/city-3.glb':base==='/other-project'?'/other-project/art/map-selected/city-3.glb':'/monopoly/art/map-selected/city-3.glb');
}
for(const [w,h]of[[320,180],[180,320],[1024,180],[90,180],[1,1]]){const z=maximumMapZoom(w,h);assert.ok(w/z>=FLOOR_SIZE/2-1e-7&&h/z>=FLOOR_SIZE/2-1e-7);}
assert.equal(forkDirection(4,0),'east');assert.equal(forkDirection(-4,0),'west');assert.equal(forkDirection(0,4),'south');assert.equal(forkDirection(0,-4),'north');
const root=path.join(__dirname,'../public/art/map-selected'),hashes=[];
for(const f of ['terrain-jade-clear-20261020.png',...['north','east','south','west'].map(d=>`road-arrow-${d}.png`)]){
 const b=fs.readFileSync(path.join(root,f));assert.equal(b.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(b.readUInt32BE(16),b.readUInt32BE(20));assert.ok(b.readUInt32BE(16)>=1024);hashes.push(crypto.createHash('sha256').update(b).digest('hex'));
}
assert.equal(new Set(hashes).size,5);
for(const rel of ['src/world/SelectedTerrain.ts','src/world/World.ts','src/data/mapModels.ts']){
 const text=fs.readFileSync(path.join(__dirname,'..',rel),'utf8');assert.ok(text.includes('assetUrl('));assert.ok(!/load\(`\/art\//.test(text));
}
console.log('PASS root and GitHub Pages prefixed asset URLs, all four arrow axes, five distinct full-size textures, half-floor zoom limit at wide and portrait sizes');
