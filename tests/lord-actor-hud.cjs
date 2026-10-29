const fs=require('node:fs'),assert=require('node:assert/strict');
const {registerHooks,stripTypeScriptTypes}=require('node:module');
registerHooks({resolve(s,c,n){if(s.startsWith('.')&&!/\.[a-z]+$/i.test(s))return n(s+'.ts',c);return n(s,c)},load(u,c,n){if(u.endsWith('.css'))return{format:'module',shortCircuit:true,source:''};return u.endsWith('.ts')?{format:'module',shortCircuit:true,source:stripTypeScriptTypes(fs.readFileSync(new URL(u),'utf8'),{mode:'transform'})}:n(u,c)}});
class Element{
 constructor(tag='div'){this.tagName=tag;this.children=[];this.dataset={};this.hidden=false;this.textContent='';this.className='';this.attributes={};this.style={setProperty(){}};this.classList={contains:n=>this.className.split(' ').includes(n),add:n=>this.classList.toggle(n,true),remove:n=>this.classList.toggle(n,false),toggle:(n,on)=>{const x=new Set(this.className.split(' ').filter(Boolean));if(on??!x.has(n))x.add(n);else x.delete(n);this.className=[...x].join(' ')}};}
 append(...xs){for(const x of xs){if(x.parent)x.parent.children=x.parent.children.filter(y=>y!==x);this.children.push(x);x.parent=this;}}
 replaceChildren(...xs){this.children=[];this.append(...xs)} setAttribute(k,v){this.attributes[k]=v}
 addEventListener(){}querySelector(s){return s==='.bottom-panel'?bottom:null}
 getBoundingClientRect(){return{left:100,top:500,width:160,height:this===bottom?80:368}}
}
const bottom=new Element(),listeners=new Map(),frames=new Map(),timers=new Map();let clock=0,serial=0;
global.document={hidden:false,createElement:tag=>new Element(tag),addEventListener:(name,cb)=>listeners.set(name,cb)};
global.innerWidth=1280;global.innerHeight=900;global.devicePixelRatio=1;global.addEventListener=()=>{};
global.ResizeObserver=class{observe(){}};
global.requestAnimationFrame=cb=>{const id=++serial;frames.set(id,cb);return id};global.cancelAnimationFrame=id=>frames.delete(id);
global.performance={now:()=>clock};global.setTimeout=cb=>{const id=++serial;timers.set(id,cb);return id};global.clearTimeout=id=>timers.delete(id);
const {LordActorHud}=require('../src/ui/LordActorHud.ts');
const {createGameState}=require('../src/game/GameState.ts');const {fmtStones}=require('../src/game/Currency.ts');
const {Texture,Sprite,SpriteMaterial}=require('three');
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve()};
async function advance(ms){const end=clock+ms;while(clock<end){clock+=50;const callbacks=[...frames.values()];frames.clear();callbacks.forEach(cb=>cb(clock));await flush()}}
(async()=>{
 const root=new Element(),clicked=[];const hud=new LordActorHud(root,()=>1,id=>clicked.push(id));
 hud.initialization=Promise.resolve();hud.available=false;hud.show(true);
 const state=createGameState('liu');state.lords.liu.stones=12345;state.lords.liu.soldiers=4321;
 hud.update(state,'liu');await flush();
 const a=hud.actors.get('liu');assert.equal(a.card.children[0].children[0].className,'lord-island-artwork');assert.ok(a.card.children[0].children[0].children[0].src.endsWith('/03-tall.webp'),'selected 03 image is used');assert.equal(a.values.length,4);assert.equal(a.values[1].textContent,'4,321');assert.equal(a.values[0].title,fmtStones(12345));
 a.card.children[0].onclick();assert.deepEqual(clicked,['liu']);
 assert.equal(hud.dock.children.at(-1),a.card,'selected player is rightmost');assert.equal(a.card.className,'lord-actor is-current');
 const cards=[...hud.dock.children];hud.update(state,'liu');assert.deepEqual(hud.dock.children,cards,'refresh preserves actual card nodes');
 state.lords.dong.absent=true;hud.update(state,'liu');assert.equal(hud.actors.get('dong').card.hidden,true);
 let drops=0;document.hidden=true;await hud.playRoll('liu',async()=>{drops++});assert.equal(drops,1,'hidden P2P host resolves immediately');
 document.hidden=false;await hud.playRoll('liu',async()=>{drops++});assert.equal(drops,2,'missing cosmetic art cannot block authoritative dice');
 console.log('PASS selected island artwork, four current values, no kingdom/total-assets rows, absent seats, stable nodes, details click and hidden/asset-failure fallback');
 hud.active='liu';hud.preparing=new Promise(()=>{});let ended=false;
 const cancelled=hud.playRoll('liu',async()=>{throw new Error('cancelled roll must not start a new die')}).then(()=>ended=true);await flush();hud.cancel();await cancelled;
 assert.equal(ended,true);assert.equal(timers.size,0,'cancel clears preparation timeout');
 hud.available=true;hud.active='liu';hud.preparing=Promise.resolve();
 const pose={sheet:0,rect:[0,0,100,100],anchor:[50,98],eyes:[[40,30],[60,30]],eyeRegions:[{center:[.4,.3],radius:[.08,.05]},{center:[.6,.3],radius:[.08,.05]}]};
 for(const actor of hud.actors.values()){
  const atlas={width:100,height:100,pixelsPerUnit:100,duration:1.86,times:Array.from({length:16},(_,i)=>i*1.86/16),sheets:['test.webp'],frames:Array.from({length:16},(_,i)=>({...pose,eyesClosed:i===0}))};
  actor.atlases={prep:atlas,throw:atlas};actor.textures.set('test.webp',new Texture());actor.sprite=new Sprite(new SpriteMaterial());hud.setFrame(actor,'prep',0);
 }
 const prep=hud.playClip(a,'prep',0,1.86);await advance(100);assert.ok(Math.abs(hud.motion.elapsed-.15)<1e-8,'prep is now 1.5x its previous rate');hud.stopMotion();await prep;
 let release;const die=new Promise(r=>release=r);let handoffs=0,done=false;
 const roll=hud.playRoll('liu',()=>{handoffs++;return die}).then(()=>done=true);await flush();
 await advance(200);assert.equal(handoffs,0,'must show the hand toss before physical handoff');
 await advance(100);assert.equal(handoffs,1);assert.equal(done,false);
 assert.ok([...hud.actors.values()].filter(x=>x.id!=='liu').every(x=>x.clip==='prep'&&x.frame===0),'other lords remain meditating');
 const p=a.sprite.position.clone(),scale=a.card.dataset.sourcePixelScale;
 await advance(1200);assert.ok(a.sprite.position.distanceTo(p)<1e-8,'body anchor stable throughout throw');assert.equal(a.card.dataset.sourcePixelScale,scale,'no frame-specific body resizing');assert.equal(done,false,'the authoritative die must finish before movement');
 release();await roll;assert.equal(handoffs,1);assert.equal(a.card.dataset.pose,'awaiting-movement');assert.equal(a.clip,'throw');assert.equal(a.card.dataset.gaze,'forward','original gaze retained after dice disappear');await hud.movementDone('liu');assert.equal(a.clip,'prep');assert.equal(a.frame,0);assert.equal(timers.size,0);
 hud.show(false);assert.equal(frames.size,0);
 console.log('PASS another 1.5x presentation rate, wait for full movement before meditation, one physical handoff, original unwarped eyes, stable scale, wait-for-die and cancellation cleanup');
})().catch(e=>{console.error(e);process.exitCode=1});
