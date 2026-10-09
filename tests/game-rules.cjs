const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { registerHooks, stripTypeScriptTypes } = require('node:module');
const { pathToFileURL, fileURLToPath } = require('node:url');
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && !path.extname(specifier) && context.parentURL) {
      const file = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier + '.ts');
      if (fs.existsSync(file)) return nextResolve(pathToFileURL(file).href, context);
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith('.ts')) return { format: 'module', shortCircuit: true,
      source: stripTypeScriptTypes(fs.readFileSync(fileURLToPath(url), 'utf8'), { mode: 'transform' }) };
    return nextLoad(url, context);
  }
});
const { createGameState, freeGenerals, PARTY_LIMIT } = require('../src/game/GameState.ts');
const { GENERAL_SEEDS, HIDDEN_SEEDS, APTITUDE_NAMES } = require('../src/data/generals.ts');
const { garrisonDispatch } = require('../src/systems/GarrisonSystem.ts');
const { sectDispatchFee, sectTransferRequirement, transferSectGeneral } = require('../src/systems/SectSystem.ts');
const { weaponUpgradeTip, upgradeWeapon, upgradeRequirement } = require('../src/systems/MaterialSystem.ts');
const { WEAPON_CATALOG, MATERIAL_NAMES, makePersonalWeapon } = require('../src/data/weaponCatalog.ts');
const { generalInfo } = require('../src/ui/GeneralInfo.ts');
const { aiManageSect } = require('../src/systems/AISystem.ts');
let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`PASS ${name}`); }
test('All 175 selected base PNGs match the name mapping, dimensions and source SHA', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../docs/base-general-art.json')));
  const seeds = [...GENERAL_SEEDS, ...HIDDEN_SEEDS];
  assert.equal(manifest.count, 175);
  assert.equal(manifest.images.length, seeds.length);
  assert.equal(new Set(manifest.images.map(r => r.id)).size, 175);
  for (const g of seeds) {
    const r = manifest.images.find(r => r.id === g.id);
    assert.equal(r.name, g.name);
    assert.equal(r.weapon, WEAPON_CATALOG[g.id].names[3]);
    const bytes = fs.readFileSync(path.join(__dirname, '../public', r.file));
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), r.sha256);
    assert.equal(bytes.readUInt32BE(16), r.width);
    assert.equal(bytes.readUInt32BE(20), r.height);
    assert.ok(r.width <= 1145 && r.height <= 1536);
    assert.equal(bytes[25], 6, `${g.name} must retain RGBA`);
  }
});
test('Dispatch at the lord current city costs zero; distance still charges remotely', () => {
  const state = createGameState('liu'), lord = state.lords.liu;
  const city = Object.values(state.cities).find(c => c.owner === lord.id);
  lord.position = city.tile;
  assert.deepEqual(garrisonDispatch(state, lord, city), { distance: 0, fee: 0 });
  lord.position = state.tiles[city.tile].links[0];
  const r = garrisonDispatch(state, lord, city);
  assert.ok(r.distance > 0 && r.fee >= 10 && r.fee <= 1000 && r.fee % 10 === 0);
});
test('Sect fee: own and empty city free; road and enemy city cost 10', () => {
  const state = createGameState('liu'), lord = state.lords.liu;
  for (const city of Object.values(state.cities)) {
    lord.position = city.tile;
    assert.equal(sectDispatchFee(state, lord), city.owner === 'neutral' || city.owner === 'liu' ? 0 : 10);
  }
  lord.position = state.tiles.find(t => t.kind !== 'city').index;
  assert.equal(sectDispatchFee(state, lord), 10);
});
test('Sect transfers charge once in either direction and respect funds, ownership and party limits', () => {
  const state = createGameState('liu'), lord = state.lords.liu;
  lord.position = state.tiles.find(t => t.kind !== 'city').index;
  const g = state.generals.guanyu;
  lord.stones = 20;
  transferSectGeneral(state, lord, g);
  assert.equal(lord.stones, 10); assert.equal(g.status, 'sect');
  transferSectGeneral(state, lord, g);
  assert.equal(lord.stones, 0); assert.equal(g.status, 'free');
  assert.throws(() => transferSectGeneral(state, lord, g), /靈石不足/);
  assert.equal(g.status, 'free'); assert.equal(lord.stones, 0);
  const city = Object.values(state.cities).find(c => c.owner === 'liu');
  lord.position = city.tile;
  transferSectGeneral(state, lord, g);
  assert.equal(g.status, 'sect'); assert.equal(lord.stones, 0);
  assert.equal(sectTransferRequirement(state, lord, state.generals.liubei).ok, false);
  assert.equal(sectTransferRequirement(state, lord, state.generals.liushan).ok, false);
  assert.equal(sectTransferRequirement(state, lord, state.generals.caocao).ok, false);
  const extra = Object.values(state.generals).filter(x => x.owner === 'liu' && x.status === 'sect' && x.id !== g.id);
  while (freeGenerals(state, 'liu').length < PARTY_LIMIT) extra.shift().status = 'free';
  assert.equal(sectTransferRequirement(state, lord, g).ok, false);
  assert.throws(() => transferSectGeneral(state, lord, g), /隨行已滿/);
  assert.equal(lord.stones, 0);
  g.status = 'realm'; assert.equal(sectTransferRequirement(state, lord, g).ok, false);
});
test('AI observes the same per-person sect fee and never exceeds party limit', () => {
  const state = createGameState('liu'), lord = state.lords.liu;
  lord.position = state.tiles.find(t => t.kind !== 'city').index;
  state.generals.guanyu.status = 'sect'; state.generals.zhangfei.status = 'sect';
  lord.stones = 10;
  const before = freeGenerals(state, 'liu').length;
  aiManageSect(state, lord);
  assert.equal(lord.stones, 0); assert.equal(freeGenerals(state, 'liu').length, before + 1);
  assert.ok(freeGenerals(state, 'liu').length <= PARTY_LIMIT);
});
test('Weapon hover exposes all upgrade materials, including insufficient funds and away generals', () => {
  const state = createGameState('liu'), lord = state.lords.liu;
  for (const seed of [...GENERAL_SEEDS, ...HIDDEN_SEEDS]) {
    const g = { ...state.generals.liubei, id: seed.id, isLord: false };
    for (let stage = 0; stage < 4; stage++) {
      g.weapon = makePersonalWeapon(g.id, stage);
      const tip = weaponUpgradeTip(lord, g);
      if (stage === 3) assert.match(tip, /已達天階/);
      else {
        assert.ok(tip.includes(MATERIAL_NAMES[WEAPON_CATALOG[g.id].material][stage]));
        assert.ok(tip.includes([10,5,1][stage] + ' 顆'));
        g.status = 'realm'; assert.equal(weaponUpgradeTip(lord, g), tip);
        g.status = 'free';
      }
    }
  }
  const g = state.generals.guanyu, group = WEAPON_CATALOG.guanyu.material;
  lord.materials[group][0] = 10;
  assert.equal(upgradeRequirement(lord, g).ok, true);
  upgradeWeapon(lord, g);
  assert.equal(lord.materials[group][0], 0);
  assert.ok(weaponUpgradeTip(lord, g).includes('5 顆'));
});
test('Dispatch selection includes every spiritual root name', () => {
  const g = createGameState('liu').generals.guanyu;
  for (const aptitude of Object.keys(APTITUDE_NAMES)) {
    g.aptitude = aptitude;
    assert.ok(generalInfo(g).includes(APTITUDE_NAMES[aptitude]));
  }
});
console.log(`${passed} verification groups passed.`);
