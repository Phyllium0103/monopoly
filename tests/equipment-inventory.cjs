const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {registerHooks,stripTypeScriptTypes}=require('node:module');
const {pathToFileURL,fileURLToPath}=require('node:url');
registerHooks({resolve(s,c,n){if(s.startsWith('.')&&!path.extname(s)&&c.parentURL){const p=path.resolve(path.dirname(fileURLToPath(c.parentURL)),s+'.ts');if(fs.existsSync(p))return n(pathToFileURL(p).href,c);}return n(s,c);},load(u,c,n){if(u.endsWith('.css'))return {format:'module',shortCircuit:true,source:''};return u.endsWith('.ts')?{format:'module',shortCircuit:true,source:stripTypeScriptTypes(fs.readFileSync(fileURLToPath(u),'utf8'),{mode:'transform'})}:n(u,c);}});
const {createGameState}=require('../src/game/GameState.ts');
const {makeEquipment,makeTechnique,techniqueDesc}=require('../src/data/items.ts');
const {EQUIPMENT_CAPACITY,bagItems,bagSlots,receiveEquipment,moveBagItem,resolveEquipmentReward}=require('../src/systems/EquipmentInventory.ts');
const {transferArmor,equipTechnique,completeBreak,expCap}=require('../src/systems/GeneralSystem.ts');
const {buy,sell,makeSellStock}=require('../src/systems/ShopSystem.ts');
const {resolveAuction,applyWorldEvent,eventDef}=require('../src/systems/EventSystem.ts');
const {unloadTechnique}=require('../src/systems/ItemSystem.ts');
const {grantTournamentPrize}=require('../src/systems/TournamentSystem.ts');
const {Engine}=require('../src/engine/Engine.ts'),{RecordingView}=require('../src/engine/view.ts');
function setup(full=true){const state=createGameState('liu'),lord=state.lords.liu,g=state.generals.liubei;g.realm=6;g.aptitude='heaven';lord.stones=1e8;if(full)for(let i=0;i<20;i++)assert(receiveEquipment(lord,i%2?makeTechnique('bag-'+i,0,'fire'):makeEquipment('bag-'+i,'armor',0,'chiyou-huang')));return {state,lord,g};}
function allIds(state){return Object.values(state.lords).flatMap(l=>[...bagItems(l),...l.pendingEquipment]).concat(Object.values(state.generals).flatMap(g=>[g.armor,g.technique].filter(Boolean))).map(i=>i.uid).sort();}
{
 const {state,lord,g}=setup();assert.equal(EQUIPMENT_CAPACITY,20);assert.equal(bagSlots(lord).length,20);
 const initial=allIds(state),uid=lord.gear[0].uid,index=bagSlots(lord).findIndex(x=>x?.uid===uid);
 assert(transferArmor(state,lord,uid,undefined,g.id));assert.equal(bagItems(lord).length,19);assert.equal(bagSlots(lord)[index],null,'equipping leaves its actual cell empty');
 assert(transferArmor(state,lord,uid,g.id,undefined,index));assert.equal(bagSlots(lord)[index].uid,uid);assert.deepEqual(allIds(state),initial);
 const before=JSON.stringify(lord);assert(!moveBagItem(lord,'foreign',3));assert(!moveBagItem(lord,uid,20));assert.equal(JSON.stringify(lord),before);
 const other=bagSlots(lord)[19].uid;assert(moveBagItem(lord,uid,19));assert.equal(bagSlots(lord)[index].uid,other);assert.equal(bagSlots(lord)[19].uid,uid);
 const saved=JSON.parse(JSON.stringify(state));assert.deepEqual(bagSlots(saved.lords.liu).map(x=>x?.uid),bagSlots(lord).map(x=>x?.uid));assert.deepEqual(allIds(saved),initial);
 console.log('PASS exactly 20 shared cells, empty source slots, explicit placement, bag swap, invalid cell rejection and save/load positions');
}
{
 const {state,lord,g}=setup();g.armor=makeEquipment('equipped','armor',0,'nuwa-huang');
 const before=JSON.stringify(state);assert(!transferArmor(state,lord,g.armor.uid,g.id));assert.equal(JSON.stringify(state),before,'full bag cannot swallow equipped armor');
 const uid=lord.gear[0].uid;assert(transferArmor(state,lord,uid,undefined,g.id));assert.equal(bagItems(lord).length,20);assert(lord.gear.some(x=>x.uid==='equipped'));
 const recipient=Object.values(state.generals).find(x=>x.owner===lord.id&&x.id!==g.id);recipient.realm=6;recipient.armor=makeEquipment('recipient','armor',0,'nuwa-huang');
 const snapshot=JSON.stringify(state);assert(!transferArmor(state,lord,g.armor.uid,g.id,recipient.id));assert.equal(JSON.stringify(state),snapshot);
 const scroll=lord.scrolls[0];assert(equipTechnique(state,lord,scroll.uid,g.id));assert.equal(bagItems(lord).length,19);assert(transferArmor(state,lord,g.armor.uid,g.id,recipient.id));assert.equal(bagItems(lord).length,20);
 console.log('PASS full-bag equip swaps preserve both items; unequip/general swap rejected atomically until a cell is freed');
}
{
 const {state,lord}=setup();const item=makeEquipment('shop','armor',9,'chiyou-tian'),offer={kind:'equipment',equipment:item,label:item.name,sub:'',price:item.price};
 const before=JSON.stringify(state);assert(!buy(state,lord,offer).ok);assert.equal(JSON.stringify(state),before);
 const lot=resolveAuction(state,offer,[{id:lord.id,bid:50000}]);assert.equal(lot.winner,null);assert.equal(JSON.stringify(state),before);
 const sale=makeSellStock(lord,'forge')[0];assert(sell(lord,'forge',sale).ok);assert(buy(state,lord,offer).ok);assert.equal(bagItems(lord).length,20);
 const reward=makeTechnique('reward',9,'fire');assert(!receiveEquipment(lord,reward));assert.equal(lord.pendingEquipment[0],reward);assert.equal(bagItems(lord).length,20);
 const snapshot=JSON.stringify(state);assert(!resolveEquipmentReward(lord,reward.uid,'missing'));assert.equal(JSON.stringify(state),snapshot);
 const replaced=lord.gear[0].uid,slot=bagSlots(lord).findIndex(x=>x?.uid===replaced);assert(resolveEquipmentReward(lord,reward.uid,replaced));assert.equal(bagSlots(lord)[slot].uid,reward.uid);assert.equal(bagItems(lord).length,20);assert(!bagItems(lord).some(x=>x.uid===replaced));
 receiveEquipment(lord,makeTechnique('forfeit',9,'fire'));const ids=bagItems(lord).map(x=>x.uid);assert(resolveEquipmentReward(lord,'forfeit',null));assert.deepEqual(bagItems(lord).map(x=>x.uid),ids);assert(!resolveEquipmentReward(lord,'forfeit',null));
 console.log('PASS full shops/auctions do not charge; reward waits; replacing/discarding/repeated choices have exact conservation');
}
{
 const {state,lord,g}=setup();g.technique=makeTechnique('reset-scroll',3,'fire');unloadTechnique(state,g);assert.equal(g.technique,null);assert.equal(bagItems(lord).length,20);assert(lord.pendingEquipment.some(x=>x.uid==='reset-scroll'));
 g.armor=makeEquipment('mortal-armor','armor',0,'nuwa-huang');g.realm=4;g.exp=expCap(g);assert(completeBreak(g,state.round));assert.equal(g.armor,null);assert(lord.pendingEquipment.some(x=>x.uid==='mortal-armor'));
 grantTournamentPrize(state,lord);assert.equal(lord.pendingEquipment.length,3);applyWorldEvent(state,eventDef('armory'));assert.equal(lord.pendingEquipment.length,4);assert.equal(bagItems(lord).length,20);
 assert.equal(new Set(allIds(state)).size,allIds(state).length);
 assert(!techniqueDesc(makeTechnique('tip',0,'fire')).includes('｜'));assert(techniqueDesc(makeTechnique('tip',0,'fire')).includes('<br>修練速度'));
 console.log('PASS forced technique removal, mortal trial, tournament/world rewards all respect capacity; technique attributes and bonuses use separate lines');
}
{
 const {GeneralsView,sortRosterGenerals}=require('../src/ui/GeneralsView.ts');
 const {state,lord}=setup(false),owned=Object.values(state.generals).filter(g=>g.owner===lord.id),cities=Object.values(state.cities).slice(0,2);
 cities[0].prosperity=30;cities[1].prosperity=150;
 const examples=owned.slice(0,5);examples.forEach((g,i)=>{g.status=i===0?'sect':i===1?'free':i===2||i===3?'garrison':'realm';g.cityId=i===2?cities[0].id:i===3?cities[1].id:null;});
 const sorted=sortRosterGenerals(examples,state,'location');assert.deepEqual(sorted.map(g=>g.id),[examples[1],examples[3],examples[2],examples[4],examples[0]].map(g=>g.id));assert.equal(examples[0].isLord,true,'lord is deliberately last');
 examples[1].exp=expCap(examples[1]);examples[0].realm=0;examples[1].realm=9;assert.equal(sortRosterGenerals(examples,state,'realm')[0].id,examples[1].id,'sorting never pins lord or separates ready generals');
 const html=GeneralsView.prototype.rowHtml.call(GeneralsView.prototype,state,lord,examples[1],true);assert.equal((html.match(/role="meter"/g)||[]).length,3);assert.match(html,/aria-haspopup="dialog"/);assert(!html.includes('＋'));assert(!html.includes('has-realm-frame'));
 const max={...examples[1],realm:10};assert(!GeneralsView.prototype.vitals(max).includes('NaN'));assert(!GeneralsView.prototype.vitals(max).includes('Infinity'));
 console.log('PASS one roster: party, descending-prosperity cities, expeditions, sect; no pinned lord; three accessible vital bars and dialog trigger');
}
(async()=>{
 const {state,lord}=setup();const reward=makeEquipment('chosen','armor',9,'chiyou-tian');receiveEquipment(lord,reward);let calls=0;
 const engine=new Engine(state,{view:new RecordingView(),isAuto:()=>false,multiplayer:true,send:async(id,p)=>{assert.equal(id,lord.id);assert.equal(p.kind,'choose');assert.match(p.text,/20 格/);assert.equal(p.choices.length,20);calls++;return 3;}});
 const replaced=bagItems(lord)[3].uid;await engine.resolvePendingEquipment(lord);assert.equal(calls,1);assert.equal(lord.pendingEquipment.length,0);assert(bagItems(lord).some(x=>x.uid===reward.uid));assert(!bagItems(lord).some(x=>x.uid===replaced));
 const snapshot=JSON.parse(JSON.stringify(state));receiveEquipment(lord,makeTechnique('rejected',9,'fire'));engine.ports.send=async()=>null;await engine.resolvePendingEquipment(lord);assert.equal(JSON.stringify(bagItems(lord)),JSON.stringify(bagItems(snapshot.lords.liu)));
 const auto=setup();receiveEquipment(auto.lord,makeEquipment('ai-best','armor',9,'chiyou-tian'));const ai=new Engine(auto.state,{view:new RecordingView(),isAuto:()=>true,multiplayer:true,send:async()=>{throw Error('AI should not prompt');}});await ai.resolvePendingEquipment(auto.lord);assert.equal(bagItems(auto.lord).length,20);assert(auto.lord.gear.some(x=>x.uid==='ai-best'));
 console.log('PASS real engine reward prompts apply player replacement/discard and AI selection without exceeding capacity');
})().catch(e=>{console.error(e);process.exitCode=1;});
