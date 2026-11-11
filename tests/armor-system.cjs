const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const { registerHooks, stripTypeScriptTypes } = require('node:module');
const { pathToFileURL, fileURLToPath } = require('node:url');
registerHooks({
  resolve(s, c, n) { if (s.startsWith('.') && !path.extname(s) && c.parentURL) { const p = path.resolve(path.dirname(fileURLToPath(c.parentURL)), s + '.ts'); if (fs.existsSync(p)) return n(pathToFileURL(p).href, c); } return n(s, c); },
  load(u, c, n) { if (u.endsWith('.css')) return { format: 'module', shortCircuit: true, source: '' }; return u.endsWith('.ts') ? { format: 'module', shortCircuit: true, source: stripTypeScriptTypes(fs.readFileSync(fileURLToPath(u), 'utf8'), { mode: 'transform' }) } : n(u, c); },
});
const { ARMOR_DEFS, makeEquipment, equipRealm, equipDesc, makeTechnique } = require('../src/data/items.ts');
const { createGameState } = require('../src/game/GameState.ts');
const { transferArmor, armorTransferCheck, maxHp, equip } = require('../src/systems/GeneralSystem.ts');
const { bindPassiveState } = require('../src/data/passives.ts');
const { makeStock, makeSellStock } = require('../src/systems/ShopSystem.ts');
const { auctionLot } = require('../src/systems/EventSystem.ts');
const { grantTournamentPrize } = require('../src/systems/TournamentSystem.ts');
const { Engine } = require('../src/engine/Engine.ts'), { RecordingView } = require('../src/engine/view.ts');
const { RosterEquipment, armorPicture, techniquePicture } = require('../src/ui/RosterEquipment.ts');
const { equipIconUrl } = require('../src/ui/Icons.ts');
const { compareArmor } = require('../src/data/armorCatalog.ts');
const { equipTechnique, techniqueTransferCheck } = require('../src/systems/GeneralSystem.ts');
const cases = [
  ['chiyou', ['染血的布篷', '山賊獸皮氅', '蠻王獸骨氅', '蚩尤魔神氅'], 'force'],
  ['houtou', ['散架的竹編甲', '民兵竹編甲', '烏戈藤甲', '后土承天甲'], 'defense'],
  ['nuwa', ['褪色的紅頭巾', '舞姬紅綾巾', '洛神流雲綾', '女媧補天綾'], 'hp'],
  ['shennong', ['燒焦的粗布衣', '藥鋪學徒衫', '華佗青囊袍', '神農百草衣'], 'alchemy'],
  ['pangu', ['變形的舊皮鎧', '皮製鐵匠圍裙', '干將鑄魂鎧', '盤古開天鎧'], 'forging'],
  ['cangjie', ['畫錯符文的法袍', '太平道袍', '南華天書袍', '倉頡泣鬼袍'], 'talisman'],
  ['fuxi', ['打結的破漁網', '漁翁避雨蓑', '河圖洛書紗', '伏羲八卦紗'], 'formation'],
  ['hongjun', ['戲班的假龍袍', '太守朝服', '真龍天子袞', '鴻鈞大道袞'], 'combat'],
  ['buddha', ['蟲蛀的舊僧衣', '行腳百衲衣', '錦斕袈裟', '如來萬佛袈裟'], 'arts'],
];
const arts = ['alchemy', 'forging', 'talisman', 'formation'];
const grades = ['huang', 'xuan', 'di', 'tian'];
assert.equal(ARMOR_DEFS.length, 36);
assert.equal(new Set(ARMOR_DEFS.map(d => d.id)).size, 36);
for (let grade = 0; grade < 4; grade++) for (const [family, names, stat] of cases) {
  const e = makeEquipment('fixture', 'armor', grade * 3, `${family}-${grades[grade]}`);
  const primary = [10, 20, 35, 50][grade], combat = [5, 15, 25, 35][grade];
  assert.equal(e.name, ['黃階', '玄階', '地階', '天階'][grade] + '・' + names[grade]);
  assert.equal(e.force, stat === 'force' ? primary : stat === 'combat' ? combat : 0, e.name);
  assert.equal(e.defense, stat === 'defense' ? primary : stat === 'combat' ? combat : 0, e.name);
  assert.equal(e.hp, (stat === 'hp' ? [150, 300, 450, 750] : [60, 120, 200, 300])[grade], e.name);
  for (const art of arts) assert.equal(e.craft[art] ?? 0, stat === art ? primary : stat === 'arts' ? [5, 10, 15, 30][grade] : 0, e.name + art);
  assert.equal(e.price, (['combat', 'arts'].includes(stat) ? [2500, 6000, 18000, 60000] : [1500, 4000, 12000, 40000])[grade], e.name);
  assert.equal(equipRealm(e.tier), [0, 2, 4, 6][grade]);
  assert.ok(!/[上中下]品|黃品|玄品|地品|天品/.test(e.name));
  assert.equal(equipIconUrl(e), `./art/icons/armor/${e.designId}.webp`);
}
for (let t = 0; t < 12; t++) for (let n = 0; n < 20; n++) {
  const e = makeEquipment('random', 'armor', t);
  assert.equal(e.tier, Math.floor(t / 3) * 3);
  assert.ok(ARMOR_DEFS.some(d => d.id === e.designId && d.tier === e.tier));
}
assert.throws(() => makeEquipment('bad', 'armor', 0, 'armor-雲紋袍'));
assert.equal(makeTechnique('tech', 11, 'metal').tier, 11, 'technique subgrades remain independent');
console.log('PASS all 36 approved names, every stat, prices, four grades, realm gates and technique isolation');
const sortedArmor = [...ARMOR_DEFS].reverse().map(d => makeEquipment('order-' + d.id, 'armor', d.tier, d.id)).sort(compareArmor);
assert.deepEqual(sortedArmor.map(e => e.designId), grades.flatMap(g => ['nuwa','chiyou','houtou','shennong','pangu','cangjie','fuxi','hongjun','buddha'].map(f => `${f}-${g}`)));
const { sortOffers } = require('../src/systems/ShopSystem.ts');
const armorOffers = sortedArmor.map(e => ({ kind: 'equipment', equipment: e, label: e.name, price: e.price, sub: '' }));
assert.deepEqual(sortOffers([...armorOffers].reverse()).map(o => o.equipment.designId), sortedArmor.map(e => e.designId));
assert.deepEqual(sortOffers([...armorOffers].reverse().concat({kind:'technique',technique:makeTechnique('mixed',11,'metal'),price:100,label:'功法',sub:''})).filter(o=>o.kind==='equipment').map(o=>o.equipment.designId), sortedArmor.map(e=>e.designId));
console.log('PASS grade-first HP/force/defense/alchemy/forging/talisman/formation/combat/arts ordering in bags and shops');

