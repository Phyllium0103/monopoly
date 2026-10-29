const fs=require('node:fs'),assert=require('node:assert/strict');
const {registerHooks,stripTypeScriptTypes}=require('node:module');
registerHooks({
 resolve(s,c,n){if(s.startsWith('.')&&!/\.[a-z]+$/i.test(s))return n(s+'.ts',c);return n(s,c)},
 load(u,c,n){if(u.endsWith('.css'))return {format:'module',shortCircuit:true,source:''};return u.endsWith('.ts')?{format:'module',shortCircuit:true,source:stripTypeScriptTypes(fs.readFileSync(new URL(u),'utf8'),{mode:'transform'})}:n(u,c)}
});
const listeners=new Map(),frames=new Map(),timers=new Map();let clock=0,serial=0;
class Element {
 constructor(){this.children=[];this.hidden=false;this.dataset={};this.textContent='';this.classList={add(){},remove(){}};}
 setAttribute(){} append(...xs){this.children.push(...xs)} prepend(x){this.children.unshift(x)}
 replaceChildren(...xs){this.children=xs;} remove(){} get clientWidth(){return 1280}get clientHeight(){return 720}
}
global.document={hidden:false,createElement:()=>new Element(),addEventListener:(name,cb)=>listeners.set(name,cb)};
global.window={matchMedia:()=>({matches:false}),devicePixelRatio:1,setTimeout:cb=>{const id=++serial;timers.set(id,cb);return id}};
global.clearTimeout=id=>timers.delete(id);
global.requestAnimationFrame=cb=>{const id=++serial;frames.set(id,cb);return id};global.cancelAnimationFrame=id=>frames.delete(id);
global.ResizeObserver=class{observe(){}disconnect(){}};
global.performance={now:()=>clock};
const {DiceRoller}=require('../src/ui/DiceRoller.ts');
async function flush(){for(let i=0;i<8;i++)await Promise.resolve()}
function tick(now){clock=now;const callbacks=[...frames.values()];frames.clear();callbacks.forEach(cb=>cb(now));}
(async()=>{
 const roller=new DiceRoller(new Element());
 // Geometry and GLB loading are tested separately; exercise the numeric backend
 // here so lifecycle correctness does not depend on a GPU in CI.
 roller.unavailable=true;
 document.hidden=true;
 await roller.roll([6]);assert.equal(frames.size,0);assert.equal(roller.stage.hidden,true);
 document.hidden=false;
 let completed=false;const p=roller.roll([2,5],2,2).then(()=>completed=true);await flush();
 tick(0);assert.equal(roller.caption.children[0].textContent,'18 步');assert.equal(completed,false);
 tick(1200);await p;assert.equal(completed,true);assert.equal(frames.size,0);assert.equal(roller.stage.hidden,true);
 console.log('PASS normal roll resolves after its authoritative result; numeric fallback and hidden host do not block');
 let cancelled=false;const old=roller.roll([1]).then(()=>cancelled=true);await flush();
 document.hidden=true;listeners.get('visibilitychange')();await old;
 assert.equal(cancelled,true);assert.equal(frames.size,0);assert.equal(roller.stage.hidden,true);
 document.hidden=false;
 const first=roller.roll([3]);await flush();const second=roller.roll([4]);await first;roller.cancel();await second;
 assert.equal(frames.size,0);assert.equal(timers.size,0);
 roller.startWaiting();assert.equal(timers.size,1);roller.startWaiting();assert.equal(timers.size,1);
 [...timers.values()][0]();assert.equal(roller.stage.hidden,true);assert.equal(timers.size,0);
 console.log('PASS hiding, reset, overlapping rolls and multiplayer waiting timeout resolve without orphan timers');
 const {Vector3,Quaternion}=require('three');
 roller.physics={playbackDuration:1,frames:[[{position:new Vector3(0,.5,0),rotation:new Quaternion(),linearVelocity:new Vector3(0,-1,0)}]],labelRotations:[new Quaternion()]};
 assert.doesNotThrow(()=>roller.draw(-.002),'first RAF may be earlier than start');
 roller.physics=null;
 console.log('PASS negative first-frame timestamps cannot freeze a live roll');
 await roller.roll([0]);await roller.roll([]);assert.equal(roller.stage.hidden,true);
 console.log('PASS invalid presentation inputs leave the game unblocked');
})().catch(error=>{console.error(error);process.exitCode=1});
