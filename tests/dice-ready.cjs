const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {registerHooks,stripTypeScriptTypes}=require('node:module');
registerHooks({resolve(s,c,n){if(s.startsWith('.')&&!path.extname(s)&&c.parentURL){const p=new URL(s+'.ts',c.parentURL);if(fs.existsSync(p))return n(p.href,c);}return n(s,c);},load(u,c,n){if(u.endsWith('/Music.ts'))return {format:'module',shortCircuit:true,source:'export const music={};'};if(u.endsWith('.css')||u.endsWith('/Bubble.ts'))return {format:'module',shortCircuit:true,source:''};return u.endsWith('.ts')?{format:'module',shortCircuit:true,source:stripTypeScriptTypes(fs.readFileSync(new URL(u),'utf8'),{mode:'transform'})}:n(u,c);}});
const THREE=require('three');
const {GLTFLoader}=require('three/addons/loaders/GLTFLoader.js');
const {batchDiceModel}=require('../src/world/DiceModel.ts');
const {simulateDiceRoll,sampleDicePhysics,upperDiceFace,withDiceValues}=require('../src/world/DicePhysics.ts');
const {DiceRoller,topDropLaunch}=require('../src/ui/DiceRoller.ts');
const {GameUI}=require('../src/ui/GameUI.ts');
let seed=17;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/0x100000000);
class Element{
 constructor(){this.dataset={};this.hidden=false;this.children=[];this.classList={add(){},remove(){}};}
 append(...xs){this.children.push(...xs)}setAttribute(){}getBoundingClientRect(){return this.rect??{width:1280,height:720};}
}
(async()=>{
 const file=fs.readFileSync(path.join(__dirname,'../public/art/dice/ivory-recessed.glb'));
 const {scene}=await new GLTFLoader().parseAsync(file.buffer.slice(file.byteOffset,file.byteOffset+file.byteLength),'');
 const meshes=root=>{const result=[];root.traverse(o=>{if(o.isMesh)result.push(o);});return result;};
 const triangles=root=>meshes(root).reduce((n,m)=>n+(m.geometry.index?.count??m.geometry.attributes.position.count)/3,0);
 const before=new THREE.Box3().setFromObject(scene),batched=batchDiceModel(scene),after=new THREE.Box3().setFromObject(batched);
 assert.equal(meshes(scene).length,22);assert.equal(meshes(batched).length,3);assert.equal(triangles(scene),triangles(batched));
 assert.ok(before.getSize(new THREE.Vector3()).distanceTo(after.getSize(new THREE.Vector3()))<1e-6);
 assert.ok(after.getCenter(new THREE.Vector3()).length()<1e-6);assert.equal(new Set(meshes(batched).map(m=>m.material)).size,3);
 console.log('PASS real dice GLB: 22 meshes -> 3 material batches, exact triangles, dimensions, pips and materials preserved');
 const physical=await simulateDiceRoll([1,1,1],random,topDropLaunch(false,3)),relabeled=withDiceValues(physical,[2,4,6]);
 assert.equal(relabeled.frames,physical.frames);assert.deepEqual(relabeled.values,[2,4,6]);
 assert.deepEqual(sampleDicePhysics(relabeled,relabeled.playbackDuration).map(p=>upperDiceFace(p.rotation).value),[2,4,6]);
 assert.deepEqual(physical.values,[1,1,1]);assert.throws(()=>withDiceValues(physical,[1,2]),RangeError);
 const first=physical.frames[0];assert.ok(first[0].position.x<first[1].position.x&&first[1].position.x<first[2].position.x);assert.ok(first[1].position.z>first[0].position.z,'trio has a triangular launch instead of a repeated two-die line');
 console.log('PASS prepared trio motion keeps exact physical poses, independent authoritative faces and count-specific launch');
 for(let sample=1;sample<=12;sample++){seed=sample;const trial=await simulateDiceRoll([2,3,4],random,topDropLaunch(false,3));assert.equal(trial.values.length,3);}
 console.log('PASS twelve independent three-die launch seeds settle without numeric fallback');
 const order=[];let ready;const prepared=new Promise(r=>ready=r),ui={rollVersion:0,speed:1,dice:{prepareRoll(){order.push('prepare');return prepared;},async roll(v,b,m,s,h,o,p){assert.equal(p,prepared);assert.equal(o.ndc[0],.2);order.push('dice');}},actors:{async playRoll(id,drop){order.push('actor');await drop({ndc:[.2,-.5],diameterPx:20});}}};
 const action=GameUI.prototype.rollDice.call(ui,[2,4,6],0,1,'liu');await Promise.resolve();assert.deepEqual(order,['prepare']);ready(physical);await action;assert.deepEqual(order,['prepare','actor','dice']);
 console.log('PASS worker preparation finishes before the character starts and the exact ready roll reaches hand release');
 let resume;ui.dice.prepareRoll=()=>new Promise(r=>resume=r);const stale=GameUI.prototype.rollDice.call(ui,[2,4,6],0,1,'liu');ui.rollVersion++;resume(physical);await stale;assert.deepEqual(order,['prepare','actor','dice'],'ending/resetting a game cancels a late prepared roll');
 let clock=0,serial=0;const frames=new Map();
 global.document={hidden:false,body:new Element(),createElement:()=>new Element(),addEventListener(){}};
 global.window={matchMedia:()=>({matches:false}),setTimeout,devicePixelRatio:1};global.addEventListener=()=>{};
 global.ResizeObserver=class{observe(){}disconnect(){}};global.performance={now:()=>clock};
 global.requestAnimationFrame=cb=>{frames.set(++serial,cb);return serial;};global.cancelAnimationFrame=id=>frames.delete(id);
 const roller=new DiceRoller(new Element(),{centerFinal:true});roller.renderer={render(){},setPixelRatio(){},setSize(){}};
 roller.stage.hidden=false;roller.physics=relabeled;roller.dice=Array.from({length:3},()=>new THREE.Group());roller.resize();
 const release=roller.playRelease({ndc:[.5,-.5],diameterPx:20},1,roller.version);
 const advance=async time=>{clock=time;const callbacks=[...frames.values()];frames.clear();for(const cb of callbacks)cb(clock);await Promise.resolve();};
 await advance(0);for(const die of roller.dice){const ndc=die.position.clone().project(roller.camera);assert.ok(Math.abs(ndc.y+.5)<1e-6);assert.ok(die.scale.x<.5);}
 await advance(180);assert.equal(roller.stage.dataset.sequencePhase,'hand-release');assert.equal(roller.stage.dataset.diceCount,'3');assert.ok(roller.dice[0].position.distanceTo(roller.dice[2].position)>.3);
 await advance(360);await release;assert.ok(roller.dice.every(d=>Math.abs(d.scale.x-1)<1e-6));assert.equal(frames.size,0);
 for(const [width,height]of [[1280,720],[390,844]]){roller.stage.rect={width,height};roller.resize();for(const p of sampleDicePhysics(relabeled,relabeled.playbackDuration)){const projected=p.position.project(roller.camera);assert.ok(Math.abs(projected.x)+Math.sqrt(3)/2/roller.camera.right<=1,'all three dice fit completely at every viewport width');}}
 const cancelled=roller.playRelease({ndc:[.5,-.5]},1,roller.version);roller.cancel();await cancelled;assert.equal(frames.size,0);
 console.log('PASS three visible palm dice, fan-out, physical descent handoff and cancellation without orphan animation frames');
 const {SelectedTerrain}=require('../src/world/SelectedTerrain.ts'),{CELL_SIZE,ROAD_WIDTH,ROAD_GAP,GRID_SPACING,BUILDING_SIZE}=require('../src/data/selectedBoard.ts');
 const load=THREE.TextureLoader.prototype.load;THREE.TextureLoader.prototype.load=(_url,done)=>{const t=new THREE.Texture();queueMicrotask(()=>done?.(t));return t;};
 try{const terrain=new SelectedTerrain();terrain.road.geometry.computeBoundingBox();const width=terrain.road.geometry.boundingBox.getSize(new THREE.Vector3()).x;assert.ok(Math.abs(width-ROAD_WIDTH)<1e-6&&Math.abs(GRID_SPACING-width-ROAD_GAP)<1e-6);assert.equal(terrain.faces.geometry.parameters.width,CELL_SIZE*.89);}finally{THREE.TextureLoader.prototype.load=load;}
 assert.ok(BUILDING_SIZE>8&&BUILDING_SIZE<2*GRID_SPACING);
 console.log('PASS original road size, spaced centers, preserved clear gap and enlarged buildings');
})().catch(e=>{console.error(e);process.exitCode=1});
