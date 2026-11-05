const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {registerHooks,stripTypeScriptTypes}=require('node:module');
const {pathToFileURL,fileURLToPath}=require('node:url');
registerHooks({resolve(s,c,n){if(s.startsWith('.')&&!path.extname(s)&&c.parentURL){const p=path.resolve(path.dirname(fileURLToPath(c.parentURL)),s+'.ts');if(fs.existsSync(p))return n(pathToFileURL(p).href,c);}return n(s,c);},load(u,c,n){return u.endsWith('.ts')?{format:'module',shortCircuit:true,source:stripTypeScriptTypes(fs.readFileSync(fileURLToPath(u),'utf8'),{mode:'transform'})}:n(u,c);}});
const {createGameState}=require('../src/game/GameState.ts');
const {expCap,canAttemptBreak}=require('../src/systems/GeneralSystem.ts');
const {Engine}=require('../src/engine/Engine.ts'),{RecordingView}=require('../src/engine/view.ts');
(async()=>{
 const state=createGameState('liu'),lord=state.lords.liu;
 const own=Object.values(state.generals).find(g=>g.owner===lord.id&&g.status==='sect');
 const enemy=state.generals.caocao;own.exp=expCap(own);enemy.exp=expCap(enemy);
 const priorRealm=own.realm,enemyRealm=enemy.realm,actions=[{type:'break-general',generalId:enemy.id},{type:'break-general',generalId:own.id},{type:'roll'}],prompts=[];
 const engine=new Engine(state,{view:new RecordingView(),send:async(_id,p)=>{prompts.push(p);if(p.kind==='preroll')return actions.shift();if(p.kind==='confirm')return true;return null;},isAuto:()=>false,multiplayer:false});
 const oldRandom=Math.random;try{Math.random=()=>0;await engine.prerollPhase(lord);}finally{Math.random=oldRandom;}
 assert.equal(enemy.realm,enemyRealm,'other lords cannot be upgraded');assert.equal(own.realm,priorRealm+1,'owned non-party general can break through');
 assert.equal(own.status,'sect','non-party status is preserved');assert.equal(canAttemptBreak(own,state.round).ok,false,'temporary portrait no longer qualifies');
 assert.equal(prompts.filter(p=>p.kind==='confirm').length,1,'existing breakthrough confirmation is retained');
 console.log('PASS direct breakthrough validates ownership, preserves confirmation and handles non-party generals');
})().catch(e=>{console.error(e);process.exitCode=1});
