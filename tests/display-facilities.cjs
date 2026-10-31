const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const{registerHooks,stripTypeScriptTypes}=require('node:module');const{pathToFileURL,fileURLToPath}=require('node:url');
registerHooks({resolve(s,c,n){if(s.startsWith('.')&&!path.extname(s)&&c.parentURL){const p=path.resolve(path.dirname(fileURLToPath(c.parentURL)),s+'.ts');if(fs.existsSync(p))return n(pathToFileURL(p).href,c);}return n(s,c);},load(u,c,n){return u.endsWith('.ts')?{format:'module',shortCircuit:true,source:stripTypeScriptTypes(fs.readFileSync(fileURLToPath(u),'utf8'),{mode:'transform'})}:n(u,c);}});
const{DISPLAY_FACILITIES,DISPLAY_FACILITY_LOTS}=require('../src/data/displayFacilities.ts');
const{BUILDING_LOTS}=require('../src/data/selectedBoard.ts');
const{BOARD}=require('../src/data/board.ts');
const{SELECTED_LAYOUT}=require('../src/data/selectedLayout.ts');
const root=path.join(__dirname,'..');
assert.deepEqual(DISPLAY_FACILITIES,JSON.parse(fs.readFileSync(path.join(root,'public/art/map-selected/display-facilities.json'),'utf8')));
assert.equal(DISPLAY_FACILITY_LOTS.length,16);
const types={martial:'淬體武院',arts:'四藝道院',appraisal:'萬寶鑑定所',ghost:'鬼市'};
const regions=['northwest','southwest','northeast','southeast'];
const occupied=new Set(BUILDING_LOTS.flatMap(o=>[0,1].flatMap(dx=>[0,1].map(dy=>`${o.at[0]+dx},${o.at[1]+dy}`))));
const roads=new Set(SELECTED_LAYOUT.roads.map(p=>p.join(','))),fronts=new Set();
for(const[type,name]of Object.entries(types)){
 const lots=DISPLAY_FACILITY_LOTS.filter(o=>o.type===type);
 assert.equal(lots.length,4);assert.deepEqual(lots.map(o=>o.region).sort(),[...regions].sort());
 assert.ok(lots.every(o=>o.name===name&&o.displayOnly===true));
}
for(const lot of DISPLAY_FACILITY_LOTS){
 for(let dx=0;dx<2;dx++)for(let dy=0;dy<2;dy++){
  const p=`${lot.at[0]+dx},${lot.at[1]+dy}`;
  assert.ok(!occupied.has(p),`${lot.id}: footprint overlap`);assert.ok(!roads.has(p),`${lot.id}: footprint on road`);occupied.add(p);
 }
 assert.equal(lot.frontageTiles.length,2);
 for(const index of lot.frontageTiles){
  assert.ok(!fronts.has(index),'new frontages overlap');fronts.add(index);
  const t=BOARD.tiles[index];assert.equal(t.kind,'road');assert.equal(t.eventAnchor,undefined);assert.equal(t.cityId,null);
  assert.equal(t.links.length,2,'do not occupy the missing side of a T junction');
  assert.ok(['道路','岔路口'].includes(t.name),'display names must not change road events or transport destinations');
 }
}
assert.equal(BOARD.tiles.length,300);assert.equal(BOARD.cities.length,33);assert.equal(BUILDING_LOTS.length,83);
assert.equal(BOARD.tiles.filter(t=>t.eventAnchor!==undefined).length,166,'original triggers plus three two-cell recruitment facilities');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'public/art/map-selected/model-manifest.json'),'utf8'));
function glb(p){const b=fs.readFileSync(p);return JSON.parse(b.toString('utf8',20,20+b.readUInt32LE(12)).trim());}
function triangles(j){return j.meshes.flatMap(m=>m.primitives).reduce((n,p)=>n+j.accessors[p.indices].count/3,0);}
for(const type of Object.keys(types)){
 const m=manifest[type];assert.equal(m.status,'display_only');
 const raw=path.join(root,m.original),packed=path.join(root,'public',m.url),a=glb(raw),b=glb(packed);
 assert.ok(fs.statSync(packed).size<fs.statSync(raw).size,`${type}: file must actually shrink`);
 assert.equal(triangles(b),triangles(a),`${type}: don't lose triangles during compression`);
 assert.ok(b.extensionsRequired.includes('EXT_meshopt_compression'));
 assert.ok(b.images.every(i=>i.mimeType==='image/webp'&&i.bufferView!==undefined&&!i.uri));
 assert.ok(b.buffers.every(v=>!v.uri),'no external geometry dependencies');
 // Identical material definitions may deduplicate; each original draw group stays separate.
 assert.equal(b.meshes.flatMap(m=>m.primitives).length,a.meshes.flatMap(m=>m.primitives).length,`${type}: primitive boundaries preserved`);
 for(const p of b.meshes.flatMap(m=>m.primitives))assert.ok(b.materials[p.material],`${type}: valid material on every primitive`);
}
console.log('PASS four types × four regions = 16 display-only buildings; all 2×2 lots and frontages clear of roads, buildings and T gaps');
console.log('PASS original 300 roads / 33 cities / 83 event buildings / 166 triggers; display-only buildings remain nonfunctional');
console.log('PASS four models are smaller, retain every source triangle/primitive group and embed Meshopt geometry + WebP textures');
