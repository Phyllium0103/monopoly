const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const{registerHooks,stripTypeScriptTypes}=require('node:module');const{pathToFileURL,fileURLToPath}=require('node:url');
registerHooks({resolve(s,c,n){if(s.startsWith('.')&&!path.extname(s)&&c.parentURL){const p=path.resolve(path.dirname(fileURLToPath(c.parentURL)),s+'.ts');if(fs.existsSync(p))return n(pathToFileURL(p).href,c);}return n(s,c);},load(u,c,n){return u.endsWith('.ts')?{format:'module',shortCircuit:true,source:stripTypeScriptTypes(fs.readFileSync(fileURLToPath(u),'utf8'),{mode:'transform'})}:n(u,c);}});
const {assetUrl}=require('../src/data/assetUrl.ts');
const {minimumMapZoom,FLOOR_SIZE,forkDirection}=require('../src/data/mapView.ts');
for(const base of ['/','/monopoly/','./','/other-project']){
 const relative=assetUrl('/art/map-selected/city-3.glb',base);
 const u=new URL(relative,'https://example.test/monopoly/');
 assert.equal(u.pathname,base==='/'?'/art/map-selected/city-3.glb':base==='/other-project'?'/other-project/art/map-selected/city-3.glb':'/monopoly/art/map-selected/city-3.glb');
}
for(const [w,h]of[[320,180],[180,320],[1024,180],[90,180],[1,1]]){const z=minimumMapZoom(w,h);assert.ok(w/z<=FLOOR_SIZE/2+1e-7&&h/z<=FLOOR_SIZE/2+1e-7);}
assert.equal(forkDirection(4,0),'east');assert.equal(forkDirection(-4,0),'west');assert.equal(forkDirection(0,4),'south');assert.equal(forkDirection(0,-4),'north');
const root=path.join(__dirname,'../public/art/map-selected'),hashes=[];
for(const f of ['terrain-jade-clear-20261020.png',...['north','east','south','west'].map(d=>`road-arrow-${d}.png`)]){
 const b=fs.readFileSync(path.join(root,f));assert.equal(b.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(b.readUInt32BE(16),b.readUInt32BE(20));assert.ok(b.readUInt32BE(16)>=1024);hashes.push(crypto.createHash('sha256').update(b).digest('hex'));
}
assert.equal(new Set(hashes).size,5);
for(const rel of ['src/world/SelectedTerrain.ts','src/world/World.ts','src/data/mapModels.ts']){
 const text=fs.readFileSync(path.join(__dirname,'..',rel),'utf8');assert.ok(text.includes('assetUrl('));assert.ok(!/load\(`\/art\//.test(text));
}
console.log('PASS root and GitHub Pages prefixed asset URLs, all four arrow axes, five distinct full-size textures, half-floor zoom-out endpoint at wide and portrait sizes');

const {BOARD}=require('../src/data/board.ts');
assert.ok(BOARD.tiles.filter(t=>t.kind==='road').every(t=>t.name===(t.links.length>=3?'岔路口':'道路')));
const {createGameState}=require('../src/game/GameState.ts');const{rollRoadEvent}=require('../src/systems/RoadEvents.ts');
const random=Math.random,state=createGameState('liu');let event;
try{Math.random=()=>.6;event=rollRoadEvent(state,state.lords.liu);}finally{Math.random=random;}
assert.ok(event);assert.ok(!/白玉驛道|驛道 \d/.test(event.story));
console.log('PASS roads have no numbered place names; road encounters use generic scenery');

const{BUILDING_LOTS}=require('../src/data/selectedBoard.ts');const{garrisonDispatch}=require('../src/systems/GarrisonSystem.ts');const{Engine}=require('../src/engine/Engine.ts');const{RecordingView}=require('../src/engine/view.ts');
const state2=createGameState('liu'),lord2=state2.lords.liu,engine2=new Engine(state2,{view:new RecordingView(),send:async()=>null,isAuto:()=>false,multiplayer:false});
const city=Object.values(state2.cities).find(c=>c.owner==='liu'),lot=BUILDING_LOTS.find(o=>o.id===city.id);lord2.position=lot.triggerTiles[1];assert.equal(garrisonDispatch(state2,lord2,city).fee,0);
const vein=BUILDING_LOTS.find(o=>o.type==='vein'),before=lord2.stones;for(const i of vein.triggerTiles)engine2.passVein(lord2,i);assert.ok(lord2.stones>before);assert.equal(lord2.veinsTapped.length,1);
console.log('PASS second city entrance dispatch is free; both vein cells share one reward per round');

const{WEAPON_CATALOG}=require('../src/data/weaponCatalog.ts');const{WEAPON_TYPES,WEAPON_TYPE_BY_GENERAL}=require('../src/data/weaponTypes.ts');
for(const t of WEAPON_TYPES){const b=fs.readFileSync(path.join(__dirname,'../public/art/icons/兵器',`${t}.webp`));assert.equal(b.subarray(8,12).toString(),'WEBP');}
for(const [id,d] of Object.entries(WEAPON_CATALOG))assert.ok(WEAPON_TYPES.includes(WEAPON_TYPE_BY_GENERAL[id]),`${d.name} ${d.names[0]} has no weapon type`);
assert.equal(WEAPON_TYPE_BY_GENERAL.gaoshun,'盾牌');assert.equal(WEAPON_TYPE_BY_GENERAL.guanxing,'長柄刀');assert.equal(WEAPON_TYPE_BY_GENERAL.zhangxingcai,'雙槍矛');assert.equal(WEAPON_TYPE_BY_GENERAL.zhurongfuren,'暗器');
console.log(`PASS all ${Object.keys(WEAPON_CATALOG).length} personal weapons map to one of ${WEAPON_TYPES.length} weapon-type icons`);
