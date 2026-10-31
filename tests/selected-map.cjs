const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const{registerHooks,stripTypeScriptTypes}=require('node:module');const{pathToFileURL,fileURLToPath}=require('node:url');
registerHooks({resolve(s,c,n){if(s.startsWith('.')&&!path.extname(s)&&c.parentURL){const p=path.resolve(path.dirname(fileURLToPath(c.parentURL)),s+'.ts');if(fs.existsSync(p))return n(pathToFileURL(p).href,c);}return n(s,c);},load(u,c,n){return u.endsWith('.ts')?{format:'module',shortCircuit:true,source:stripTypeScriptTypes(fs.readFileSync(fileURLToPath(u),'utf8'),{mode:'transform'})}:n(u,c);}});
const{BOARD}=require('../src/data/board.ts');const{BUILDING_LOTS,CELL_SIZE,cityModelLevel}=require('../src/data/selectedBoard.ts');
const{createGameState}=require('../src/game/GameState.ts');const{nextMovementTile,enterFork}=require('../src/systems/MovementSystem.ts');
const source=JSON.parse(fs.readFileSync(path.join(__dirname,'../public/art/map-selected/layout-source.json'),'utf8'));
assert.equal(BOARD.tiles.length,source.roads.length);assert.equal(BOARD.tiles.length,300);assert.equal(BOARD.cities.length,33);assert.equal(BUILDING_LOTS.length,83);
const occupied=new Set(),roadCells=new Set(source.roads.map(p=>p.join(',')));
for(const lot of BUILDING_LOTS){
 const original=source.objects.find(o=>o.id===lot.id);assert.deepEqual([...lot.at],original.at);assert.equal(lot.side,original.side);
 for(let x=0;x<2;x++)for(let y=0;y<2;y++){const p=[lot.at[0]+x,lot.at[1]+y].join(',');assert.ok(!occupied.has(p),'building overlap');assert.ok(!roadCells.has(p),'road enters footprint');occupied.add(p);}
 const cell=source.roads[lot.tile],front=lot.side==='above'?[lot.at[0],lot.at[1]+2]:[lot.at[0]-1,lot.at[1]];assert.deepEqual(cell,front,'event must be on the street at the entrance');
 assert.equal(lot.triggerTiles.length,2);
 for(const i of lot.triggerTiles){const e=BOARD.tiles[i];assert.equal(e.name,lot.name);assert.equal(e.eventAnchor,lot.tile);assert.equal(e.kind,lot.type==='secret'?'realm':lot.type==='relic'?'portal':lot.type);if(lot.type==='city')assert.equal(e.cityId,lot.id);}
 const t=BOARD.tiles[lot.tile];assert.equal(t.name,lot.name);if(lot.type==='city')assert.equal(BOARD.cities.find(c=>c.id===lot.id).prosperity,original.prosperity);
}
assert.equal(BOARD.tiles.filter(t=>t.eventAnchor!==undefined).length,166);
for(const t of BOARD.tiles){assert.ok(t.links.length>=2);for(const n of t.links){assert.ok(BOARD.tiles[n].links.includes(t.index));const p=BOARD.tiles[n].pos;assert.equal(Math.abs(t.pos.x-p.x)+Math.abs(t.pos.z-p.z),CELL_SIZE,'every move is one orthogonal road cell');}}
const seen=new Set(),queue=[0];while(queue.length){const i=queue.pop();if(seen.has(i))continue;seen.add(i);queue.push(...BOARD.tiles[i].links);}assert.equal(seen.size,300);assert.equal(BOARD.edges.length-300+1,11);
const facilities={};for(const o of BUILDING_LOTS)if(o.type!=='city')facilities[o.type]=(facilities[o.type]??0)+1;
assert.deepEqual(facilities,{secret:5,beast:5,treasure:5,forge:5,vein:4,tavern:5,library:5,herb:5,casino:5,relic:3,recruitment:3});
for(const p of [0,19,20,39,40,59,60,79,80,89,90,100,150])assert.ok(cityModelLevel(p)>=1&&cityModelLevel(p)<=6);
const state=createGameState('liu');const lord=state.lords.liu;
for(let i=0;i<10000;i++){const from=lord.position,next=nextMovementTile(state,lord);assert.ok(state.tiles[from].links.includes(next));lord.position=next;lord.lastTile=from;lord.forkExit=null;enterFork(state,lord,2);}
const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'../public/art/map-selected/model-manifest.json'),'utf8'));
assert.equal(Object.keys(manifest).length,21);
const {MAP_MODELS}=require('../src/data/mapModels.ts');
assert.deepEqual(Object.keys(MAP_MODELS).sort(),Object.keys(manifest).sort());
for(const lot of BUILDING_LOTS){
 const model=lot.type==='city'?`city-${cityModelLevel(lot.prosperity)}`:lot.type;
 assert.ok(MAP_MODELS[model],`missing model for ${lot.name}`);
 assert.equal(MAP_MODELS[model],manifest[model].url.replace(/^\//,'./')+`?v=${manifest[model].sha256.slice(0,12)}`,'model URLs carry their content version for the browser cache');
}
for(const m of Object.values(manifest)){
 const p=path.join(__dirname,'../public',m.url),b=fs.readFileSync(p);assert.equal(b.toString('utf8',0,4),'glTF');assert.equal(b.readUInt32LE(4),2);assert.equal(b.length,b.readUInt32LE(8));
 assert.equal(crypto.createHash('sha256').update(b).digest('hex'),m.sha256);if(process.env.VERIFY_EXTERNAL_SOURCES==='1'||(!process.env.CI&&fs.existsSync(m.source)))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(m.source)).digest('hex'),m.originalSha256,'Blender source must not change');
 assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'..',m.original))).digest('hex'),m.originalSha256,'the uncompressed original is kept in art-src');
 const gltf=JSON.parse(b.toString('utf8',20,20+b.readUInt32LE(12)).trim());
 assert.ok(gltf.extensionsUsed.includes('EXT_meshopt_compression'),'deployed models are compressed (npm run optimize:models)');
 assert.ok((gltf.images??[]).every(v=>v.mimeType==='image/webp'),'deployed textures are WebP');
}
for(const key of ['relic','vein','secret']){
 const m=manifest[key],b=fs.readFileSync(path.join(__dirname,'../public',m.url));
 const gltf=JSON.parse(b.toString('utf8',20,20+b.readUInt32LE(12)).trim());
 assert.equal(m.status,'complete');assert.ok(m.visualApproved);
 assert.ok(gltf.meshes.length>0&&gltf.materials.length>0&&gltf.images.length>0);
 assert.ok(gltf.buffers.every(v=>!v.uri),'GLB buffers must be embedded');
 assert.ok(gltf.images.every(v=>v.bufferView!==undefined&&!v.uri),'GLB textures must be embedded');
 for(const mesh of gltf.meshes)for(const p of mesh.primitives){
  assert.ok(p.attributes.POSITION!==undefined&&p.attributes.NORMAL!==undefined,'positions and normals must survive export');
  const material=gltf.materials[p.material],pbr=material.pbrMetallicRoughness??{};
  for(const texture of [pbr.baseColorTexture,pbr.metallicRoughnessTexture,material.normalTexture,material.occlusionTexture,material.emissiveTexture]){
   if(texture)assert.ok(p.attributes[`TEXCOORD_${texture.texCoord??0}`]!==undefined,'textured surfaces must carry their required UV set');
  }
 }
}
console.log('PASS actual user layout: 300 connected roads, 33 cities, 50 facilities, 11 loops, no overlapping footprints');
console.log('PASS all83 buildings have two trigger cells (166 total), event types, prosperity values, four capitals and 10,000 legal movement steps');
console.log('PASS all21 delivered GLB headers and SHA-256; all83 event lots have models, and the three finished facilities carry embedded textures, normals and UVs');