function fixture() {
  const state = createGameState('liu'); bindPassiveState(state);
  const lord = state.lords.liu;
  const own = Object.values(state.generals).filter(g => g.owner === lord.id);
  const [a, b] = own; a.realm = b.realm = 6;
  const low = makeEquipment('low', 'armor', 0, 'chiyou-huang');
  const high = makeEquipment('high', 'armor', 9, 'buddha-tian'); high.purchasePrice = 45678;
  lord.gear = [low, high];
  return { state, lord, a, b, low, high };
}
function ids(state) { return [...Object.values(state.lords).flatMap(l => l.gear.map(e => e.uid)), ...Object.values(state.generals).flatMap(g => g.armor ? [g.armor.uid] : [])].sort(); }
{
  const { state, lord, a, b, low, high } = fixture(), initial = ids(state);
  const move = (uid, from, to) => { assert.equal(transferArmor(state, lord, uid, from, to), true); assert.deepEqual(ids(state), initial); };
  move(low.uid, undefined, a.id); a.hp = maxHp(a);
  move(high.uid, undefined, a.id);
  assert.equal(a.armor, high); assert.ok(lord.gear.includes(low));
  assert.equal(high.purchasePrice, 45678, 'purchase record survives transfer');
  move(high.uid, a.id, b.id); assert.equal(a.armor, null); assert.equal(b.armor, high); assert.ok(a.hp <= maxHp(a));
  move(high.uid, b.id); assert.equal(b.armor, null);
  const reloaded = JSON.parse(JSON.stringify(state));
  assert.deepEqual(ids(reloaded), initial); assert.equal(reloaded.lords.liu.gear.find(e => e.uid === high.uid).purchasePrice, 45678);
  assert.equal(createGameState('liu').lords.liu.gear.length, 0, 'new games do not inherit prior equipment');
}
{
  const { state, lord, a, b, high } = fixture();
  const reject = (uid, from, to) => { const before = JSON.stringify(state); assert.equal(transferArmor(state, lord, uid, from, to), false); assert.equal(JSON.stringify(state), before); };
  a.realm = 0; reject(high.uid, undefined, a.id); a.realm = 6;
  reject(high.uid, undefined, 'caocao'); reject('missing', undefined, a.id); reject(high.uid, undefined, 'missing');
  for (const flag of ['realm', 'ghost', 'mortal']) {
    if (flag === 'realm') a.status = 'realm';
    if (flag === 'ghost') a.ghostSourceId = 'caocao';
    if (flag === 'mortal') a.mortalTrial = { turnsLeft: 3 };
    reject(high.uid, undefined, a.id); a.status = 'free'; delete a.ghostSourceId; delete a.mortalTrial;
  }
  assert.equal(transferArmor(state, lord, high.uid, undefined, a.id), true);
  reject(high.uid, undefined, a.id); reject(high.uid, a.id, a.id); reject(high.uid, 'caocao', b.id);
  a.status = 'realm'; reject(high.uid, a.id); a.status = 'free';
  lord.gear.push(high); reject(high.uid, a.id, b.id); lord.gear.pop();
  state.over = true; reject(high.uid, a.id);
}
{
  const { lord, a, high } = fixture(); a.realm = 0;
  equip(lord, a, high); assert.equal(a.armor, null);
  a.realm = 6; equip(lord, a, high); const count = lord.gear.length;
  equip(lord, a, high); assert.equal(lord.gear.length, count); assert.equal(a.armor, high);
}
console.log('PASS atomic exchanges, unequip, UID conservation, purchase records, roundtrip, repeats, realm/ownership/away/duplicate rejection');

