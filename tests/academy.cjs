const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const{registerHooks,stripTypeScriptTypes}=require('node:module');const{pathToFileURL,fileURLToPath}=require('node:url');
registerHooks({resolve(s,c,n){if(s.startsWith('.')&&!path.extname(s)&&c.parentURL){const p=path.resolve(path.dirname(fileURLToPath(c.parentURL)),s+'.ts');if(fs.existsSync(p))return n(pathToFileURL(p).href,c);}return n(s,c);},load(u,c,n){if(u.endsWith('.css'))return{format:'module',shortCircuit:true,source:''};return u.endsWith('.ts')?{format:'module',shortCircuit:true,source:stripTypeScriptTypes(fs.readFileSync(fileURLToPath(u),'utf8'),{mode:'transform'})}:n(u,c);}});
const{createGameState}=require('../src/game/GameState.ts');
const{bindPassiveState}=require('../src/data/passives.ts');
const{beginTraining,trainBatch,trainingGenerals,TRAINING_COURSES,academyAt}=require('../src/systems/TrainingSystem.ts');
const{attack,defense,maxHp,totalCraft,power}=require('../src/systems/GeneralSystem.ts');
const{Engine}=require('../src/engine/Engine.ts');
const{DISPLAY_FACILITY_LOTS}=require('../src/data/displayFacilities.ts');
const{defaultAnswer}=require('../src/engine/prompts.ts');
(async()=>{
 const state=createGameState('liu'),lord=state.lords.liu;bindPassiveState(state);lord.stones=100000;
 const gens=trainingGenerals(state,lord);assert(gens.length>=5);
 for(const kind of ['martial','arts']){
  const visit=beginTraining(kind);assert.equal(TRAINING_COURSES[kind].length,5);
  const courses=TRAINING_COURSES[kind],before=gens.slice(0,5).map(g=>({...g.base})),balance=lord.stones;
  assert(trainBatch(state,lord,visit,courses.map((c,i)=>({courseId:c.id,generalId:gens[i].id})),()=>0).ok);
  assert.equal(lord.stones,balance-courses.reduce((n,c)=>n+c.price,0));
  courses.forEach((c,i)=>c.gains.forEach(x=>assert.equal(gens[i].base[x.stat]-before[i][x.stat],x.min)));
  assert.equal(visit.results.length,5);assert(!trainBatch(state,lord,visit,[{courseId:courses[0].id,generalId:gens[0].id}]).ok);
 }
 for(const kind of ['martial','arts']){const visit=beginTraining(kind),courses=TRAINING_COURSES[kind],before=gens.slice(0,5).map(g=>({...g.base}));assert(trainBatch(state,lord,visit,courses.map((c,i)=>({courseId:c.id,generalId:gens[i].id})),()=>1-Number.EPSILON).ok);courses.forEach((c,i)=>c.gains.forEach(x=>assert.equal(gens[i].base[x.stat]-before[i][x.stat],x.max)));}
 assert.equal(power(gens[0]),Math.round(attack(gens[0])*2+defense(gens[0])+maxHp(gens[0])/10));
 const empty=beginTraining('martial'),g=gens[0];
 const reject=assignments=>{const before=JSON.stringify(state);let draws=0;assert(!trainBatch(state,lord,empty,assignments,()=>{draws++;return 0}).ok);assert.equal(JSON.stringify(state),before);assert.equal(draws,0);};
 reject([{courseId:'bad',generalId:g.id}]);reject([{courseId:'spear',generalId:g.id},{courseId:'stance',generalId:g.id}]);reject([{courseId:'spear',generalId:g.id},{courseId:'spear',generalId:gens[1].id}]);
 lord.stones=0;reject([{courseId:'spear',generalId:g.id}]);lord.stones=10000;
 const oldOwner=g.owner;g.owner='cao';reject([{courseId:'spear',generalId:g.id}]);g.owner=oldOwner;
 const oldStatus=g.status;g.status='dead';reject([{courseId:'spear',generalId:g.id}]);g.status=oldStatus;
 assert.deepEqual(defaultAnswer({kind:'training'}),{type:'leave'});
 const lots=DISPLAY_FACILITY_LOTS.filter(l=>['martial','arts'].includes(l.type));assert.equal(lots.length,8);for(const l of lots)for(const t of l.frontageTiles)assert.equal(academyAt(t),l.type);
 const actions=[{type:'train-batch',assignments:[{courseId:'spear',generalId:g.id},{courseId:'stance',generalId:g.id}]},{type:'train-batch',assignments:[{courseId:'spear',generalId:g.id}]},{type:'leave'}];const logs=[],phases=[];const engine=new Engine(state,{view:new Proxy({},{get:(_,key)=>key==='log'?(m)=>logs.push(m):()=>{}}),send:async(_,p)=>{assert.equal(p.kind,'training');phases.push(p.phase);return actions.shift();},isAuto:()=>false,multiplayer:false});
 await engine.trainingFlow(lord,'martial');assert.deepEqual(phases,['assign','assign','result']);assert.equal(logs.length,1);assert.equal(lord.stones,7500);
 console.log('PASS five courses, range endpoints, permanent base gains, duplicate/ownership/funds validation, eight academy frontages, engine loop and new power formula');
})().catch(e=>{console.error(e);process.exit(1)});
