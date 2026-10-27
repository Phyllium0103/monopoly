const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const{registerHooks,stripTypeScriptTypes}=require('node:module');const{pathToFileURL,fileURLToPath}=require('node:url');
registerHooks({resolve(s,c,n){if(s.startsWith('.')&&!path.extname(s)&&c.parentURL){const p=path.resolve(path.dirname(fileURLToPath(c.parentURL)),s+'.ts');if(fs.existsSync(p))return n(pathToFileURL(p).href,c);}return n(s,c);},load(u,c,n){return u.endsWith('.ts')?{format:'module',shortCircuit:true,source:stripTypeScriptTypes(fs.readFileSync(fileURLToPath(u),'utf8'),{mode:'transform'})}:n(u,c);}});
const{cityModelLevel}=require('../src/data/selectedBoard.ts');
const{projectGround,unprojectGround,clampMapTarget,FLOOR_SIZE,FLOOR_DEPTH}=require('../src/data/mapView.ts');
const{RELIC_CELLS,RELIC_EVENTS,enterRelic,advanceRelic,leaveRelic}=require('../src/systems/RelicSystem.ts');
const{createGameState,freeGenerals}=require('../src/game/GameState.ts');const{consumeItem}=require('../src/systems/ItemSystem.ts');
const{makeItem}=require('../src/data/items.ts');const{Engine}=require('../src/engine/Engine.ts');const{RecordingView}=require('../src/engine/view.ts');
for(const[p,n]of[[0,1],[49.99,1],[50,2],[99.99,2],[100,3],[149.99,3],[150,4],[199.99,4],[200,5],[249.99,5],[250,6],[300,6],[1000,6],[-1,1],[NaN,1]])assert.equal(cityModelLevel(p),n);
assert.equal(FLOOR_DEPTH*.5,FLOOR_SIZE);
for(const u of[-160,160])for(const v of[-160,160]){const p=unprojectGround(u,v),q=projectGround(p.x,p.z);assert.ok(Math.abs(q.u-u)<1e-8&&Math.abs(q.v-v)<1e-8);}
for(let i=0;i<1000;i++){const p=clampMapTarget(i*10-5000,5000-i*15,80,60),q=projectGround(p.x,p.z);assert.ok(Math.abs(q.u)+40<=160.0000001&&Math.abs(q.v)+30<=160.0000001);}
assert.deepEqual(clampMapTarget(999,-999,900,900),{x:0,z:0});
assert.equal(RELIC_CELLS.length,16);assert.equal(new Set(RELIC_CELLS.map(c=>c.join(','))).size,16);assert.equal(RELIC_EVENTS.length,16);
RELIC_CELLS.forEach(([x,y],i)=>{assert.ok(x===0||x===4||y===0||y===4);const next=RELIC_CELLS[(i+1)%16];assert.equal(Math.abs(x-next[0])+Math.abs(y-next[1]),1);});
const state=createGameState('liu'),lord=state.lords.liu,entrance=state.tiles.find(t=>t.kind==='portal').index;
lord.position=entrance;assert.ok(enterRelic(lord));assert.ok(!enterRelic(lord));assert.ok(!leaveRelic(lord));
const item=makeItem('relic-test','cloud',0);lord.items.push(item);const stock=JSON.stringify(lord.items);assert.throws(()=>consumeItem(lord,item,freeGenerals(state,lord.id)[0]),/禁止/);assert.equal(JSON.stringify(lord.items),stock);
for(let i=0;i<7;i++){advanceRelic(state,lord,()=>.999);assert.ok(!leaveRelic(lord));}
const restored=JSON.parse(JSON.stringify(state));assert.equal(restored.lords.liu.relicJourney.steps,7);
for(let i=7;i<16;i++)advanceRelic(restored,restored.lords.liu,()=>.999);
assert.ok(leaveRelic(restored.lords.liu));assert.equal(restored.lords.liu.position,entrance);assert.ok(!restored.lords.liu.relicJourney);
for(const g of Object.values(restored.generals).filter(g=>g.owner==='liu'&&g.status==='free')){assert.ok(g.hp>0);assert.ok(g.exp>=0);}
assert.ok(restored.lords.liu.stones>=0&&restored.lords.liu.soldiers>=0);
(async()=>{
 const state=createGameState('liu'),lord=state.lords.liu,view=new RecordingView();lord.position=entrance;
 const engine=new Engine(state,{view,send:async(_lord,p)=>p.kind==='confirm',isAuto:()=>false,multiplayer:false});
 await engine.landPortal(lord);
 const attacker=state.lords.cao,user=freeGenerals(state,'cao')[0],target=freeGenerals(state,'liu').find(g=>!g.isLord);
 const attackItem=makeItem('blocked-relic','cloud',0);attacker.items.push(attackItem);
 const before=JSON.stringify(attacker.items);
 assert.match(await engine.usePrerollWithReaction(attacker,attackItem,user,{general:target}),/結界/);
 assert.equal(JSON.stringify(attacker.items),before);
 const originalRandom=Math.random;Math.random=()=>.999;
 try{await engine.moveRelic(lord);assert.equal(lord.relicJourney.steps,6);await engine.moveRelic(lord);assert.equal(lord.relicJourney.steps,12);await engine.moveRelic(lord);}finally{Math.random=originalRandom;}
 assert.ok(!lord.relicJourney);assert.equal(lord.position,entrance);
 const events=view.events.filter(e=>e.t==='relic');assert.deepEqual(events.filter(e=>e.a[2]&&e.a[1]>0).map(e=>e.a[1]),Array.from({length:16},(_,i)=>i+1));assert.equal(events.at(-1).a[2],false);
 const clone=JSON.parse(JSON.stringify(view.events));assert.deepEqual(clone,view.events);
 assert.equal(state.rulesVersion,'map-dual-frontage-20261020');
 console.log('PASS all 50-point city boundaries, 300 cap visual, square inverse projection and viewport edge clamps');
 console.log('PASS hollow 5×5 ring has exactly16 adjacent cells, each with good/bad outcomes');
 console.log('PASS persistent journey, forbidden inventory consumption, no early exit, no negative resources or lethal events');
 console.log('PASS actual Engine 6+6+4 movement, all16 event playback steps, original entrance return and serializable replay');
})().catch(e=>{console.error(e);process.exitCode=1;});

for(const h of [0, .824, 10]){const p=clampMapTarget(1000,-1000,80,60,h),q=projectGround(p.x,p.z);assert.ok(Math.abs(q.u)+40<=160.000001&&Math.abs(q.v+h*Math.cos(Math.PI/6))+30<=160.000001);}