{
  const { state, lord } = fixture();
  for (const round of [1, 20, 100]) {
    state.round = round;
    for (const o of makeStock(state, lord, 'forge')) { assert.equal(o.kind, 'equipment'); const d = ARMOR_DEFS.find(d => d.id === o.equipment.designId); assert.ok(d); assert.equal(o.equipment.price, d.price); assert.equal(o.price, d.price); }
  }
  const original = Math.random;
  try {
    Math.random = () => 0; const lot = auctionLot(state); assert.equal(lot.kind, 'equipment'); assert.equal(lot.equipment.tier, 9); assert.equal(lot.price, 40000);
    Math.random = () => .99; const prize = grantTournamentPrize(state, lord); assert.equal(prize.kind, 'equipment'); assert.equal(prize.equipment.tier, 9); assert.equal(prize.equipment.price, 60000);
  } finally { Math.random = original; }
  const gift = lord.gear.find(e => e.uid === 'low');
  assert.equal(makeSellStock(lord, 'forge').find(o => o.equipment?.uid === gift.uid).price, 750);
}
console.log('PASS forge stock, auction, tournament rewards and gift sell values use current fixed definitions');

// Isolated DOM/event adapter: no browser, network, layout engine or user session.
class Element {
  constructor(dataset = {}) { this.dataset = dataset; this.attributes = {}; this.children=[]; this.style={}; this.classes=new Set(); this.classList={toggle:(k,on)=>on?this.classes.add(k):this.classes.delete(k),contains:k=>this.classes.has(k),remove:(...ks)=>ks.forEach(k=>this.classes.delete(k))}; }
  hasAttribute(k) { return k.startsWith('data-') && Object.hasOwn(this.dataset,k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())); }
  closest(selector) { return selector.split(',').some(s=>this.hasAttribute(s.trim().slice(1,-1))) ? this : this.parent?.closest(selector)??null; }
  setAttribute(k,v) { this.attributes[k]=v; }
  appendChild(el) { this.children.push(el);el.parent=this;return el; }
  remove() { if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this); }
  querySelector(selector) { if(selector==='button')return this.button??=new Element(); return this.children.find(x=>x.closest(selector)===x)??null; }
}
class Root extends Element {
  constructor(elements) { super();this.elements=elements;this.events={};this.status=new Element();this.ownerDocument={defaultView:{innerWidth:800,innerHeight:600},body:new Element(),createElement:()=>new Element()}; }
  addEventListener(type,fn){this.events[type]=fn;}
  querySelectorAll(){return this.elements;}
  querySelector(s){if(s==='.equipment-feedback')return this.status;return this.children.find(x=>'.'+x.className===s)??null;}
  contains(el){return this.elements.includes(el);}
  fire(type,target,more={}){const e={target,preventDefault(){this.prevented=true},stopPropagation(){},...more};this.events[type]?.(e);return e;}
}
{
  const {state,lord,a,b,low,high}=fixture();
  const bagLow=new Element({equipmentKind:'armor',equipmentItem:low.uid}),bagHigh=new Element({equipmentKind:'armor',equipmentItem:high.uid});
  const target=new Element({equipmentKind:'armor',equipmentTarget:a.id}),other=new Element({equipmentKind:'armor',equipmentTarget:b.id}),empty=new Element({inventorySlot:'19'});
  const root=new Root([bagLow,bagHigh,target,other,empty]),actions=[],controls=new RosterEquipment(root,a=>actions.push(a));
  controls.update(state,lord,true);assert(target.classes.has('equipment-compatible'));
  root.fire('click',bagLow);assert(bagLow.classes.has('armor-selected'));assert(root.classes.has('equipment-carrying'));
  root.fire('keydown',bagLow,{key:'Escape'});assert(!root.classes.has('equipment-carrying'));assert.equal(actions.length,0);
  root.fire('click',bagLow);root.fire('click',target);assert.equal(actions.pop().toGeneralId,a.id);assert.equal(a.armor,null,'only host mutates items');
  transferArmor(state,lord,low.uid,undefined,a.id);target.dataset.equipmentItem=low.uid;controls.update(state,lord,true);
  root.fire('click',target);root.fire('click',empty);assert.equal(actions.pop().bagSlot,19,'explicit destination cell');
  a.realm=0;controls.update(state,lord,true);root.fire('click',bagHigh);root.fire('click',target);assert.equal(actions.length,0);assert.match(root.status.textContent,/需要煉虛/);assert(root.querySelector('.equipment-notice'));
  controls.clear();a.realm=6;const drag=root.fire('dragstart',bagHigh);assert.equal(drag.prevented,true);assert.equal(bagHigh.draggable,false);assert.equal(actions.length,0);
  controls.update(state,lord,false);root.fire('click',bagHigh);assert.equal(actions.length,0);assert.match(root.status.textContent,/整備/);
  const html=armorPicture(high,a.id);assert.match(html,/data-tip-html=/);assert(!/價值|價格|＋/.test(html));assert(!/＋/.test(armorPicture(null,a.id)));
}
console.log('PASS click carry/place, empty destination, no native drag, Escape, realm failure notice, read-only and price-free rich armor tooltip');

