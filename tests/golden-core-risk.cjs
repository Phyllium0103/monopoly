const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {registerHooks,stripTypeScriptTypes}=require('node:module');
registerHooks({resolve(s,c,n){if(s.startsWith('.')&&!path.extname(s)&&c.parentURL){const p=new URL(s+'.ts',c.parentURL);if(fs.existsSync(p))return n(p.href,c);}return n(s,c);},load(u,c,n){return u.endsWith('.ts')?{format:'module',shortCircuit:true,source:stripTypeScriptTypes(fs.readFileSync(new URL(u),'utf8'),{mode:'transform'})}:n(u,c);}});
const {createGameState}=require('../src/game/GameState.ts');
const {bindPassiveState}=require('../src/data/passives.ts');
const {GOLDEN_CORES,goldenCoreChance,BREAKTHROUGH_TITLES}=require('../src/data/breakthroughRules.ts');
const G=require('../src/systems/GeneralSystem.ts');
const {aiBreakthroughs}=require('../src/systems/AISystem.ts');
const {Engine}=require('../src/engine/Engine.ts'),{RecordingView}=require('../src/engine/view.ts');
const {isBreakthroughFailure}=require('../src/ui/BreakthroughFlight.ts');
const state=createGameState('liu'),seed=structuredClone(state.generals.liubei);
function candidate(core,aptitude,isLord=false){
  const g=structuredClone(seed);Object.assign(g,{realm:2,goldenCore:core,aptitude,isLord,foundation:true,coreBonus:undefined,demon:0,status:'free'});
  state.generals[g.id]=g;bindPassiveState(state);g.exp=G.expCap(g);g.hp=G.maxHp(g);return g;
}
(async()=>{
const random=Math.random;
try {
 for(const [core,def] of Object.entries(GOLDEN_CORES))for(const aptitude of ['heaven','metal','wood','water','fire','earth','waste']){
   const expected=core==='heavenly'?.5:core==='flawless'?(aptitude==='heaven'?.7:aptitude==='waste'?.3:.5):(aptitude==='heaven'?.9:aptitude==='waste'?.5:.75);
   assert.equal(goldenCoreChance(core,aptitude),expected);
   let g=candidate(core,aptitude);
   if(core==='heavenly'&&aptitude!=='heaven'){
     assert.equal(G.canAttemptBreak(g,1).ok,false);const before=structuredClone(g);
     Math.random=()=>{throw Error('ineligible core must not roll')};assert.equal(G.completeBreak(g,1),false);assert.deepEqual(g,before);continue;
   }
   assert.equal(G.breakChance(g),expected,'foundation pill must not guarantee a golden core');
   const base={...g.base},gear=structuredClone([g.weapon,g.armor,g.technique]),cap=g.exp,maximum=G.maxHp(g);
   Math.random=()=>expected;
   assert.equal(G.completeBreak(g,7),false,'roll exactly at probability is failure');
   assert.equal(g.realm,2);assert.equal(g.exp,Math.round(cap*.75));assert.equal(g.hp,Math.max(1,maximum-Math.round(maximum*.5)));
   assert.equal(g.goldenCore,core);assert.equal(g.coreBonus,undefined);assert.equal(g.failedRound,7);
   assert.deepEqual(g.base,base);assert.deepEqual([g.weapon,g.armor,g.technique],gear);
   Math.random=()=>{throw Error('insufficient exp must not roll')};assert.equal(G.completeBreak(g,8),false);
   g=candidate(core,aptitude);Math.random=()=>expected-Number.EPSILON;
   assert.equal(G.completeBreak(g,8),true);assert.equal(g.realm,3);assert.equal(g.exp,0);
   for(const key of ['force','alchemy','forging','talisman','formation'])assert.equal(g.base[key],base[key]+(def.stat==='all'||def.stat===key?def.gain:0));
 }
 const low=candidate('heavenly','heaven',true);low.hp=1;const cap=low.exp;Math.random=()=>.99;
 assert.equal(G.completeBreak(low,1),false);assert.equal(low.hp,1);assert.equal(low.exp,Math.round(cap*.75));assert.equal(cap,GOLDEN_CORES.heavenly.exp*2);
 const demon=candidate('blood','heaven');demon.demon=1;Math.random=()=>{throw Error('heart demon must not roll')};assert.equal(G.completeBreak(demon,1),false);
 console.log('PASS all seven core routes and seven aptitudes: exact probability boundaries, 25% exp / 50% max HP loss, 1 HP floor, lord caps, no accidental bonus/equipment loss, core eligibility and demon gate');

 Math.random=random;
 const aiState=createGameState('liu'),lord=aiState.lords.liu;bindPassiveState(aiState);
 for(const g of Object.values(aiState.generals))g.status='realm';
 const ai=aiState.generals.liubei;Object.assign(ai,{realm:2,goldenCore:'flawless',aptitude:'waste',status:'free'});ai.exp=G.expCap(ai);ai.hp=G.maxHp(ai);
 Math.random=()=>.9;await aiBreakthroughs(aiState,lord);assert.equal(ai.realm,2);assert.equal(ai.exp,Math.round(G.expCap(ai)*.75));
 ai.exp=G.expCap(ai);Math.random=()=>.29;await aiBreakthroughs(aiState,lord);assert.equal(ai.realm,3,'AI must attempt its selected 30% core rather than stall forever');

 Math.random=random;
 const uiState=createGameState('liu'),uiLord=uiState.lords.liu,uiG=uiState.generals.liubei,prompts=[];
 Object.assign(uiG,{realm:2,goldenCore:'heavenly',aptitude:'heaven'});uiG.exp=G.expCap(uiG);uiG.hp=G.maxHp(uiG);
 const engine=new Engine(uiState,{view:new RecordingView(),send:async(_id,p)=>{prompts.push(p);return p.kind==='choose'?6:null;},isAuto:()=>false,multiplayer:false});
 Math.random=()=>.99;await engine.breakthroughFlow(uiLord,uiG);
 const choice=prompts.find(p=>p.kind==='choose');
 assert(choice.text.includes('失敗會損失25%修為，並道基受損，扣除血量50%'));
 assert(!choice.text.includes('已選擇：'));
 assert.deepEqual(choice.choices.map((c,i)=>c.label.includes('core-current')?i:null).filter(i=>i!==null),[6]);
 assert(choice.choices[0].sub.includes('成功率 90%'));assert(choice.choices[5].sub.includes('成功率 70%'));assert(choice.choices[6].sub.includes('成功率 50%'));
 const failure=prompts.find(p=>p.kind==='message');assert.equal(failure.title,BREAKTHROUGH_TITLES[3]);assert.equal(failure.text,'損失25%修為與最大血量的50%。');assert(isBreakthroughFailure(failure.title,failure.text));
 assert.equal(uiG.realm,2);assert.equal(uiG.exp,3600);
 console.log('PASS AI low-chance attempts, player core-choice odds/risk text and correct animated core-failure outcome');
} finally {Math.random=random;}
})().catch(e=>{console.error(e);process.exitCode=1});
