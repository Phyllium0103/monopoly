// 數值規則：功法（五行／技藝）、過路費、繁榮成長、城池不再受地形影響
const fs = require('node:fs');
const path = require('node:path');
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
  },
});
const items = require('../src/data/items.ts');
const { createGameState } = require('../src/game/GameState.ts');
const { toll, prosperityGrowth, cityIncome } = require('../src/systems/CitySystem.ts');
const { attack, canLearn, passiveExp } = require('../src/systems/GeneralSystem.ts');
const { bindPassiveState } = require('../src/data/passives.ts');

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`PASS ${name}`); };
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} != ${b}`);

test('Five-element techniques: speed, force, skill multiplier, price and names by tier', () => {
  const speed = [0.1, 0.14, 0.18, 0.2, 0.24, 0.28, 0.3, 0.34, 0.38, 0.4, 0.44, 0.48];
  const force = [0.05, 0.07, 0.1, 0.1, 0.12, 0.15, 0.2, 0.22, 0.25, 0.35, 0.37, 0.4];
  const skill = [1.8, 1.9, 2.0, 2.3, 2.4, 2.5, 2.8, 2.9, 3.0, 3.3, 3.4, 3.5];
  const price = [6, 9, 12, 20, 25, 40, 60, 75, 100, 150, 250, 400];
  for (let t = 0; t < 12; t++) {
    const tech = items.makeTechnique('x', t, 'metal');
    close(items.techniqueSpeed(tech), speed[t], `speed tier ${t}`);
    close(items.techniqueForce(tech), force[t], `force tier ${t}`);
    assert.equal(items.techniqueSkillPower(tech), skill[t]);
    assert.equal(tech.price, price[t] * 100, 'prices are in 中品 (100 下品 each)');
    assert.equal(items.techniqueKeepPill(tech), 0);
  }
  const names = { metal: ['庚金劍訣', '辟邪神雷', '九轉暗金身', '神劍御雷真訣'], wood: ['長春功', '青元劍訣', '草木皆兵訣', '青天化龍訣'],
    water: ['玄冰訣', '寒門養念訣', '龍象化海經', '水澤國度'], fire: ['離火訣', '焚天火焰刀', '焚香玉冊', '太陽真經'], earth: ['人山訣', '元磁神光', '源天書', '大荒蕪經'] };
  for (const [el, list] of Object.entries(names)) list.forEach((n, major) => {
    for (let sub = 0; sub < 3; sub++) {
      const tech = items.makeTechnique('x', major * 3 + sub, el);
      assert.equal(tech.skillName, n, 'skill name is the technique name');
      assert.ok(tech.name.endsWith(n));
    }
  });
});

test('Craft techniques: only 地/天, no element, speed and alchemy pill keep chance', () => {
  const names = { alchemy: ['紫氣馭鼎功', '太上丹經'], forging: ['大衍訣', '暗器百解'], talisman: ['銀蝌文', '金篆文'], formation: ['組字秘', '禁制本源'] };
  const speed = [0.3, 0.34, 0.38, 0.4, 0.44, 0.48];
  const keep = [0.05, 0.07, 0.1, 0.1, 0.12, 0.15];
  for (const [art, list] of Object.entries(names)) for (let t = 6; t < 12; t++) {
    const tech = items.makeTechnique('x', t, art);
    assert.equal(tech.element, null);
    assert.equal(tech.art, art);
    assert.equal(tech.skillName, list[t < 9 ? 0 : 1]);
    close(items.techniqueSpeed(tech), speed[t - 6], `${art} speed tier ${t}`);
    assert.equal(items.techniqueForce(tech), 0);
    close(items.techniqueKeepPill(tech), art === 'alchemy' ? keep[t - 6] : 0, `${art} keep tier ${t}`);
  }
  assert.equal(items.makeTechnique('x', 2, 'alchemy').tier, 6, 'craft techniques start at 地階下品');
  for (let i = 0; i < 300; i++) assert.ok(items.makeTechnique('x', 3).element, 'below 地階 only element techniques drop');
});

test('Learning: element techniques need a matching aptitude; craft techniques any aptitude except waste', () => {
  const state = createGameState('cao', 40);
  bindPassiveState(state);
  const g = Object.values(state.generals).find((x) => !x.isLord && !x.technique);
  const craftTech = items.makeTechnique('c', 7, 'forging');
  const fire = items.makeTechnique('f', 4, 'fire');
  g.aptitude = 'metal';
  assert.equal(canLearn(g, craftTech).ok, true);
  assert.equal(canLearn(g, fire).ok, false);
  g.aptitude = 'waste';
  assert.equal(canLearn(g, craftTech).ok, false);
});

test('Cultivation speed scales per-turn cultivation; force bonus applies, craft gives no force', () => {
  const state = createGameState('cao', 40);
  bindPassiveState(state);
  const g = Object.values(state.generals).find((x) => !x.isLord && x.status === 'free');
  g.aptitude = 'metal';
  g.technique = null;
  const base = passiveExp(g, null);
  const baseAtk = attack(g);
  g.technique = items.makeTechnique('t', 11, 'metal');
  assert.equal(passiveExp(g, null), Math.round(base * 1.48));
  assert.ok(attack(g) > baseAtk);
  g.technique = items.makeTechnique('t', 11, 'alchemy');
  assert.equal(attack(g), baseAtk);
});

test('Toll = prosperity^1.4 ×7 (capital ×1.2, +10% per extra city); growth +0.5 + 0.5% of the city', () => {
  const city = { prosperity: 100, capital: false };
  assert.equal(toll(city), Math.round(Math.pow(100, 1.4) * 7));
  assert.equal(toll({ prosperity: 100, capital: true }, 3), Math.round(Math.pow(100, 1.4) * 7 * 1.2 * 1.2));
  close(prosperityGrowth({ prosperity: 0 }), 0.5, 'growth at 0');
  close(prosperityGrowth({ prosperity: 200 }), 1.5, 'growth at 200');
});

test('Cities no longer depend on terrain: same prosperity, same income everywhere', () => {
  const state = createGameState('cao', 40);
  const incomes = new Set(Object.values(state.cities).map((c) => JSON.stringify(cityIncome({ ...c, prosperity: 100 }))));
  assert.equal(incomes.size, 1);
  assert.equal(fs.existsSync(path.join(__dirname, '../src/data/terrain.ts')), false);
});

console.log(`${passed} balance rule groups passed.`);