{
  const { state, lord, a, b } = fixture(); a.aptitude = 'heaven'; b.aptitude = 'water';
  const scroll = makeTechnique('direct-fire', 0, 'fire'); lord.scrolls = [scroll];
  const reject = id => { const before = JSON.stringify(state); assert.equal(equipTechnique(state,lord,scroll.uid,id),false); assert.equal(JSON.stringify(state),before); };
  reject('caocao'); reject(b.id);
  for(const flag of ['realm','mortal','ghost']) {
    if(flag==='realm')a.status='realm'; if(flag==='mortal')a.mortalTrial={turns:2,weapon:null}; if(flag==='ghost')a.ghostSourceId='caocao';
    reject(a.id); a.status='free'; delete a.mortalTrial; delete a.ghostSourceId;
  }
  lord.scrolls.push(scroll); reject(a.id); lord.scrolls.pop();
  assert.equal(techniqueTransferCheck(state,lord,scroll.uid,a.id).ok,true);
  assert.equal(equipTechnique(state,lord,scroll.uid,a.id),true); assert.equal(a.technique,scroll); assert.equal(lord.scrolls.length,0);
  reject(a.id); assert.equal(a.technique,scroll);
}
{
 const {state,lord,a,b,low}=fixture();a.aptitude='heaven';b.aptitude='water';
 const scroll=makeTechnique('pointer-fire',0,'fire');lord.scrolls=[scroll];
 const source=new Element({equipmentKind:'technique',equipmentItem:scroll.uid}),target=new Element({equipmentKind:'technique',equipmentTarget:a.id}),wrong=new Element({equipmentKind:'technique',equipmentTarget:b.id}),armor=new Element({equipmentKind:'armor',equipmentTarget:a.id});
 const root=new Root([source,target,wrong,armor]),actions=[],controls=new RosterEquipment(root,a=>actions.push(a));controls.update(state,lord,true);
 root.fire('pointermove',source,{clientX:100,clientY:140});root.fire('click',source);const cursor=root.ownerDocument.body.children[0];assert.equal(cursor.style.transform,'translate3d(73px,113px,0)');
 root.fire('pointermove',source,{clientX:260,clientY:280});assert.equal(cursor.style.transform,'translate3d(233px,253px,0)');assert(target.classes.has('equipment-compatible'));assert(wrong.classes.has('armor-unavailable'));
 root.fire('click',armor);assert.equal(actions.length,0);assert.equal(root.ownerDocument.body.children.length,1);assert.match(root.status.textContent,/功法只能放入功法格/);
 root.fire('click',wrong);assert.match(root.status.textContent,/五行不符/);assert.equal(actions.length,0);
 root.fire('click',target);assert.deepEqual(actions.pop(),{type:'learn-technique',itemUid:scroll.uid,generalId:a.id});assert.equal(root.ownerDocument.body.children.length,0);
 controls.update(state,lord,false,true);root.fire('click',source);root.fire('click',target);assert.equal(actions.pop().type,'learn-technique');assert.equal(source.draggable,false);
 root.fire('click',source);controls.update(state,lord,false,false);assert.equal(root.ownerDocument.body.children.length,0);
 assert(!/data-equipment-item=/.test(techniquePicture(scroll,a.id)));assert(!/＋/.test(techniquePicture(null,a.id)));
}
console.log('PASS typed click slots, cursor replaces pointer, invalid root preserves source, mode changes cancel selection and learned techniques remain bound');

