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

const{WEAPON_CATALOG,makePersonalWeapon}=require('../src/data/weaponCatalog.ts');const{WEAPON_TYPES,WEAPON_TYPE_BY_GENERAL}=require('../src/data/weaponTypes.ts');
for(const [id,d] of Object.entries(WEAPON_CATALOG))assert.ok(WEAPON_TYPES.includes(WEAPON_TYPE_BY_GENERAL[id]),`${d.name} ${d.names[0]} has no weapon type`);
assert.equal(WEAPON_TYPE_BY_GENERAL.gaoshun,'盾牌');assert.equal(WEAPON_TYPE_BY_GENERAL.guanxing,'長柄刀');assert.equal(WEAPON_TYPE_BY_GENERAL.zhangxingcai,'雙槍矛');assert.equal(WEAPON_TYPE_BY_GENERAL.zhurongfuren,'暗器');
const{WEAPON_ICON_IDS,WEAPON_ICON_BY_GENERAL,classifyWeaponIcon}=require('../src/data/weaponIcons.ts');
const{equipIconUrl}=require('../src/ui/Icons.ts');
const illustrated=JSON.parse(fs.readFileSync(path.join(__dirname,'../docs/weapon-illustrated-assets.json'),'utf8'));
assert.equal(illustrated.generalCount,Object.keys(WEAPON_CATALOG).length);
assert.equal(illustrated.iconCount,WEAPON_ICON_IDS.length);
assert.equal(WEAPON_ICON_IDS.length,new Set(WEAPON_ICON_IDS).size);
assert.equal(illustrated.transparent,true,'Current weapon edition has no paper backgrounds');
assert.deepEqual(illustrated.compression,{format:'WEBP',height:1024,quality:80,method:6,resampling:'LANCZOS',alphaPreservedExactly:true});
assert.equal(illustrated.assets.filter(a=>a.originalRGBPreservedExactly===true).length,61,'All unchanged weapons retain their selected original RGB pixels');
assert.equal(classifyWeaponIcon('沒有此類的名稱'),undefined);
for(const[id,expected]of Object.entries({liubei:'02-01',guanyu:'05-01',zhangfei:'06-02',gongsunzan:'06-04',zhangxingcai:'07-01',dianwei:'08-04',lvlingqi:'08-03',zhangliao:'09-02',gaoshun:'13-03',huangyueying:'12-01',zhouyu:'15-01',caiwenji:'15-02',zhenji:'15-03',mulu:'17-02',zuoci:'18-01',yuji:'18-02',bulianshi:'18-03',diaochan:'10-06',sunluban:'19-02',liru:'20-01',huatuo:'19-03',yuanshu:'21-01',guanlu:'21-02',pujing:'22-01'}))assert.equal(WEAPON_ICON_BY_GENERAL[id],expected,id);
const imageHashes=[];
for(const a of illustrated.assets){
 const b=fs.readFileSync(path.join(__dirname,'../public',a.file));
 assert.equal(b.subarray(8,12).toString(),'WEBP',a.id);
 assert.equal(b.subarray(12,16).toString(),'VP8X',a.id+' extended WebP header');
 assert.ok(b[20]&0x10,a.id+' carries a real alpha channel');
 assert.equal(b.readUIntLE(24,3)+1,a.size[0],a.id+' actual width');
 assert.equal(b.readUIntLE(27,3)+1,1024,a.id+' full-body-art compression height');
 assert.equal(a.alphaPreservedExactly,true,a.id);
 const hash=crypto.createHash('sha256').update(b).digest('hex');
 assert.equal(hash,a.sha256,a.id);imageHashes.push(hash);
}
assert.equal(new Set(imageHashes).size,WEAPON_ICON_IDS.length,'Every silhouette has its own actual image');
for(const[id,d]of Object.entries(WEAPON_CATALOG)){
 const iconId=WEAPON_ICON_BY_GENERAL[id];assert.ok(WEAPON_ICON_IDS.includes(iconId),`${d.name} ${d.names[0]} missing illustration`);
 for(let grade=0;grade<4;grade++){
  const u=new URL(equipIconUrl(makePersonalWeapon(id,grade)),'https://example.test/monopoly/');
  assert.equal(u.pathname,`/monopoly/art/icons/weapon-illustrated/${iconId}.webp`,`${d.name} grade ${grade}`);
 }
}
// Rebuilt pack must contain the actual current bytes, including the new weapon silhouettes.
const pack=JSON.parse(fs.readFileSync(path.join(__dirname,'../public/art/pack.json'),'utf8'));
const bin=fs.readFileSync(path.join(__dirname,'../public/art/pack.bin'));let end=0;
for(const[key,[offset,length]]of Object.entries(pack)){
 assert.equal(offset,end,key);end+=length;assert.ok(end<=bin.length,key);
 assert.deepEqual(bin.subarray(offset,end),fs.readFileSync(path.join(__dirname,'../public/art',key+'.webp')),key);
}
assert.equal(end,bin.length);
for(const id of WEAPON_ICON_IDS)assert.ok(pack[`icons/weapon-illustrated/${id}`],id);
assert.ok(Object.keys(pack).every(k=>!k.startsWith('icons/兵器/')));
console.log(`PASS ${Object.keys(WEAPON_CATALOG).length} generals / 700 grade-specific weapon names use ${WEAPON_ICON_IDS.length} distinct reviewed illustrations; precise subtypes, GitHub Pages URLs and packed bytes verified`);
