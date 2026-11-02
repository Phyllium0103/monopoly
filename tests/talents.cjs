const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const{registerHooks,stripTypeScriptTypes}=require('node:module');const{pathToFileURL,fileURLToPath}=require('node:url');
registerHooks({resolve(s,c,n){if(s.startsWith('.')&&!path.extname(s)&&c.parentURL){const p=path.resolve(path.dirname(fileURLToPath(c.parentURL)),s+'.ts');if(fs.existsSync(p))return n(pathToFileURL(p).href,c);}return n(s,c);},load(u,c,n){return u.endsWith('.ts')?{format:'module',shortCircuit:true,source:stripTypeScriptTypes(fs.readFileSync(fileURLToPath(u),'utf8'),{mode:'transform'})}:n(u,c);}});
const T=require('../src/data/talents.ts');
const {createGameState,generalsOf}=require('../src/game/GameState.ts');
const {levelUp,attack,craft}=require('../src/systems/GeneralSystem.ts');
const {cityIncome,occupyCost,prosperityGrowth,cityToll,garrisonPower}=require('../src/systems/CitySystem.ts');
const {ITEM_DEFS,PILL_IDS,rollItemId,makeItem}=require('../src/data/items.ts');
const {aiSpendTalents}=require('../src/systems/AISystem.ts');
const {Engine}=require('../src/engine/Engine.ts'),{RecordingView}=require('../src/engine/view.ts');
const {resetPillChance}=require('../src/systems/RealmSystem.ts');

// ── 資料表 ──
const ids=new Set();
for(const n of T.TALENTS){
 assert.ok(!ids.has(n.id),'unique id '+n.id);ids.add(n.id);
 assert.ok(n.row>=1&&n.row<=6&&n.col>=0&&n.col<=4&&n.max>=1);
 assert.equal(n.requires.length===0,n.row===1,'only row 1 has no prerequisite: '+n.id);
 for(const r of n.requires){const o=T.TALENT_BY_ID[r];assert.ok(o&&o.tree===n.tree&&o.row<n.row,'prerequisite below in same tree: '+n.id+'→'+r);}
 assert.ok(!!(n.lord||n.general)&&n.text);
}
for(const t of T.TALENT_TREES){
 const nodes=T.TALENTS.filter(n=>n.tree===t.id);
 assert.equal(new Set(nodes.map(n=>n.row+':'+n.col)).size,nodes.length,'no overlapping cells in '+t.id);
 assert.equal(nodes.filter(n=>n.row===6).length,2,'two exclusive capstones in '+t.id);
 assert.ok(nodes.filter(n=>n.row<6).reduce((s,n)=>s+n.max,0)>=T.ROW_POINTS[6],'capstone reachable in '+t.id);
}
assert.deepEqual([1,2,3,4,5,6,7,8,9,10].map(T.talentPointsFor),[1,1,1,1,2,2,2,2,2,2],'化神起每次突破 2 點');

// ── 得點 ──
const fresh=()=>{const state=createGameState('liu',null);const lord=state.lords.liu;const gs=generalsOf(state,'liu');return{state,lord,gs};};
{
 const {state,lord,gs}=fresh();
 for(const l of Object.values(state.lords)){assert.equal(l.talentPoints,0,'fresh game starts with 0 points');assert.deepEqual(l.talents,{});}
 for(const g of Object.values(state.generals))assert.equal(g.peakRealm,g.realm,'peak realm recorded at start');
 const g=gs.find(x=>!x.isLord)??gs[0];g.realm=0;g.peakRealm=0;
 levelUp(g);assert.equal(lord.talentPoints,1);
 for(let r=2;r<=5;r++)levelUp(g);
 assert.equal(g.realm,5);assert.equal(lord.talentPoints,6,'1+1+1+1+2');assert.equal(lord.talentRealm,5);
 g.realm=0;for(let r=1;r<=5;r++)levelUp(g);
 assert.equal(lord.talentPoints,6,'兵解重練回到原境界不再得點');
 levelUp(g);assert.equal(lord.talentPoints,8,'超過最高境界才再得點');
 const stray=Object.values(state.generals).find(x=>!x.owner);
 if(stray){const before=Object.values(state.lords).map(l=>l.talentPoints);stray.peakRealm=stray.realm;levelUp(stray);assert.deepEqual(Object.values(state.lords).map(l=>l.talentPoints),before,'無主武將突破不給點');}
}

