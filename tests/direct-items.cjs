const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {registerHooks,stripTypeScriptTypes}=require('node:module');
const {pathToFileURL,fileURLToPath}=require('node:url');
registerHooks({resolve(s,c,n){if(s.startsWith('.')&&!path.extname(s)&&c.parentURL){const p=path.resolve(path.dirname(fileURLToPath(c.parentURL)),s+'.ts');if(fs.existsSync(p))return n(pathToFileURL(p).href,c);}return n(s,c);},load(u,c,n){return u.endsWith('.ts')?{format:'module',shortCircuit:true,source:stripTypeScriptTypes(fs.readFileSync(fileURLToPath(u),'utf8'),{mode:'transform'})}:n(u,c);}});
const {createGameState}=require('../src/game/GameState.ts');
const {makeItem,STAT_UP}=require('../src/data/items.ts');
const {requirement}=require('../src/systems/ItemSystem.ts');
const {Engine}=require('../src/engine/Engine.ts');
const {RecordingView}=require('../src/engine/view.ts');
const {Duel}=require('../src/systems/BattleSystem.ts');
let passed=0;
async function test(name,fn){await fn();passed++;console.log('PASS '+name);}
function fixture(actions){
  const state=createGameState('liu'),lord=state.lords.liu,user=state.generals.liubei,view=new RecordingView();
  for(const key of ['alchemy','formation','talisman','forging'])user.base[key]=200;
  user.stamina=200;user.technique=null;
  const engine=new Engine(state,{view,send:async(_id,p)=>{assert.equal(p.kind,'preroll');return actions.shift()??{type:'roll'};},isAuto:()=>false,multiplayer:false});
  return {state,lord,user,view,engine};
}
(async()=>{
  await test('Direct item rejects forged inventory, enemy caster and wrong target without spending',async()=>{
    const actions=[],{state,lord,user,engine}=fixture(actions),item=makeItem('direct-force','force',0);
    lord.items=[item];const before=structuredClone({items:lord.items,user,enemy:state.generals.caocao});
    for(const a of [{itemUid:'missing',userId:user.id,target:{generalId:user.id}},{itemUid:item.uid,userId:'caocao',target:{generalId:user.id}},{itemUid:item.uid,userId:user.id,target:{generalId:'caocao'}}])actions.push({type:'use-item',...a});
    actions.push({type:'roll'});await engine.prerollPhase(lord);
    assert.deepEqual({items:lord.items,user,enemy:state.generals.caocao},before);
  });
  await test('Direct item applies to chosen ally and charges the chosen caster once',async()=>{
    const actions=[],{state,lord,user,engine}=fixture(actions),item=makeItem('direct-force','force',0),target=state.generals.guanyu;
    lord.items=[item];const stamina=user.stamina,force=target.base.force,cost=requirement(item,user).stamina;
    actions.push({type:'use-item',itemUid:item.uid,userId:user.id,target:{generalId:target.id}},{type:'roll'});
    const random=Math.random;try{Math.random=()=>.999;await engine.prerollPhase(lord);}finally{Math.random=random;}
    assert.equal(target.base.force,force+STAT_UP[0]);assert.equal(user.stamina,stamina-cost);assert.equal(lord.items.length,0);
  });
  await test('Transmission routes the chosen owned city to existing free garrison management',async()=>{
    const actions=[],{state,lord,user,engine}=fixture(actions),item=makeItem('direct-transmission','transmission',0),city=Object.values(state.cities).find(c=>c.owner===lord.id);
    lord.items=[item];let routed=null;engine.manageGarrison=async(l,c,free)=>{routed=[l.id,c.id,free];};
    actions.push({type:'use-item',itemUid:item.uid,userId:user.id,target:{cityId:city.id}},{type:'roll'});
    await engine.prerollPhase(lord);assert.deepEqual(routed,[lord.id,city.id,true]);
  });
  await test('Battle direct use rejects wrong side, then spends once on the intended fighter',async()=>{
    const {state,lord,user,engine,view}=fixture([]),item=makeItem('direct-rage','rage',0),duel=new Duel(lord,user,state.lords.cao,state.generals.caocao);
    lord.items=[item];const stamina=user.stamina,cost=requirement(item,user).stamina,attack=duel.a.atk;let asks=0;
    engine.ports.send=async(_id,p)=>{assert.equal(p.kind,'duel');asks++;return {type:'use-item',itemUid:item.uid,userId:user.id,targetSide:asks===1?'b':'a'};};
    view.duelEvents=async()=>{duel.winner='a';};
    await engine.runDuel(duel,lord,state.lords.cao,'Direct item check');
    assert.equal(asks,2);assert.equal(user.stamina,stamina-cost);assert.equal(lord.items.length,0);assert.ok(duel.a.atk>attack);
  });
  await test('Approved complete item weights and graft price match user table',async()=>{
    const {ITEM_DEFS}=require('../src/data/items.ts');
    const expected={"clearmind":1,"heal":1,"force":1,"guard":1,"qi":1,"essence":1,"foundation":1,"vigor":1,"poison":1,"bone":1,"revive":1,"rootup1":0.25,"rootup2":0.25,"reset":0.5,"rage":1,"five":0.5,"talentrefund":0.5,"talentreset":0,"truce":1,"vajra":1,"ring":1,"shuttle":1,"bowl":1,"bag":1,"cloud":1,"bow":1,"blood":1,"wheel":1,"totem":0.25,"cushion":1,"realmkey":0.5,"teleport":1,"confuse":1,"citadel":1,"thunderward":1,"fiveward":1,"mend":1,"vein":1,"mist":1,"sacrifice":1,"seven":0.5,"invert":1,"lock":1,"graft":0.1,"demon":1,"dice":1,"stride":1,"freeze":1,"ghost":1,"siegebreak":1,"shield":1,"charge":1,"drain":1,"soldiers":1,"confusing":1,"transmission":1,"move":1,"breath":1,"substitute":1,"rootdown":0.25,"prison":1,"realmescape":1};
    assert.deepEqual(Object.keys(ITEM_DEFS).sort(),Object.keys(expected).sort());
    for(const [id,weight] of Object.entries(expected))assert.equal(ITEM_DEFS[id].weight,weight,id);
    assert.deepEqual(ITEM_DEFS.graft.price,[150000]);assert.deepEqual(ITEM_DEFS.graft.sellPrice,[75000]);
  });
  await test('Graft exchanges both city bindings without realm or cultivation loss',async()=>{
    const {state,lord,user}=fixture([]),enemy=state.generals.caocao;
    const a=Object.values(state.cities).find(c=>c.owner===lord.id),b=Object.values(state.cities).find(c=>c.owner==='cao');
    user.realm=9;user.exp=123;user.boundCityId=a.id;enemy.realm=10;enemy.exp=456;enemy.boundCityId=b.id;
    const item=makeItem('graft-bindings','graft',0);lord.items=[item];
    const beforeA=[...a.garrisonGenerals],beforeB=[...b.garrisonGenerals];
    await require('../src/systems/ItemSystem.ts').usePreroll(state,lord,item,user,{city:b,ownCity:a});
    const afterUseExp=user.exp;assert(afterUseExp>=123,'normal item-use cultivation is retained');
    require('../src/systems/GeneralSystem.ts').reconcileProgression(state);
    assert.equal(user.boundCityId,b.id);assert.equal(enemy.boundCityId,a.id);
    assert.equal(user.realm,9);assert.equal(user.exp,afterUseExp);assert.equal(enemy.realm,10);assert.equal(enemy.exp,456);
    assert.equal(a.owner,'cao');assert.equal(b.owner,lord.id);assert.deepEqual(a.garrisonGenerals,beforeB);assert.deepEqual(b.garrisonGenerals,beforeA);
    assert.equal(lord.items.length,0);
  });
  console.log(`${passed} focused direct-item checks passed`);
})().catch(error=>{console.error(error);process.exitCode=1;});
