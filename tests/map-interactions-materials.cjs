const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const{registerHooks,stripTypeScriptTypes}=require('node:module');const{pathToFileURL,fileURLToPath}=require('node:url');
registerHooks({resolve(s,c,n){if(s.startsWith('.')&&!path.extname(s)&&c.parentURL){const p=path.resolve(path.dirname(fileURLToPath(c.parentURL)),s+'.ts');if(fs.existsSync(p))return n(pathToFileURL(p).href,c);}return n(s,c);},load(u,c,n){return u.endsWith('.ts')?{format:'module',shortCircuit:true,source:stripTypeScriptTypes(fs.readFileSync(fileURLToPath(u),'utf8'),{mode:'transform'})}:n(u,c);}});
const {createGameState}=require('../src/game/GameState.ts');
const {Engine}=require('../src/engine/Engine.ts'),{RecordingView}=require('../src/engine/view.ts');
const {nextMovementTile}=require('../src/systems/MovementSystem.ts');
const {MATERIAL_GROUPS,MATERIAL_NAMES,WEAPON_CATALOG,makePersonalWeapon,weaponGrade}=require('../src/data/weaponCatalog.ts');
const {materialIconUrl}=require('../src/data/materialIcons.ts');
const {materialLabel,materialsHtml}=require('../src/ui/MaterialArt.ts');
let passed=0;async function test(name,fn){await fn();console.log('PASS '+name);passed++}
const make=(state,send,multiplayer=false,auto=false)=>{const view=new RecordingView();return {view,engine:new Engine(state,{view,send,isAuto:()=>auto,multiplayer})}};
(async()=>{
 await test('Both casino frontage cells, betting/declining and AI all preserve position and road direction with no teleport',async()=>{
  for(const multiplayer of [false,true])for(const human of [false,true])for(const bet of [null,100]){
   const state=createGameState('liu',null),lord=state.lords.liu;lord.isPlayer=human;
   for(const tile of state.tiles.filter(t=>t.kind==='casino')){
    lord.position=tile.index;lord.lastTile=tile.links[0];lord.forkExit=tile.links[1]??null;
    const before=[lord.position,lord.lastTile,lord.forkExit],expected=nextMovementTile(state,lord,()=>0);
    const {engine,view}=make(state,async()=>bet,multiplayer);
    await engine.landCasino(lord);
    assert.deepEqual([lord.position,lord.lastTile,lord.forkExit],before);
    assert.equal(nextMovementTile(state,lord,()=>0),expected);
    assert.equal(view.events.some(e=>e.t==='teleport'||e.t==='moveStep'||e.t==='relic'),false);
   }
  }
 });
 await test('Relic entry asks before mutating; no/close/invalid responses stay outside; yes enters once in solo and P2P',async()=>{
  for(const multiplayer of [false,true])for(const response of [false,null,'yes',true]){
   const state=createGameState('liu',null),lord=state.lords.liu;
   lord.position=state.tiles.find(t=>t.kind==='portal').index;lord.lastTile=state.tiles[lord.position].links[0];lord.forkExit=null;
   const before=structuredClone(lord),prompts=[];
   const {engine,view}=make(state,async(_id,p)=>{prompts.push(structuredClone(p));assert.deepEqual(lord,before);return response},multiplayer);
   await engine.landPortal(lord);assert.equal(prompts.length,1);assert.equal(prompts[0].kind,'confirm');
   assert.match(prompts[0].yes,/進入/);assert.match(prompts[0].no,/不進入/);
   assert.deepEqual(JSON.parse(JSON.stringify(prompts)),prompts);
   if(response===true){assert.equal(lord.relicJourney.steps,0);assert.equal(lord.relicJourney.entryTile,before.position);await engine.landPortal(lord);assert.equal(prompts.length,1)}
   else{assert.deepEqual(lord,before);assert.equal(view.events.some(e=>e.t==='relic'),false)}
  }
 });
 await test('18 distinct selected material images: correct family/grade/name, latest revisions, transparent WebP and exact SHA',()=>{
  const report=JSON.parse(fs.readFileSync(path.join(__dirname,'../docs/material-icon-assets.json'),'utf8'));
  assert.equal(report.assets.length,18);assert.ok(report.gameBytes<report.sourceBytes*.05);
  assert.equal(report.compression.quality,80);assert.equal(report.compression.size,256);
  const hashes=new Set();
  for(const a of report.assets){
   assert.equal(a.name,MATERIAL_NAMES[a.group][a.tier-1]);
   const bytes=fs.readFileSync(path.join(__dirname,'../public',a.file));
   assert.equal(bytes.toString('ascii',8,12),'WEBP');assert.equal(bytes.toString('ascii',12,16),'VP8X');assert.ok(bytes[20]&0x10);
   assert.equal(bytes.readUIntLE(24,3)+1,256);assert.equal(bytes.readUIntLE(27,3)+1,256);
   const hash=crypto.createHash('sha256').update(bytes).digest('hex');assert.equal(hash,a.sha256);hashes.add(hash);assert.equal(a.alphaPreservedExactly,true);
   for(const base of ['./','/monopoly/'])assert.equal(new URL(materialIconUrl(a.group,a.tier-1,base),'https://example.test/monopoly/').pathname,'/monopoly/'+a.file);
   const html=materialLabel(a.group,a.tier-1);assert.ok(html.includes(a.name));assert.ok(html.includes(a.file));
  }
  assert.equal(hashes.size,18);assert.equal(materialIconUrl('玉',3),'');
  for(const [id,file] of Object.entries({'jade-2':'jade-2-v3.png','jade-3':'jade-3-v2.png','copper-2':'copper-2-v2.png','copper-3':'copper-3-v2.png','silk-2':'silk-2-v2.png','silk-3':'silk-3-v2.png'}))assert.equal(report.assets.find(a=>a.id===id).sourceFile,file);
 });
 await test('Synthesis inventory and both recipe names show art; actual 10:1 synthesis still consumes the correct tier',async()=>{
  const state=createGameState('liu',null),lord=state.lords.liu;
  MATERIAL_GROUPS.forEach(k=>lord.materials[k]=[100,0,0]);
  const html=materialsHtml(lord);assert.equal((html.match(/<img /g)||[]).length,18);
  const prompts=[],answers=[0,1,null];const {engine}=make(state,async(_id,p)=>{prompts.push(structuredClone(p));return answers.shift()});
  await engine.materialsFlow(lord);
  assert.equal(prompts[0].choices.length,12);
  for(const choice of prompts[0].choices)assert.equal((choice.label.match(/<img /g)||[]).length,2);
  assert.equal((prompts[1].text.match(/<img /g)||[]).length,2);
  assert.deepEqual(lord.materials.魄,[90,1,0]);assert.deepEqual(lord.materials.玉,[100,0,0]);
  const wire=JSON.parse(JSON.stringify(prompts));
  assert.deepEqual(wire[0].choices.map(c=>c.label),prompts[0].choices.map(c=>c.label));assert.equal(wire[1].text,prompts[1].text);
 });
 await test('City mining choices show all six base icons and keep selection functional',async()=>{
  const state=createGameState('liu',null),lord=state.lords.liu,city=Object.values(state.cities).find(c=>c.owner==='liu'),prompts=[];
  const {engine}=make(state,async(_id,p)=>{prompts.push(p);return 5});
  await engine.chooseMining(lord,city,true);assert.equal(city.mining,'玉');
  assert.equal(prompts.length,1);assert.equal(prompts[0].choices.length,6);
  prompts[0].choices.forEach((c,i)=>{assert.ok(c.label.includes(MATERIAL_NAMES[MATERIAL_GROUPS[i]][0]));assert.ok(c.label.includes(materialIconUrl(MATERIAL_GROUPS[i],0)))});
 });
 await test('All six weapon-material families show the correct required tier beside the name through three real upgrades',async()=>{
  const state=createGameState('liu',null),lord=state.lords.liu;
  MATERIAL_GROUPS.forEach(k=>lord.materials[k]=[100,100,100]);
  for(const group of MATERIAL_GROUPS){
   const id=Object.keys(WEAPON_CATALOG).find(id=>WEAPON_CATALOG[id].material===group);
   const general={...state.generals.liubei,id,weapon:makePersonalWeapon(id,0)};
   for(let stage=0;stage<3;stage++){
    const prompts=[];const {engine}=make(state,async(_id,p)=>{prompts.push(p);return p.kind==='confirm'?true:null});
    await engine.rosterAction(lord,'upgrade',general);assert.equal(weaponGrade(general.weapon),stage+1);
    assert.equal(prompts[0].kind,'confirm');assert.ok(prompts[0].text.includes(MATERIAL_NAMES[group][stage]));assert.ok(prompts[0].text.includes(materialIconUrl(group,stage)));
   }
  }
 });
 console.log('PASS '+passed+' casino/relic/material-art integration checks');
})().catch(e=>{console.error(e);process.exitCode=1});
