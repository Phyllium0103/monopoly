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
  actor.atlases={prep:atlas,throw:atlas,...(actor.id==='liu'?{}:{recovery:{...atlas,duration:.5,times:[0,.1,.2,.3,.4],frames:atlas.frames.slice(0,5)}})};actor.textures.set('test.webp',new Texture());actor.sprite=new Sprite(new SpriteMaterial());hud.setFrame(actor,'prep',0);
 }
 const prep=hud.playClip(a,'prep',0,1.86);await advance(100);assert.ok(Math.abs(hud.motion.elapsed-.10)<1e-8,'character motion is two thirds of the previous rate');hud.stopMotion();await prep;
 hud.focus('liu',true);await flush();await advance(2000);assert.equal(a.card.dataset.pose,'ready');assert.equal(a.frame,15);
 const readyVersion=hud.turnVersion;hud.focus('liu');assert.equal(hud.turnVersion,readyVersion,'repeated focus in the same turn does not restart prep');assert.equal(a.frame,15);assert.equal(hud.motion,null);
 document.hidden=true;listeners.get('visibilitychange')();await flush();assert.equal(a.frame,15,'ready frame survives backgrounding');
 document.hidden=false;listeners.get('visibilitychange')();await flush();assert.equal(a.frame,15);assert.equal(a.card.dataset.pose,'ready');assert.equal(hud.motion,null);
 hud.show(false);hud.show(true);await flush();assert.equal(a.frame,15,'hiding and showing the game preserves the ready pose');
 hud.focus('cao');await flush();await advance(300);const cao=hud.actors.get('cao');assert.ok(cao.frame>0&&cao.frame<15);
 document.hidden=true;listeners.get('visibilitychange')();await flush();document.hidden=false;listeners.get('visibilitychange')();await flush();assert.equal(cao.frame,15,'an interrupted preparation finishes without reverting to meditation');assert.equal(cao.card.dataset.pose,'ready');assert.equal(a.frame,0,'previous lord meditates');
 const preload=hud.preload;let releaseImages;const images=new Promise(r=>releaseImages=r);cao.atlases.prep.frames[15].externalSheet='late.webp';cao.card.dataset.pose='meditating';
 hud.preload=async function(actor,clip){if(actor.id==='cao')await images;return preload.call(this,actor,clip)};
 hud.focus('liu');await flush();await advance(2000);hud.focus('cao');await flush();
 document.hidden=true;listeners.get('visibilitychange')();assert.equal(cao.card.dataset.pose,'preparing','not ready until its final sheet is actually loaded');document.hidden=false;listeners.get('visibilitychange')();await flush();
 cao.textures.set('late.webp',new Texture());releaseImages();await flush();assert.equal(cao.card.dataset.pose,'ready');assert.equal(cao.frame,15);assert.equal(hud.motion,null,'late pre-background loads cannot restart preparation');hud.preload=preload;delete cao.atlases.prep.frames[15].externalSheet;
 hud.focus('liu');await flush();await advance(2000);assert.equal(a.card.dataset.pose,'ready');
 let release;const die=new Promise(r=>release=r);let handoffs=0,done=false;
 const roll=hud.playRoll('liu',()=>{handoffs++;return die}).then(()=>done=true);await flush();
 await advance(300);assert.equal(handoffs,0,'slower hand toss has not reached .54 source seconds yet');
 await advance(100);assert.equal(handoffs,1);assert.equal(done,false);
 assert.ok([...hud.actors.values()].filter(x=>x.id!=='liu').every(x=>x.clip==='prep'&&x.frame===0),'other lords remain meditating');
 const p=a.sprite.position.clone(),scale=a.card.dataset.sourcePixelScale;
 await advance(1200);assert.ok(a.sprite.position.distanceTo(p)<1e-8,'body anchor stable throughout throw');assert.equal(a.card.dataset.sourcePixelScale,scale,'no frame-specific body resizing');assert.equal(done,false,'the authoritative die must finish before movement');
 release();await roll;assert.equal(handoffs,1);assert.equal(a.card.dataset.pose,'awaiting-movement');assert.equal(a.clip,'throw');assert.equal(a.card.dataset.gaze,'forward','original gaze retained after dice disappear');
 document.hidden=true;listeners.get('visibilitychange')();await flush();document.hidden=false;listeners.get('visibilitychange')();await flush();assert.equal(a.card.dataset.pose,'awaiting-movement','returning during movement must not prepare another roll');
 await hud.movementDone('liu');assert.equal(a.clip,'prep');assert.equal(a.frame,0);assert.equal(timers.size,0);hud.focus('liu');assert.equal(a.frame,0,'same turn cannot prepare again after movement');
 document.hidden=true;listeners.get('visibilitychange')();document.hidden=false;listeners.get('visibilitychange')();await flush();assert.equal(a.frame,0,'completed turn stays meditating across a tab switch');
 hud.focus('liu',true);await flush();await advance(2000);let backgroundDrops=0;
 const interrupted=hud.playRoll('liu',async()=>{backgroundDrops++});await flush();await advance(150);
 document.hidden=true;listeners.get('visibilitychange')();await interrupted;assert.equal(backgroundDrops,0,'a skipped cosmetic toss cannot duplicate a roll');assert.equal(hud.awaitingMovement,'liu');await hud.movementDone('liu');
 document.hidden=false;listeners.get('visibilitychange')();await flush();assert.equal(a.frame,0);assert.equal(a.card.dataset.pose,'meditating');
 document.hidden=true;hud.focus('cao',true);await flush();document.hidden=false;listeners.get('visibilitychange')();await flush();assert.equal(cao.frame,15,'a turn beginning in the background is ready when shown');assert.equal(cao.card.dataset.pose,'ready');
 const caoRoll=hud.playRoll('cao',async()=>{});await flush();await advance(2000);await caoRoll;const recovery=hud.movementDone('cao');await advance(100);document.hidden=true;listeners.get('visibilitychange')();await recovery;document.hidden=false;listeners.get('visibilitychange')();await flush();assert.equal(cao.frame,0,'background recovery reaches meditation, not another ready pose');
 hud.reset();document.hidden=true;listeners.get('visibilitychange')();document.hidden=false;listeners.get('visibilitychange')();await flush();assert.equal(hud.active,null);assert.ok([...hud.actors.values()].every(x=>x.frame===0),'reset does not resurrect a stale turn');
 let rollClicks=0;hud.focus('liu',true);hud.setRollAction(()=>rollClicks++);
 assert.equal(a.rollButton.hidden,false);assert.equal(a.rollButton.disabled,false);
 assert.ok([...hud.actors.values()].filter(x=>x.id!=='liu').every(x=>x.rollButton.hidden),'only local current lord is actionable');
 const detailsBefore=clicked.length;a.card.children[0].onclick();assert.equal(clicked.length,detailsBefore+1);assert.equal(rollClicks,0,'stone opens details without rolling');
 a.rollButton.onclick();assert.equal(rollClicks,1,'current local character uses the shared dice action');
 hud.focus('cao',true);assert.equal(a.rollButton.hidden,true);assert.equal(a.rollButton.disabled,true);a.rollButton.onclick();assert.equal(rollClicks,1,'out of turn character cannot roll');
 hud.setRollAction(null);assert.ok([...hud.actors.values()].every(x=>x.rollButton.disabled),'regular roll availability gates every character action');
 const {proportionalViewport}=require('../src/ui/UiViewport.ts');
 for(const [w,h,s] of [[1280,720,1],[960,540,.75],[640,360,.5],[1920,1080,1.5]]){
  const viewport=proportionalViewport(w,h);assert.equal(viewport.scale,s);assert.equal(viewport.width,1280);assert.equal(viewport.height,720);
 }
 const portrait=proportionalViewport(720,1280);assert.equal(portrait.width*portrait.scale,720);assert.equal(portrait.height*portrait.scale,1280);
 console.log('PASS split stone/character actions, own-turn-only dice, shared availability and proportional viewport');
 hud.show(false);assert.equal(frames.size,0);
 console.log('PASS persistent unrolled ready pose, hidden prep/recovery/throw completion, duplicate focus guard, 2/3 character speed, one physical handoff, fixed eyes, stable scale and reset cleanup');
})().catch(e=>{console.error(e);process.exitCode=1});
