const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {registerHooks,stripTypeScriptTypes}=require('node:module');
registerHooks({resolve(s,c,n){if(s.startsWith('.')&&!path.extname(s)&&c.parentURL){const p=new URL(s+'.ts',c.parentURL);if(fs.existsSync(p))return n(p.href,c);}return n(s,c);},load(u,c,n){if(u.endsWith('/net/supabase.ts'))return {format:'module',shortCircuit:true,source:'export const projectKey=x=>x,localP2P=()=>false,supabase=()=>null,multiplayerAvailable=()=>false;'};if(u.endsWith('.css'))return {format:'module',shortCircuit:true,source:''};return u.endsWith('.ts')?{format:'module',shortCircuit:true,source:stripTypeScriptTypes(fs.readFileSync(new URL(u),'utf8'),{mode:'transform'})}:n(u,c);}});
const {createGameState}=require('../src/game/GameState.ts');
const {Engine}=require('../src/engine/Engine.ts'),{RecordingView}=require('../src/engine/view.ts');
const G=require('../src/systems/GeneralSystem.ts');
const {bindPassiveState}=require('../src/data/passives.ts');
const {WORLD}=require('../src/systems/WorldMods.ts');
const {makeItem,ITEM_DEFS,PILL_IDS}=require('../src/data/items.ts');
const {usePreroll}=require('../src/systems/ItemSystem.ts');
const {startTurn}=require('../src/game/TurnManager.ts');
(async()=>{
 const state=createGameState('liu'),lord=state.lords.liu;
 const g=state.generals.liubei;bindPassiveState(state);
 Object.assign(g,{isLord:false,aptitude:'metal',technique:null,exp:0});
 // Compare statuses with the same general, so personal passives cannot hide a regression.
 const city=Object.values(state.cities)[0];
 for(const prosperity of [0,90,300]){city.prosperity=prosperity;g.status='garrison';assert.equal(G.passiveExp(g,city),60);}
 g.status='free';assert.equal(G.passiveExp(g,null),30);
 for(const status of ['sect','realm','dead']){g.status=status;assert.equal(G.passiveExp(g,city),0);}
 g.status='garrison';lord.talents={c_garrison:3};assert.equal(G.passiveExp(g,city),69);
 WORLD.garrisonExpMult=1.5;assert.equal(G.passiveExp(g,city),104);WORLD.garrisonExpMult=1;lord.talents={};
 for(let realm=0;realm<10;realm++){const a={...g,realm,isLord:false,mortalTrial:undefined};assert.equal(G.expCap({...a,isLord:true}),G.expCap(a)*2);}
 console.log('PASS fixed 60/30/0 cultivation; prosperity ignored; garrison talent and tide apply; lord caps doubled');
 g.status='free';g.demon=0;const normal=G.expMultiplier(g);g.demon=1;
 assert.equal(G.expMultiplier(g),normal/2);assert.equal(G.addExp(g,100),Math.round(50*normal));
 for(const realm of [0,1,2,3,4,5,6,7,8]){
  Object.assign(g,{realm,exp:G.expCap({...g,realm}),ward:.4,sevenLife:true});
  const before=structuredClone(g);assert.equal(G.canAttemptBreak(g,1).ok,false);
  assert.equal(G.attemptBreak(g,1),false);G.levelUp(g);assert.deepEqual(g,before);
  const result=await G.tribulation(g);assert.equal(result.success,false);assert.deepEqual(g,before);
 }
 Object.assign(g,{realm:0,exp:0,status:'sect'});const before=g.exp;await startTurn(state,lord);assert.equal(g.exp,before);
 g.mortalTrial={turns:1,weapon:null};await startTurn(state,lord);assert.equal(g.mortalTrial.turns,1);assert.equal(g.realm,0);delete g.mortalTrial;
 g.status='free';g.base.alchemy=200;g.stamina=100;
 assert.ok(PILL_IDS.includes('clearmind'));assert.ok(ITEM_DEFS.demon);assert.equal(ITEM_DEFS.illusion,undefined);
 const pill=makeItem('clear','clearmind',0);lord.items=[pill];await usePreroll(state,lord,pill,g,{general:g});assert.equal(g.demon,0);
 assert.equal(G.expMultiplier(g),normal);
 console.log('PASS all breakthrough routes blocked without consuming protection; sect turn yields zero; clear pill restores normal gains');
 {const target=state.lords.cao,pool=Object.values(state.generals).filter(x=>x.owner==='cao'&&x.status!=='realm'&&!x.ghostSourceId); for(const x of pool)x.demon=0;const talisman=makeItem('curse','demon',0);lord.items=[talisman];g.base.talisman=200;g.stamina=100;await usePreroll(state,lord,talisman,g,{lord:target});assert.equal(pool.filter(x=>x.demon).length,Math.min(2,pool.length));}
 {
  const s=createGameState('liu'),l=s.lords.liu,g=s.generals.liubei,e=new Engine(s,{view:new RecordingView(),send:async()=>null,isAuto:()=>false,multiplayer:false});
  g.realm=0;g.exp=G.expCap(g);g.demon=0;
  let confirms=0;e.dlg=()=>({confirm:async()=>{confirms++;return false;},message:async()=>{},choose:async()=>null});
  await e.breakthroughFlow(l,g);assert.equal(confirms,1);assert.equal(g.realm,0);
  const original=Math.random;Math.random=()=>0;
  try{await e.breakthroughFlow(l,g,true);}finally{Math.random=original;}
  assert.equal(confirms,1);assert.equal(g.realm,1);
  console.log('PASS left click confirms; right click breaks through directly');
 }
 const random=Math.random;
 try{
  for(const multiplayer of [false,true])for(const human of [false,true])for(const kind of ['duel','alchemy']){
   const s=createGameState('liu'),a=s.lords.liu,d=s.lords.cao,c=Object.values(s.cities).find(c=>c.owner==='cao');
   const guards=Object.values(s.generals).filter(g=>!g.isLord).slice(0,3);
   c.garrisonGenerals=guards.map(g=>g.id);c.garrisonSoldiers=103;
   for(const g of guards)Object.assign(g,{owner:'cao',status:'garrison',cityId:c.id,demon:0,base:{...g.base,force:1,alchemy:1}});
   const atk=s.generals.liubei;atk.base.force=100000;atk.base.alchemy=100000;
   const e=new Engine(s,{view:new RecordingView(),send:async()=>null,isAuto:()=>false,multiplayer});
   e.human=l=>l.id==='cao'&&human;e.dlg=()=>({choose:async()=>'flee'});
   const rolls=human?[.49,.5,0]:[0,.49,.5,0];Math.random=()=>{assert.ok(rolls.length,'one independent roll per guard');return rolls.shift();};
   const soldiers=a.soldiers;assert.equal(await e.fight(a,c,kind,[atk]),true);
   assert.equal(c.garrisonSoldiers,78);assert.equal(a.soldiers,soldiers+25);assert.equal(c.owner,'cao');
   assert.deepEqual(guards.map(g=>g.demon),[1,0,1]);assert.equal(rolls.length,0);Math.random=random;
  }
 }finally{Math.random=random;}
 console.log('PASS solo/online and human/AI flee: independent 50% per guard, including the 0.5 boundary; soldier defection retained');
})().catch(e=>{console.error(e);process.exitCode=1;});
