const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const{registerHooks,stripTypeScriptTypes}=require('node:module');const{pathToFileURL,fileURLToPath}=require('node:url');
registerHooks({resolve(s,c,n){if(s.startsWith('.')&&!path.extname(s)&&c.parentURL){const p=path.resolve(path.dirname(fileURLToPath(c.parentURL)),s+'.ts');if(fs.existsSync(p))return n(pathToFileURL(p).href,c);}return n(s,c);},load(u,c,n){return u.endsWith('.ts')?{format:'module',shortCircuit:true,source:stripTypeScriptTypes(fs.readFileSync(fileURLToPath(u),'utf8'),{mode:'transform'})}:n(u,c);}});

const {createGameState}=require('../src/game/GameState.ts');
const {makeStock,beginShopVisit,refreshShop,lockTavernGeneral}=require('../src/systems/ShopSystem.ts');
const {recruitPrice}=require('../src/systems/GeneralSystem.ts');const {bindPassiveState}=require('../src/data/passives.ts');
function fixture(n=8){const state=createGameState('liu'),lord=state.lords.liu;lord.stones=1e8;for(const g of Object.values(state.generals)){g.owner='liu';g.status='sect';}for(const g of Object.values(state.generals).filter(g=>!g.isLord&&g.origin!=='immortal').slice(0,n)){g.owner=null;g.status='free';}bindPassiveState(state);return {state,lord};}
const ids=v=>v.offers.filter(o=>o.kind==='general').map(o=>o.general.id),random=Math.random;
try{Math.random=()=>.99;
 let {state,lord}=fixture();let visit=beginShopVisit(state,lord,'tavern');const first=ids(visit);assert.equal(first.length,4);assert(refreshShop(state,lord,visit).ok);const second=ids(visit);assert.equal(second.length,4);assert(!second.some(id=>first.includes(id)));assert(refreshShop(state,lord,visit).ok);assert.deepEqual(new Set(ids(visit)),new Set(first),'third shelf may reuse first shelf');
 ({state,lord}=fixture());visit=beginShopVisit(state,lord,'tavern');const locked=visit.offers[0],old=ids(visit);assert(lockTavernGeneral(lord,locked).ok);assert(refreshShop(state,lord,visit).ok);assert(ids(visit).includes(locked.general.id));assert(!ids(visit).some(id=>id!==locked.general.id&&old.includes(id)));assert.equal(visit.offers.find(o=>o.general.id===locked.general.id).price,Math.round(recruitPrice(locked.general,'liu')*1.2));assert(refreshShop(state,lord,visit).ok);assert.equal(visit.offers.find(o=>o.general.id===locked.general.id).price,Math.round(recruitPrice(locked.general,'liu')*1.2*1.2));
 ({state,lord}=fixture(4));visit=beginShopVisit(state,lord,'tavern');assert.equal(ids(visit).length,4);assert(refreshShop(state,lord,visit).ok);assert.equal(ids(visit).length,0,'never refill with previous unlocked generals');assert(refreshShop(state,lord,visit).ok);assert.equal(ids(visit).length,4);
 console.log('PASS consecutive tavern shelves disjoint, first/third reuse, locked retention and cumulative price, scarce pool without repeats');
}finally{Math.random=random;}
