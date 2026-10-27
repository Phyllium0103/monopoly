const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const { registerHooks, stripTypeScriptTypes } = require('node:module');
const { pathToFileURL, fileURLToPath } = require('node:url');
registerHooks({
 resolve(s,c,n){if(s.startsWith('.')&&!path.extname(s)&&c.parentURL){const p=path.resolve(path.dirname(fileURLToPath(c.parentURL)),s+'.ts');if(fs.existsSync(p))return n(pathToFileURL(p).href,c);}return n(s,c)},
 load(u,c,n){return u.endsWith('.ts')?{format:'module',shortCircuit:true,source:stripTypeScriptTypes(fs.readFileSync(fileURLToPath(u),'utf8'),{mode:'transform'})}:n(u,c)}
});
const {createGameState}=require('../src/game/GameState.ts');
const {spawnElementalSpirits,collectElementalSpirits,reconcileElementalSpirits,occupiedMapTiles,SPIRIT_CAP}=require('../src/systems/ElementalSpiritSystem.ts');
const {ELEMENTAL_SPIRIT_ART,SPIRIT_ICON_SIZE}=require('../src/data/elementalSpirits.ts');
const {SpiritAnimationClock}=require('../src/world/SpiritAnimation.ts');
const {Engine}=require('../src/engine/Engine.ts'),{RecordingView}=require('../src/engine/view.ts');
const {applyWorldEvent,eventDef}=require('../src/systems/EventSystem.ts');
const server=require('../src/engine/server.ts');
const rng=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/0x100000000};
const roads=s=>s.tiles.filter(t=>t.kind==='road'&&t.links.length<=2&&!occupiedMapTiles(s,{spirits:false}).has(t.index));
function populate(s,n){s.elementalSpirits=roads(s).slice(0,n).map((t,i)=>({id:'fixture-'+i,element:['metal','wood','water','fire','earth'][i%5],tile:t.index,bornRound:0}));}
function engine(s,v=new RecordingView()){return new Engine(s,{view:v,send:async()=>null,isAuto:()=>true,multiplayer:false});}
let passed=0;async function test(name,run){await run();console.log('PASS '+name);passed++}
(async()=>{
 await test('Start empty; first spawn only after five completed full rounds; never double-spawn a batch',()=>{
  const s=createGameState('liu',null);assert.deepEqual(s.elementalSpirits,[]);
  for(let r=0;r<5;r++)assert.equal(spawnElementalSpirits(s,r),0);
  assert.equal(spawnElementalSpirits(s,5,rng(1)),3);const snapshot=JSON.stringify(s.elementalSpirits);
  assert.equal(spawnElementalSpirits(s,5),0);assert.equal(JSON.stringify(s.elementalSpirits),snapshot);
  assert.equal(spawnElementalSpirits(s,6),0);assert.equal(spawnElementalSpirits(s,10),3);
  assert.equal(new Set(s.elementalSpirits.map(x=>x.tile)).size,6);
 });
 await test('0..15 existing spirits: add min(3, remaining capacity), especially 14 -> 15',()=>{
  for(let n=0;n<=SPIRIT_CAP;n++){
   const s=createGameState('liu',null);populate(s,n);
   assert.equal(spawnElementalSpirits(s,5,rng(n+1)),Math.min(3,15-n));
   assert.equal(s.elementalSpirits.length,Math.min(n+3,15));
   assert.equal(new Set(s.elementalSpirits.map(x=>x.tile)).size,s.elementalSpirits.length);
  }
 });
 await test('Exclude every lord, merchant, bandit, registered future object, signpost and occupied spirit tile',()=>{
  const s=createGameState('liu',null),pool=roads(s);
  Object.values(s.lords).forEach((l,i)=>l.position=pool[i].index);
  s.merchantTile=pool[4].index;s.banditTiles=[pool[5].index,pool[6].index];
  s.mapOccupants=[{id:'future-object',tiles:[pool[7].index,pool[8].index]}];
  const blocked=occupiedMapTiles(s);
  const kinds=new Set();
  for(let round=5;round<=25;round+=5)spawnElementalSpirits(s,round,rng(round));
  for(const e of s.elementalSpirits){assert.ok(!blocked.has(e.tile));assert.equal(s.tiles[e.tile].kind,'road');assert.ok(s.tiles[e.tile].links.length<=2);kinds.add(e.element)}
  assert.equal(s.elementalSpirits.length,15);assert.ok(kinds.size>=4,'random elements are selected independently');
 });
 await test('No free cells: graceful empty batch and no infinite retry; later batches can resume',()=>{
  const s=createGameState('liu',null);s.mapOccupants=[{id:'all-blocked',tiles:s.tiles.map(t=>t.index)}];
  assert.equal(spawnElementalSpirits(s,5),0);assert.equal(s.elementalSpiritSpawnRound,5);
  s.mapOccupants=[];assert.equal(spawnElementalSpirits(s,5),0);assert.equal(spawnElementalSpirits(s,10),3);
 });
 await test('Touch removes a spirit once and changes no rewards, stats, inventory, money or other state',()=>{
  const s=createGameState('liu',null);populate(s,2);const target=s.elementalSpirits[0].tile;
  const before=structuredClone(s);delete before.elementalSpirits;
  assert.equal(collectElementalSpirits(s,target),true);assert.equal(s.elementalSpirits.length,1);
  assert.equal(collectElementalSpirits(s,target),false);const after=structuredClone(s);delete after.elementalSpirits;
  assert.deepEqual(after,before);
 });
 await test('Future object relocation and standing-lord collection preserve clear, unique cells',()=>{
  const s=createGameState('liu',null);populate(s,3);
  const blocked=s.elementalSpirits[0].tile,old=s.elementalSpirits[1].tile;
  s.mapOccupants=[{id:'new-map-object',tiles:[blocked]}];s.lords.liu.position=old;
  assert.equal(reconcileElementalSpirits(s,rng(44)),true);assert.equal(s.elementalSpirits.length,2);
  assert.ok(s.elementalSpirits.every(x=>x.tile!==blocked&&x.tile!==old));
  assert.equal(new Set(s.elementalSpirits.map(x=>x.tile)).size,2);
 });
 await test('Later merchants and bandits also avoid the existing spirits and future reservations',()=>{
  const s=createGameState('liu',null);populate(s,15);s.mapOccupants=[{id:'future',tiles:roads(s).slice(20,24).map(t=>t.index)}];
  const spirits=new Set(s.elementalSpirits.map(x=>x.tile)),reserved=new Set(s.mapOccupants[0].tiles);
  for(let i=0;i<20;i++){
   s.merchantTile=null;applyWorldEvent(s,eventDef('merchant'));assert.ok(!spirits.has(s.merchantTile)&&!reserved.has(s.merchantTile));
   applyWorldEvent(s,eventDef('bandits'));assert.ok(s.banditTiles.every(t=>!spirits.has(t)&&!reserved.has(t)&&t!==s.merchantTile));
  }
 });
 await test('Passing preserves a spirit; only final landing collects, after the final movement event',async()=>{
  const s=createGameState('liu',null),l=s.lords.liu;
  const from=roads(s).find(t=>t.links.some(n=>s.tiles[n].kind==='road'&&s.tiles[n].links.length===2&&s.tiles[n].links.some(e=>e!==t.index&&s.tiles[e].kind==='road'&&s.tiles[e].links.length<=2)));
  const to=from.links.find(n=>s.tiles[n].kind==='road'&&s.tiles[n].links.length===2&&s.tiles[n].links.some(e=>e!==from.index&&s.tiles[e].kind==='road'&&s.tiles[e].links.length<=2));
  const end=s.tiles[to].links.find(n=>n!==from.index);
  l.position=from.index;l.lastTile=from.links.find(n=>n!==to)??null;l.forkExit=null;
  const passed={id:'passed',element:'water',tile:to,bornRound:5};
  s.elementalSpirits=[passed,{id:'landed',element:'fire',tile:end,bornRound:5}];
  const v=new RecordingView(),e=engine(s,v);e.roadEvent=async()=>{};
  await e.moveLord(l,2);assert.equal(l.position,end);assert.deepEqual(s.elementalSpirits,[passed]);
  const moves=v.events.flatMap((e,i)=>e.t==='moveStep'?[i]:[]),sync=v.events.findIndex(e=>e.t==='syncSpirits');
  assert.equal(moves.length,2);assert.ok(sync>moves[1]);assert.deepEqual(v.events[sync].a,[[passed]]);
  // A single-step move that actually ends on the spirit also collects it.
  l.position=from.index;l.lastTile=from.links.find(n=>n!==to)??null;l.forkExit=null;
  await e.moveLord(l,1);assert.equal(l.position,to);assert.equal(s.elementalSpirits.length,0);
 });
 await test('Teleport/landing collects too, without a reward event',async()=>{
  const s=createGameState('liu',null),l=s.lords.liu,t=roads(s)[3].index;
  s.elementalSpirits=[{id:'teleport',element:'earth',tile:t,bornRound:5}];
  const v=new RecordingView(),e=engine(s,v);e.roadEvent=async()=>{};
  const stones=l.stones;await e.teleport(l,t);assert.equal(s.elementalSpirits.length,0);assert.equal(l.stones,stones);
  assert.ok(v.events.some(e=>e.t==='syncSpirits'));
 });
 await test('Engine finishes round five, starts round six and synchronizes exactly three spawns',async()=>{
  const s=createGameState('liu',null);s.round=5;s.turn=s.order.length-1;
  const v=new RecordingView(),e=engine(s,v);e.takeTurn=async()=>{};
  await e.step();assert.equal(s.round,6);assert.equal(s.elementalSpirits.length,3);
  assert.equal(s.elementalSpiritSpawnRound,5);
  assert.equal(v.events.filter(e=>e.t==='syncSpirits').at(-1).a[0].length,3);
 });
 await test('P2P snapshot replay is deterministic and includes generated spirits, without mutating input',async()=>{
  const s=server.createMultiplayerState([{lord:'cao',human:true,name:'甲'},{lord:'liu',human:true,name:'乙'}],null,1234);
  s.round=5;s.turn=s.order.findLastIndex(id=>s.lords[id].alive);
  s.lords[s.order[s.turn]].stunned=1;s.lords[s.order[s.turn]].isPlayer=false;
  const record=server.newRecord(s,233),input=JSON.stringify(record);
  const a=await server.advance(record),b=await server.advance(record);
  assert.deepEqual(a.state,b.state);assert.deepEqual(a.events,b.events);assert.equal(JSON.stringify(record),input);
  assert.equal(a.state.elementalSpiritSpawnRound,5);assert.equal(a.state.elementalSpirits.length,3);
  const sync=a.events.find(e=>e.t==='syncSpirits'&&e.a[0].length===3);assert.ok(sync);
  const original=structuredClone(sync.a[0]);a.state.elementalSpirits.splice(0);assert.deepEqual(sync.a[0],original);
 });
 await test('Idle indefinitely, click to play once; repeated clicks neither restart nor queue an action',()=>{
  assert.equal(SPIRIT_ICON_SIZE,80);
  const actions=ELEMENTAL_SPIRIT_ART.metal.actions;let draws=0;
  const clock=new SpiritAnimationClock(1000,actions,()=>{draws++;return .6});
  assert.deepEqual(clock.sample(31000),{action:null,frame:0});assert.equal(draws,0);
  assert.equal(clock.trigger(31000),true);
  assert.deepEqual(clock.sample(31000),{action:2,frame:0});assert.equal(draws,1);
  assert.equal(clock.trigger(31001),false);assert.equal(draws,1);
  assert.equal(clock.sample(31000+actions[2].durationsMs[0]).frame,1);
  const duration=actions[2].durationsMs.reduce((a,b)=>a+b,0);
  assert.equal(clock.trigger(31000+duration-1),false);assert.equal(draws,1);
  assert.deepEqual(clock.sample(31000+duration),{action:null,frame:0});assert.equal(draws,1);
  assert.deepEqual(clock.sample(500000),{action:null,frame:0});assert.equal(draws,1);
  assert.equal(clock.trigger(500000),true);assert.equal(draws,2);
  assert.equal(clock.sample(500001).action,2);
  assert.deepEqual(clock.sample(999999),{action:null,frame:0});assert.equal(draws,2);
  // At the exact end a click may start a fresh action, even without an intervening render.
  assert.equal(clock.trigger(999999),true);assert.equal(clock.trigger(999999+duration),true);assert.equal(draws,4);
  const empty=new SpiritAnimationClock(0,[],()=>{throw Error('no actions')});assert.equal(empty.trigger(100),false);
 });
 await test('Visual animation never consumes Math.random used by the deterministic game simulation',()=>{
  const original=Math.random;try{Math.random=()=>{throw Error('visual touched authoritative RNG')};
   const clock=new SpiritAnimationClock(0,ELEMENTAL_SPIRIT_ART.fire.actions);assert.equal(clock.trigger(30000),true);assert.notEqual(clock.sample(30000).action,null);
  }finally{Math.random=original}
 });
 await test('World sprites scale with roads at all zoom levels and keep resting feet at the road-cell centre',()=>{
  const THREE=require('three');
  const savedDocument=global.document,savedImage=global.Image;
  class ElementStub{
   style={};dataset={};parentNode=null;ownerDocument={defaultView:{Element:ElementStub}};
   setAttribute(){} remove(){this.parentNode=null}
   getContext(){return {clearRect(){},drawImage(){}}}
  }
  try{
   global.document={createElement:()=>new ElementStub()};
   global.Image=class{complete=true;naturalWidth=640;naturalHeight=640;set src(url){if(url.includes('idle'))this.naturalWidth=this.naturalHeight=160}};
   const {ElementalSpiritLayer,SPIRIT_WORLD_SIZE}=require('../src/world/ElementalSpirits.ts');
   const tileCentre=new THREE.Vector3(12,.664,20),layer=new ElementalSpiritLayer(()=>tileCentre.clone());
   const elements=['metal','wood','water','fire','earth'];
   layer.sync(elements.map((element,i)=>({id:'render-'+i,element,tile:i,bornRound:5})),0);
   assert.equal(layer.group.children.length,5);
   const camera=new THREE.OrthographicCamera(-90,90,90,-90,.5,1500);
   camera.position.set(-183.7117,150,183.7117);camera.lookAt(0,0,0);camera.updateMatrixWorld();
   let previousHeight=0,previousZoom=0;
   for(const zoom of [1.125,3,8]){
    camera.zoom=zoom;camera.updateProjectionMatrix();layer.group.updateMatrixWorld(true);
    const target=tileCentre.clone().project(camera);
    for(let i=0;i<elements.length;i++){
     const object=layer.group.children[i],art=ELEMENTAL_SPIRIT_ART[elements[i]];
     assert.equal(object.isSprite,true);assert.deepEqual(object.scale.toArray(),[SPIRIT_WORLD_SIZE,SPIRIT_WORLD_SIZE,1]);
     assert.deepEqual(object.position.toArray(),tileCentre.toArray(),'feet lie on the road surface, without an added hover offset');
     const point=object.getWorldPosition(new THREE.Vector3()).project(camera);
     assert.ok(point.distanceTo(target)<1e-12);
     assert.ok(Math.abs(art.foot.x-object.center.x)<1e-12);
     assert.ok(Math.abs(1-art.foot.y-object.center.y)<1e-12);
     assert.ok(art.foot.y>art.center.y,'foot is below the body centre');
     assert.equal(object.material.map.colorSpace,THREE.SRGBColorSpace);assert.equal(object.material.depthWrite,false);
     assert.ok(object.material.map.version>0,'the drawn idle frame is uploaded');
     const right=new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion);
     const width=point.clone().sub(tileCentre.clone().addScaledVector(right,SPIRIT_WORLD_SIZE).project(camera)).length();
     const roadWidth=point.clone().sub(tileCentre.clone().addScaledVector(right,4).project(camera)).length();
     assert.ok(Math.abs(width/roadWidth-4/3)<1e-10,'same ratio to roads at each zoom');
     if(i===0){if(previousZoom)assert.ok(Math.abs(width/previousHeight-zoom/previousZoom)<1e-10);previousHeight=width;previousZoom=zoom}
    }
   }
   assert.equal(layer.playAtTile(999,0),false);
   const duration=Math.max(...Object.values(ELEMENTAL_SPIRIT_ART).flatMap(a=>a.actions.map(x=>x.durationsMs.reduce((n,v)=>n+v,0))));
   layer.update(100000);assert.ok([...layer.entries.values()].every(e=>e.canvas.dataset.animation==='idle'));
   assert.equal(layer.playAtTile(2,100000),true);assert.equal(layer.playAtTile(2,100001),false);
   assert.notEqual([...layer.entries.values()][2].canvas.dataset.animation,'idle');
   assert.ok([...layer.entries.values()].filter((_,i)=>i!==2).every(e=>e.canvas.dataset.animation==='idle'));
   layer.update(100000+duration);assert.ok([...layer.entries.values()].every(e=>e.canvas.dataset.animation==='idle'));
   assert.equal(layer.playAtTile(2,100000+duration),true);
   layer.clear();assert.equal(layer.group.children.length,0);assert.equal(layer.playAtTile(2,200000),false);
  }finally{global.document=savedDocument;global.Image=savedImage}
 });
 await test('25 compressed transparent WebPs, four 16-frame atlases per element, exact file SHA and Pages URLs',()=>{
  const report=JSON.parse(fs.readFileSync(path.join(__dirname,'../docs/elemental-spirit-assets.json'),'utf8'));
  assert.equal(report.assets.length,25);assert.ok(report.gameBytes<report.sourceBytes*.25);
  assert.equal(report.compression.quality,80);assert.equal(report.compression.displaySize,80);
  for(const asset of report.assets){
   const b=fs.readFileSync(path.join(__dirname,'../public',asset.file));
   assert.equal(crypto.createHash('sha256').update(b).digest('hex'),asset.sha256);assert.equal(b.toString('ascii',8,12),'WEBP');
   assert.equal(b.toString('ascii',12,16),'VP8X');assert.ok(b[20]&0x10);
   assert.equal(b.readUIntLE(24,3)+1,asset.width);assert.equal(b.readUIntLE(27,3)+1,asset.height);assert.equal(asset.alphaPreservedExactly,true);
  }
  for(const art of Object.values(ELEMENTAL_SPIRIT_ART)){
   assert.ok(art.center.x>0&&art.center.x<1&&art.center.y>0&&art.center.y<1);
   assert.ok(art.foot.x>0&&art.foot.x<1&&art.foot.y>art.center.y&&art.foot.y<1);
   assert.equal(art.actions.length,4);assert.equal(new Set(art.actions.map(a=>a.url)).size,4);
   assert.ok(new URL(art.idle,'https://example.test/monopoly/').pathname.startsWith('/monopoly/art/spirits/'));
   for(const action of art.actions){assert.equal(action.frames,16);assert.equal(action.durationsMs.length,16);assert.equal(action.columns*action.rows,16)}
  }
 });
 console.log('PASS '+passed+' elemental-spirit behavior, replay, timing and deployment checks');
})().catch(e=>{console.error(e);process.exitCode=1});

