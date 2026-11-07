const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const { registerHooks, stripTypeScriptTypes } = require('node:module');
const { pathToFileURL, fileURLToPath } = require('node:url');
registerHooks({
 resolve(s,c,n){if(s.startsWith('.')&&!path.extname(s)&&c.parentURL){const p=path.resolve(path.dirname(fileURLToPath(c.parentURL)),s+'.ts');if(fs.existsSync(p))return n(pathToFileURL(p).href,c);}return n(s,c)},
 load(u,c,n){return u.endsWith('.ts')?{format:'module',shortCircuit:true,source:stripTypeScriptTypes(fs.readFileSync(fileURLToPath(u),'utf8'),{mode:'transform'})}:n(u,c)}
});

const {createGameState}=require('../src/game/GameState.ts');
const {canAttemptBreak,completeBreak,maxHp,boltRange,reconcileProgression,attemptBreak,breakChance}=require('../src/systems/GeneralSystem.ts');
const {startTurn}=require('../src/game/TurnManager.ts');
const {makePersonalWeapon}=require('../src/data/weaponCatalog.ts');
const {cityToll}=require('../src/systems/CitySystem.ts');
(async()=>{
 const s=createGameState('liu',null), lord=s.lords.liu, g=Object.values(s.generals).find(g=>g.owner==='liu'&&g.isLord);
 assert.equal(lord.items.filter(i=>i.defId==='foundation').length,5);
 const {spawnElementalSpirits}=require('../src/systems/ElementalSpiritSystem.ts');
 assert.equal(spawnElementalSpirits(s,5),5);assert.equal(new Set(s.elementalSpirits.map(x=>x.element)).size,5);
 const {requirement}=require('../src/systems/ItemSystem.ts');
 const {breakthroughSuccess,breakthroughSuccessTitle}=require('../src/data/breakthroughRules.ts');
 for(let realm=1;realm<=10;realm++) {
   const sample={...g,realm};assert(!breakthroughSuccess(sample).includes('「'));assert(breakthroughSuccessTitle(sample).length>0);
 }
 assert.deepEqual([0,1,2,3].map(t=>makePersonalWeapon(g.id,t).penetration),[.05,.15,.25,.4]);
 assert.equal(requirement({defId:'substitute',tier:0}).stamina,0);
 const {usePreroll}=require('../src/systems/ItemSystem.ts');
 const {makeItem}=require('../src/data/items.ts');
 const oldFormation=g.base.formation;g.base.formation=1000;
 for(const [id,reduction] of [['fiveward',.2],['thunderward',.4]]) {
   g.ward=0;g.stamina=100;const item=makeItem('ward-test-'+id,id,0);lord.items.push(item);
   await usePreroll(s,lord,item,g,{general:g});assert.equal(g.ward,reduction);
 }
 g.ward=0;g.base.formation=oldFormation;
 const random=Math.random;
 g.realm=0;g.exp=200;g.aptitude='waste';g.hp=maxHp(g);const hp=g.hp;
 Math.random=()=>.99;assert.equal(attemptBreak(g,1),false);assert.equal(g.hp,hp);assert.equal(g.exp,100);
 g.realm=1;g.exp=400;g.foundation=false;g.hp=1;
 assert.equal(attemptBreak(g,1),false);assert.equal(g.hp,1);assert.equal(g.exp,300);
 g.foundation=true;assert.equal(breakChance(g),1);Math.random=random;
 g.realm=2;g.exp=2400;g.goldenCore='heavenly';g.aptitude='heaven';
 g.aptitude='waste';assert.equal(canAttemptBreak(g,1).ok,false);g.aptitude='heaven';
 const force=g.base.force;assert.equal(canAttemptBreak(g,1).ok,true);assert.equal(completeBreak(g,1),true);assert.equal(g.base.force,force+20);
 g.hp=maxHp(g);g.ward=0;
 const range=boltRange(g);assert.equal(range.count,4);assert(range.totalAvg>0);
 const {fx}=require('../src/data/passives.ts');
 assert.equal(range.totalAvg,Math.round(maxHp({...g,armor:null,weapon:null})*1.5*Math.max(0,1-(fx(g).tribulation??0))));
 const withoutArmor=range.totalAvg;
 g.armor={kind:'armor',tier:9,force:0,defense:0,hp:1000,craft:{}};
 assert.equal(boltRange(g).totalAvg,withoutArmor);g.armor=null;
 g.realm=2;reconcileProgression(s);assert.equal(g.base.force,force);assert.equal(g.goldenCore,undefined);
 g.realm=4;g.exp=3200;g.hp=maxHp(g);assert(completeBreak(g,1));assert(g.mortalTrial);assert.equal(g.realm,0);
 g.mortalTrial.turns=1;await startTurn(s,lord);assert.equal(g.realm,5);assert.equal(g.mortalTrial,undefined);
 g.exp=6400;assert.equal(canAttemptBreak(g,1).ok,false);
 lord.essences={metal:1,wood:1,water:1,fire:1,earth:1};assert(completeBreak(g,1));assert.equal(g.realm,6);assert.equal(lord.essences.fire,0);
 g.exp=10000;g.weapon=makePersonalWeapon(g.id,3);assert(completeBreak(g,1));assert.equal(g.realm,7);assert.equal(g.weapon.tier,0);assert(g.fusionBonus.penetration>0);
 assert.equal(g.fusionBonus.penetration,.2);assert.equal(g.weapon.penetration,.05);
 assert.equal(boltRange(g).count,9);
 assert.equal(boltRange(g).totalAvg,Math.round(maxHp({...g,armor:null,weapon:null})*3*Math.max(0,1-(fx(g).tribulation??0))));
 g.realm=6;reconcileProgression(s);assert.equal(g.fusionBonus,undefined);
 g.realm=8;g.exp=24000;const c=Object.values(s.cities).find(c=>c.owner===lord.id);c.prosperity=201;
 const toll=cityToll(s,c);assert(completeBreak(g,1,c.id));assert.equal(cityToll(s,c),toll*2);
 c.owner='neutral';reconcileProgression(s);assert.equal(g.realm,8);assert.equal(g.exp,0);assert.equal(g.boundCityId,undefined);
 const armorState=createGameState('liu',null), armorGeneral=Object.values(armorState.generals).find(g=>g.owner==='liu'&&g.isLord);
 const {makeEquipment}=require('../src/data/items.ts');
 armorGeneral.realm=6;armorGeneral.exp=10000;armorGeneral.weapon=makePersonalWeapon(armorGeneral.id,1);
 const originalWeapon=armorGeneral.weapon, armor=makeEquipment('fusion-armor-only','armor',9);
 armorGeneral.armor=armor;const armorBase={...armorGeneral.base};
 assert(completeBreak(armorGeneral,1));
 assert.equal(armorGeneral.fusionBonus.penetration??0,0,'armor alone grants no weapon penetration');
 assert.equal(armorGeneral.weapon,originalWeapon,'non-heaven weapon is not fused or reset');
 assert.equal(armorGeneral.armor,null);
 assert.equal(armorGeneral.base.hp,armorBase.hp+armor.hp);
 for(const key of ['force','defense'])assert.equal(armorGeneral.base[key],armorBase[key]+armor[key]);
 const {fusionSummary}=require('../src/ui/GeneralInfo.ts');assert(!fusionSummary(armorGeneral).includes('破防'));
 console.log('PASS: new-game pills, core bonus rollback, mortal trial, essences, weapon/armor-only fusion, city binding and realm fall');
})().catch(e=>{console.error(e);process.exitCode=1});