{
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../art-src/manifests/armor-icons.json')));
  assert.equal(manifest.count, 36); assert.ok(manifest.bytes < 700000); assert.ok(manifest.bytes < manifest.sourceBytes * .02);
  const hashes = new Set(), pack = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/art/pack.json')));
  for (const d of ARMOR_DEFS) {
    const m = manifest.assets.find(a => a.id === d.id); assert.ok(m);
    const image = fs.readFileSync(path.join(__dirname, '..', m.file));
    assert.equal(image.subarray(8, 12).toString(), 'WEBP'); assert.equal(image.subarray(12, 16).toString(), 'VP8X'); assert.ok(image[20] & 0x10);
    assert.equal(image.readUIntLE(24, 3) + 1, m.size[0]); assert.equal(image.readUIntLE(27, 3) + 1, m.size[1]); assert.ok(m.size.every(n => n <= 256));
    const hash = crypto.createHash('sha256').update(image).digest('hex'); assert.equal(hash, m.sha256); hashes.add(hash);
    assert.ok(pack[`icons/armor/${d.id}`], d.id + ' included in opening art pack');
  }
  assert.equal(hashes.size, 36); assert.ok(!Object.keys(pack).some(k => k.startsWith('icons/寶衣/')));
}
console.log('PASS 36 distinct compressed RGBA WebPs, dimensions, hashes, total budget and active art-pack coverage');

(async () => {
  const { state, lord, a, high } = fixture();
  a.aptitude='heaven';const scroll=makeTechnique('host-scroll',0,'fire');lord.scrolls=[scroll];
  const actions = [
    { type: 'transfer-armor', itemUid: high.uid, toGeneralId: 'caocao' },
    { type: 'transfer-armor', itemUid: high.uid, toGeneralId: a.id },
    { type: 'learn-technique', itemUid: scroll.uid, generalId: 'caocao' },
    { type: 'learn-technique', itemUid: scroll.uid, generalId: a.id },
    { type: 'learn-technique', itemUid: scroll.uid, generalId: a.id },
    { type: 'transfer-armor', itemUid: high.uid, toGeneralId: a.id },
    { type: 'close' },
  ];
  const engine = new Engine(state, { view: new RecordingView(), send: async () => actions.shift(), isAuto: () => false, multiplayer: true });
  await engine.rosterFlow(lord);
  assert.equal(a.armor, high); assert.ok(!lord.gear.includes(high)); assert.equal(new Set(ids(state)).size, ids(state).length);
  assert.equal(a.technique,scroll);assert.equal(lord.scrolls.length,0);
  console.log('PASS multiplayer roster host applies valid armor/technique actions and rejects enemy/replayed transfers');
})().catch(e => { console.error(e); process.exitCode = 1; });
