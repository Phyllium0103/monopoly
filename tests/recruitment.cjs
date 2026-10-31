const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const{registerHooks,stripTypeScriptTypes}=require('node:module');const{pathToFileURL,fileURLToPath}=require('node:url');
registerHooks({resolve(s,c,n){if(s.startsWith('.')&&!path.extname(s)&&c.parentURL){const p=path.resolve(path.dirname(fileURLToPath(c.parentURL)),s+'.ts');if(fs.existsSync(p))return n(pathToFileURL(p).href,c);}return n(s,c);},load(u,c,n){return u.endsWith('.ts')?{format:'module',shortCircuit:true,source:stripTypeScriptTypes(fs.readFileSync(fileURLToPath(u),'utf8'),{mode:'transform'})}:n(u,c);}});
const root=path.resolve(__dirname,'..');
const {BOARD,hasCurrentBoard}=require('../src/data/board.ts'),{BUILDING_LOTS}=require('../src/data/selectedBoard.ts');
const {DISPLAY_FACILITY_LOTS}=require('../src/data/displayFacilities.ts');
const {createGameState}=require('../src/game/GameState.ts'),{Engine}=require('../src/engine/Engine.ts'),{RecordingView}=require('../src/engine/view.ts');
const {recruitmentMaximum,recruitAtBureau}=require('../src/systems/RecruitmentSystem.ts');
const {recruitCost}=require('../src/systems/CitySystem.ts'),{aiPreroll}=require('../src/systems/AISystem.ts');
const lots=BUILDING_LOTS.filter(l=>l.type==='recruitment');
assert.equal(lots.length,3);assert.equal(BOARD.tiles.filter(t=>t.kind==='recruitment').length,6);
assert.equal(new Set(lots.map(o=>o.id)).size,3);
const occupied=new Set(),roads=new Set(BOARD.tiles.map(t=>`${t.pos.x},${t.pos.z}`));
for(const lot of [...BUILDING_LOTS,...DISPLAY_FACILITY_LOTS])for(let dx=0;dx<2;dx++)for(let dy=0;dy<2;dy++){
 const k=`${lot.at[0]+dx},${lot.at[1]+dy}`;assert.ok(!occupied.has(k),'no overlapping 2x2 building footprint');occupied.add(k);
}
for(const lot of lots){assert.equal(lot.triggerTiles.length,2);for(const i of lot.triggerTiles){assert.equal(BOARD.tiles[i].kind,'recruitment');assert.equal(BOARD.tiles[i].eventAnchor,lot.tile);assert.equal(BOARD.tiles[i].links.length,2);}}
assert.ok(lots.some(o=>o.at[0]<=23)&&lots.some(o=>o.at[1]>=30)&&lots.some(o=>o.at[0]>=43),'three separate geographic regions');
const make=(id='liu',send=async()=>null,multiplayer=false)=>{const state=createGameState(id,null),view=new RecordingView();state.merchantTile=null;state.banditTiles=[];const engine=new Engine(state,{view,send,isAuto:()=>false,multiplayer});return{state,lord:state.lords[id],engine,view};};
function glb(file){const b=fs.readFileSync(file);assert.equal(b.toString('ascii',0,4),'glTF');assert.equal(b.length,b.readUInt32LE(8));return{b,j:JSON.parse(b.toString('utf8',20,20+b.readUInt32LE(12)))};}
function tris(j){return j.meshes.flatMap(m=>m.primitives).reduce((n,p)=>n+j.accessors[p.indices].count/3,0)}
(async()=>{
 const fresh=createGameState('liu');assert.equal(hasCurrentBoard(fresh),true);assert.equal(hasCurrentBoard(structuredClone(fresh)),true);
 const stale=structuredClone(fresh);stale.rulesVersion='map-dual-frontage-20261020';assert.equal(hasCurrentBoard(stale),false);
 const mismatched=structuredClone(fresh);mismatched.tiles[lots[0].tile].kind='road';assert.equal(hasCurrentBoard(mismatched),false);

 for(const multiplayer of [false,true])for(const lot of lots)for(const tile of lot.triggerTiles){
  const prompts=[];const {state,lord,engine}=make('liu',async(_id,p)=>{prompts.push(p);return p.kind==='slider'?500:null;},multiplayer);
  lord.position=tile;const before=[lord.stones,lord.soldiers],cost=recruitCost(lord.id,500);
  await engine.land(lord,tile);assert.equal(lord.soldiers,before[1]+500);assert.equal(lord.stones,before[0]-cost);assert.equal(lord.position,tile);
  assert.equal(prompts.length,1);assert.equal(prompts[0].kind,'slider');assert.match(prompts[0].title,/募兵司/);assert.equal(prompts[0].step,100);
 }
 for(const response of [null,false,'500',NaN]){
  const {lord,engine}=make('liu',async()=>response);lord.position=lots[0].tile;const before=[lord.stones,lord.soldiers];await engine.land(lord,lord.position);assert.deepEqual([lord.stones,lord.soldiers],before,'cancel or invalid reply cannot charge');
 }
 for(const id of ['liu','cao','sun','dong']){
  const {state,lord}=make(id);lord.position=lots[0].tile;lord.stones=999;
  const max=recruitmentMaximum(lord);assert.ok(recruitCost(id,max)<=999);assert.ok(recruitCost(id,max+100)>999);
  const before=[lord.stones,lord.soldiers];for(const bad of [0,-100,50,101,Infinity,NaN,1e16])assert.equal(recruitAtBureau(state,lord,bad),false);
  assert.deepEqual([lord.stones,lord.soldiers],before);assert.equal(recruitAtBureau(state,lord,max+100),false);
  assert.equal(recruitAtBureau(state,lord,100),true);assert.equal(lord.stones,999-recruitCost(id,100));
  lord.position=state.tiles.find(t=>t.kind==='road').index;const after=[lord.stones,lord.soldiers];assert.equal(recruitAtBureau(state,lord,100),false);assert.deepEqual([lord.stones,lord.soldiers],after);
 }
 {const {lord,engine,view}=make('liu',async()=>{throw Error('unaffordable visit must not prompt')});lord.position=lots[0].tile;lord.stones=0;const n=lord.soldiers;await engine.land(lord,lord.position);assert.equal(lord.soldiers,n);assert.ok(view.events.some(e=>e.t==='toast'));}
 for(const where of [lots[0].tile,BOARD.tiles.find(t=>t.kind==='road').index]){
  let calls=0;const {lord,engine}=make('liu',async()=>++calls===1?{type:'recruit'}:{type:'roll'});lord.position=where;const before=[lord.stones,lord.soldiers];assert.deepEqual(await engine.prerollPhase(lord),{type:'roll'});assert.deepEqual([lord.stones,lord.soldiers],before,'forged legacy preroll action is ignored');
 }
 {const {state,lord,engine}=make();lord.items=[];lord.soldiers=1000;const n=lord.soldiers;await aiPreroll(state,lord);assert.equal(lord.soldiers,n,'AI no longer buys soldiers during preroll');lord.isPlayer=false;lord.position=lots[1].tile;lord.stones=30000;const cost=recruitCost(lord.id,2000);await engine.land(lord,lord.position);assert.equal(lord.soldiers,n+2000);assert.equal(lord.stones,30000-cost);}
 for(const lot of lots){
  const {state,lord,engine}=make();const[a,b]=lot.triggerTiles;const from=state.tiles[a].links.find(i=>i!==b);lord.position=from;lord.lastTile=state.tiles[from].links.find(i=>i!==a);let visited=0;
  engine.recruitSoldiers=async()=>visited++;
  for(const name of ['landShop','landCity','landRealm','landCasino','landPortal','roadEvent','banditEvent'])engine[name]=async()=>{};
  await engine.moveLord(lord,3);assert.equal(visited,0,'passing both entrance cells does not open recruitment');
 }
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'public/art/map-selected/model-manifest.json'),'utf8')),m=manifest.recruitment;
 const source=glb(path.join(root,m.original)),packed=glb(path.join(root,'public',m.url));assert.equal(tris(packed.j),tris(source.j));assert.equal(packed.j.meshes.flatMap(m=>m.primitives).length,source.j.meshes.flatMap(m=>m.primitives).length);
 for(const [b,sha]of[[source.b,m.originalSha256],[packed.b,m.sha256]])assert.equal(crypto.createHash('sha256').update(b).digest('hex'),sha);
 assert.ok(packed.b.length<source.b.length);
 const{MAP_RUNTIME_MODELS}=require('../src/data/mapRuntimeModels.ts');assert.equal(MAP_RUNTIME_MODELS.recruitment.length,1);
 const rt=glb(path.join(root,'public',MAP_RUNTIME_MODELS.recruitment[0]));assert.ok(rt.b.length<packed.b.length);assert.equal(tris(rt.j),tris(source.j),'keep tiny tiger inlays in the runtime asset');
 for(const{j}of[packed,rt]){assert.ok(j.extensionsRequired.includes('EXT_meshopt_compression'));assert.ok(j.images.every(i=>i.mimeType==='image/webp'&&i.bufferView!==undefined&&!i.uri));assert.ok(j.buffers.every(b=>!b.uri));}
 assert.ok(!fs.readFileSync(path.join(root,'src/game/Game.ts'),'utf8').includes("type: 'recruit'"));
 console.log('PASS three distributed 2x2 bureaus / six arrival-only triggers; human and P2P prompts, cancellation, prices and discounts');
 console.log('PASS invalid amounts and remote/legacy action rejected; AI recruits only at bureau; passing by does not recruit');
 console.log('PASS one compressed runtime asset; preserved selected-model triangles/groups, embedded WebP/Meshopt, source SHA');
})().catch(e=>{console.error(e);process.exitCode=1});