// ── 門檻與配點 ──
{
 const {state,lord,gs}=fresh();
 for(const g of gs)g.realm=Math.min(g.realm,2);lord.talentRealm=0;lord.talentPoints=30;
 assert.equal(T.canLearnTalent(state,lord,'constructor').ok,false,'prototype keys are not talents');
 assert.equal(T.canLearnTalent(state,lord,'g_tariff').ok,false,'row 2 needs prerequisite');
 for(let i=0;i<3;i++)assert.ok(T.learnTalent(state,lord,'g_reclaim'));
 assert.equal(T.learnTalent(state,lord,'g_reclaim'),false,'max rank');
 assert.equal(T.canLearnTalent(state,lord,'g_tariff').ok,false,'row 2 needs 4 lower points');
 assert.ok(T.learnTalent(state,lord,'g_wealth'));assert.ok(T.learnTalent(state,lord,'g_tariff'));
 for(let i=0;i<3;i++)T.learnTalent(state,lord,'g_wealth');T.learnTalent(state,lord,'g_tariff');T.learnTalent(state,lord,'g_tariff');
 assert.equal(T.talentSpent(lord,'govern'),9);
 assert.match(T.canLearnTalent(state,lord,'g_vein').reason,/金丹/,'row 3 needs a 金丹 general');
 gs[0].realm=3;assert.ok(T.canLearnTalent(state,lord,'g_vein').ok);
 assert.equal(lord.talentPoints,21);

 // 忘塵丹：只能退末端
 assert.equal(T.canRefundTalent(lord,'g_tariff').ok,false,'needs item');
 lord.items.push(makeItem('i-r1','talentrefund',0),makeItem('i-r2','talentrefund',0));
 const tight={...lord,talents:{g_reclaim:3,g_wealth:1,g_tariff:1}};
 assert.match(T.canRefundTalent(tight,'g_reclaim').reason,/關稅/,'refund cannot break the row-2 gate');
 assert.equal(T.canRefundTalent({...lord,talents:{g_wealth:1,g_tariff:1,g_reclaim:3}},'g_wealth').ok,false,'refund cannot strand a node');
 assert.ok(T.refundTalent(lord,'g_tariff'));assert.equal(T.talentRank(lord,'g_tariff'),2);assert.equal(lord.talentPoints,22);
 assert.equal(lord.items.filter(i=>i.defId==='talentrefund').length,1,'consumes one pill');
 // 頂層二選一
 const cap={...lord,talents:{g_treasury:1,g_levy:1,g_rich:3,g_mine:1,g_vein:3,g_trade:3,g_pacify:1,g_tariff:3,g_thrift:3,g_reclaim:3,g_wealth:3,g_farm:3},talentPoints:5,talentRealm:7};
 assert.ok(T.learnTalent(state,cap,'g_heaven'));assert.match(T.canLearnTalent(state,cap,'g_market').reason,/二選一/);
 // 輪迴丹
 assert.equal(T.canResetTalents(lord).ok,false);
 lord.items.push(makeItem('i-x','talentreset',0));
 const spent=T.talentSpent(lord),pts=lord.talentPoints;
 assert.ok(T.resetTalents(lord));assert.deepEqual(lord.talents,{});assert.equal(lord.talentPoints,pts+spent);
}

