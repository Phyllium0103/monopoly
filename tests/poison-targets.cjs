const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const{registerHooks,stripTypeScriptTypes}=require('node:module');const{pathToFileURL,fileURLToPath}=require('node:url');
registerHooks({resolve(s,c,n){if(s.startsWith('.')&&!path.extname(s)&&c.parentURL){const p=path.resolve(path.dirname(fileURLToPath(c.parentURL)),s+'.ts');if(fs.existsSync(p))return n(pathToFileURL(p).href,c);}return n(s,c);},load(u,c,n){return u.endsWith('.ts')?{format:'module',shortCircuit:true,source:stripTypeScriptTypes(fs.readFileSync(fileURLToPath(u),'utf8'),{mode:'transform'})}:n(u,c);}});
const{createGameState}=require('../src/game/GameState.ts');const{makeItem,POISON_PREROLL}=require('../src/data/items.ts');
const{usePreroll,useInDuel}=require('../src/systems/ItemSystem.ts');const{itemLordTargets,resolveItemTarget,itemDisabledReason}=require('../src/systems/DirectItems.ts');
const{maxHp}=require('../src/systems/GeneralSystem.ts');const{Duel}=require('../src/systems/BattleSystem.ts');const{Engine}=require('../src/engine/Engine.ts');const{RecordingView}=require('../src/engine/view.ts');
function fixture(){const state=createGameState('liu'),lord=state.lords.liu,user=state.generals.liubei,victim=state.generals.caocao;
 user.base.alchemy=500;user.stamina=999;const ally=Object.values(state.generals).find(g=>g.owner==='cao'&&!g.isLord&&g.id!=='guanyu');
 for(const g of Object.values(state.generals))if(g.owner==='cao'&&!g.isLord)g.status='sect';ally.status='free';
 return{state,lord,user,victim,ally};}
(async()=>{const random=Math.random;try{Math.random=()=>0;
 for(let tier=0;tier<4;tier++){const{state,lord,user,victim,ally}=fixture(),item=makeItem('poison-'+tier,'poison',tier);lord.items=[item];const hp=victim.hp,ahp=ally.hp;await usePreroll(state,lord,item,user,{lord:state.lords.cao});assert.equal(victim.hp,hp);assert.equal(ally.hp,ahp-Math.round(maxHp(ally)*POISON_PREROLL[tier]));}
 console.log('PASS all four poison tiers hit accompanying generals, never their lord');
 for(const multiplayer of [false,true]){const{state,lord,user,victim,ally}=fixture(),item=makeItem('alone','poison',0);ally.status='sect';lord.items=[item];const before=structuredClone({hp:victim.hp,stamina:user.stamina,items:lord.items});
  assert(!itemLordTargets(state,lord,item).some(l=>l.id==='cao'));assert(resolveItemTarget(state,lord,item,{lordId:'cao'}).reason);await assert.rejects(()=>usePreroll(state,lord,item,user,{lord:state.lords.cao}),/隨行武將/);
  const actions=[{type:'use-item',itemUid:item.uid,userId:user.id,target:{lordId:'cao'}},{type:'roll'}];const e=new Engine(state,{view:new RecordingView(),send:async()=>actions.shift()??{type:'roll'},isAuto:()=>false,multiplayer});await e.prerollPhase(lord);assert.deepEqual({hp:victim.hp,stamina:user.stamina,items:lord.items},before);
  assert(itemLordTargets(state,lord,makeItem('bow','bow',0)).some(l=>l.id==='cao'),'bow rules must remain unchanged');
 }
 console.log('PASS solo/host reject lord-only poison targets without spending; bow unchanged');
 const{state,lord,user,victim,ally}=fixture(),item=makeItem('duel','poison',0),duel=new Duel(lord,user,state.lords.cao,victim);lord.items=[item];const before=structuredClone({stamina:user.stamina,items:lord.items,hp:duel.other('a').hp});assert.match(itemDisabledReason(state,lord,item,'battle',user.id,victim.id),/不能對主公/);assert.throws(()=>useInDuel(duel,'a',lord,item,user),/不能對主公/);assert.deepEqual({stamina:user.stamina,items:lord.items,hp:duel.other('a').hp},before);assert.equal(duel.other('a').poison,null);
 const ordinary=new Duel(lord,user,state.lords.cao,ally);useInDuel(ordinary,'a',lord,item,user);assert.equal(ordinary.other('a').poison.turns,3);console.log('PASS lord duel poison rejected before consumption; ordinary general still poisoned');
 }finally{Math.random=random}})().catch(e=>{console.error(e);process.exitCode=1});