// ── 效果 ──
{
 const {state,lord,gs}=fresh();
 const city=Object.values(state.cities).find(c=>c.owner==='liu')??Object.values(state.cities)[0];city.owner='liu';city.prosperity=100;
 const base={inc:cityIncome(city,[]).stones,grow:prosperityGrowth(city),toll:cityToll(state,city),def:garrisonPower(state,city)};
 const g=gs[0],atk0=attack(g),craft0=craft(g,'alchemy');
 lord.talents={g_reclaim:3,g_wealth:3,g_tariff:3,w_force:3,w_guard:3,w_hold:3,c_breath:1,c_alchemy:3};
 assert.equal(cityIncome(city,[]).stones,Math.round(base.inc/1*1.03),'聚財 3 級：靈石收入 +3%');
 assert.ok(Math.abs(prosperityGrowth(city)-base.grow*1.06)<1e-9,'墾荒 3 級：繁榮成長 +6%');
 assert.ok(cityToll(state,city)>base.toll,'關稅提高過路費');
 assert.ok(garrisonPower(state,city)>=Math.round(base.def*1.09/1.0)-1,'堅守提高守城戰力');
 assert.ok(attack(g)>atk0,'武力天賦作用在隊伍武將');assert.ok(craft(g,'alchemy')>craft0,'丹心提高煉丹');
 const neutral=Object.values(state.cities).find(c=>c.owner==='neutral');
 if(neutral){const c0=occupyCost(neutral,lord);lord.talents.g_pacify=1;assert.ok(occupyCost(neutral,lord)<=c0,'懷柔降低安撫費');}
 const other=generalsOf(state,'cao')[0],o0=attack(other);assert.equal(attack(other),o0,'別的主公不受影響');
}

// ── 舊存檔與電腦 ──
{
 const {state,lord,gs}=fresh();
 for(const l of Object.values(state.lords)){delete l.talents;delete l.talentPoints;delete l.talentRealm;}
 for(const g of Object.values(state.generals))delete g.peakRealm;
 gs[0].realm=5;
 const expect=generalsOf(state,'liu').filter(g=>!g.ghostSourceId).reduce((s,g)=>{let p=0;for(let r=1;r<=g.realm;r++)p+=T.talentPointsFor(r);return s+p;},0);
 T.ensureTalentState(state);
 assert.equal(lord.talentPoints,expect,'old saves back-fill points from current realms');
 assert.equal(gs[0].peakRealm,5);
 aiSpendTalents(state,lord);
 assert.ok(T.talentSpent(lord,'cultivate')>0,'劉備電腦優先點修行');
 assert.ok(lord.talentPoints===0||T.TALENTS.every(n=>!T.canLearnTalent(state,lord,n.id).ok),'AI spends every usable point');
}

// ── 引擎動作 ──
{
 const state=createGameState('liu',null),view=new RecordingView();const engine=new Engine(state,{view,send:async()=>null,isAuto:()=>false,multiplayer:true});
 const lord=state.lords.liu;lord.talentPoints=1;
 engine.talentAction(lord,{type:'talent',op:'learn',node:'constructor'});assert.equal(lord.talentPoints,1,'bad node rejected');
 engine.talentAction(lord,{type:'talent',op:'learn',node:'w_force'});assert.equal(T.talentRank(lord,'w_force'),1);assert.equal(lord.talentPoints,0);
 engine.talentAction(lord,{type:'talent',op:'refund',node:'w_force'});assert.equal(T.talentRank(lord,'w_force'),1,'refund without pill rejected');
 engine.talentAction(lord,{type:'talent',op:'reset'});assert.equal(T.talentRank(lord,'w_force'),1,'reset without pill rejected');
}

// ── 洗點丹 ──
assert.equal(ITEM_DEFS.talentrefund.category,'丹藥');assert.ok(ITEM_DEFS.talentrefund.weight>0,'忘塵丹會在百草堂出現');
assert.ok(ITEM_DEFS.talentrefund.price[0]<=500,'忘塵丹低價');
assert.equal(ITEM_DEFS.talentreset.weight,0,'輪迴丹不進商店與一般掉落');
for(let i=0;i<2000;i++)assert.notEqual(rollItemId(PILL_IDS),'talentreset');
assert.equal(resetPillChance({level:2}),0);assert.ok(resetPillChance({level:3})>0);
assert.ok(resetPillChance({level:8})>resetPillChance({level:3}));assert.equal(resetPillChance({level:3,blessed:true}),resetPillChance({level:3})*2);
for(const id of ['talentrefund','talentreset'])assert.ok(fs.existsSync(path.join(__dirname,'..','public/art/icons/realm',id+'.svg')),'icon '+id);

console.log('talent tree rules ok');
