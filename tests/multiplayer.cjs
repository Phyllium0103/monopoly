// 多人模式權威端：以快照 + 重播推進，驗證可重現、不會卡死，並量測單次運算量
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
const { createMultiplayerState, newRecord, advance, answer, takeover, reclaim } = require('../src/engine/server.ts');

// 測試用的「玩家」：依抉擇種類隨機給出回答（固定種子，結果可重現）
function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function bot(rand, state, pending) {
  const p = pending.prompt;
  const enabled = (cs) => cs.map((c, i) => (c.disabled ? -1 : i)).filter((i) => i >= 0);
  const pick = (a) => a[Math.floor(rand() * a.length)];
  switch (p.kind) {
    case 'choose': {
      const e = enabled(p.choices);
      if (p.cancel !== null && (rand() < 0.3 || !e.length)) return null;
      return e.length ? pick(e) : null;
    }
    case 'pickMany': {
      const e = enabled(p.choices);
      const n = Math.min(e.length, p.min + Math.floor(rand() * (p.max - p.min + 1)));
      return e.slice(0, n);
    }
    case 'slider': return p.min + Math.floor(rand() * ((p.max - p.min) / p.step + 1)) * p.step;
    case 'confirm': return rand() < 0.5;
    case 'preroll': return rand() < 0.75 ? { type: 'roll' } : pick([{ type: 'items' }, { type: 'recruit' }, { type: 'roster' }, { type: 'sect' }, { type: 'materials' }, { type: 'garrison' }, { type: 'abilities' }]);
    case 'shop': return rand() < 0.4 && p.shop.offers.length ? { type: 'buy', index: Math.floor(rand() * p.shop.offers.length) } : { type: 'leave' };
    case 'casino': return rand() < 0.5 ? 100 : null;
    case 'bid': return rand() < 0.5 ? 0 : 1000;
    case 'duel': return pick(['attack', 'attack', 'skill', 'item']);
    case 'tile': return Math.floor(rand() * state.tiles.length);
    case 'roster': {
      if (rand() < 0.7) return { type: 'close' };
      const own = Object.values(state.generals).filter((g) => g.owner === pending.lord);
      return own.length ? { type: pick(['break', 'seclude', 'equip', 'learn', 'upgrade']), generalId: pick(own).id } : { type: 'close' };
    }
  }
  throw new Error('unknown prompt ' + p.kind);
}

let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log(`PASS ${name}`); }

(async () => {
  const seats = [
    { lord: 'cao', human: true, name: '甲' },
    { lord: 'sun', human: true, name: '乙' },
    { lord: 'liu', human: false, name: '電腦' },
  ];

  await test('Multiplayer state: unseated lords are absent, humans flagged, turn starts with first seat', async () => {
    const s = createMultiplayerState(seats, 40, 1234);
    assert.equal(s.lords.dong.absent, true);
    assert.equal(s.lords.dong.alive, false);
    assert.equal(Object.values(s.cities).filter((c) => c.owner === 'dong').length, 0);
    assert.equal(s.lords.cao.isPlayer, true);
    assert.equal(s.lords.sun.isPlayer, true);
    assert.equal(s.lords.liu.isPlayer, false);
    assert.equal(s.order[s.turn], 'cao');
    assert.equal(JSON.stringify(createMultiplayerState(seats, 40, 1234)), JSON.stringify(s));
  });

  await test('Replay is deterministic and a two-human game runs many rounds without getting stuck', async () => {
    const seed = 987654;
    let record = newRecord(createMultiplayerState(seats, 40, seed), seed);
    let r = await advance(record);
    const rand = rng(42);
    let calls = 0, worst = 0, answers = 0;
    while (!r.over && r.state.round <= 12 && calls < 6000) {
      calls++;
      if (r.paused) {
        const t = Date.now();
        r = await advance(r.record);
        worst = Math.max(worst, Date.now() - t);
        continue;
      }
      assert.ok(r.pending, 'should wait for a human');
      assert.ok(seats.find((s) => s.lord === r.pending.lord && s.human), 'only humans are asked');
      // 同一份記錄重跑兩次，結果必須完全相同
      if (calls % 25 === 0) {
        const a = await advance(r.record), b = await advance(r.record);
        assert.equal(JSON.stringify(a.state), JSON.stringify(b.state));
        assert.equal(JSON.stringify(a.pending), JSON.stringify(b.pending));
      }
      const value = bot(rand, r.state, r.pending);
      record = answer(r.record, r.pending, r.pending.lord, r.pending.seq, value);
      answers++;
      const t = Date.now();
      r = await advance(record);
      worst = Math.max(worst, Date.now() - t);
    }
    assert.ok(r.state.round > 12 || r.over, `reached round ${r.state.round}`);
    console.log(`   ${answers} answers over ${r.state.round} rounds; slowest advance ${worst} ms; state ${Math.round(JSON.stringify(r.state).length / 1024)} KB`);
  });

  await test('Stale or wrong-player answers are rejected', async () => {
    const seed = 55;
    const r = await advance(newRecord(createMultiplayerState(seats, 40, seed), seed));
    assert.ok(r.pending);
    assert.throws(() => answer(r.record, r.pending, r.pending.lord === 'cao' ? 'sun' : 'cao', r.pending.seq, null), /STALE_ANSWER/);
    assert.throws(() => answer(r.record, r.pending, r.pending.lord, 'x:0', null), /STALE_ANSWER/);
  });

  await test('Takeover answers for an absent player; reclaim returns control at the next turn', async () => {
    const seed = 77;
    let r = await advance(newRecord(createMultiplayerState(seats, 40, seed), seed));
    const lord = r.pending.lord;
    r = await advance(takeover(r.record, lord));
    // 代打之後不會再問這位玩家，直到他接手
    let guard = 0;
    while (r.paused && guard++ < 10) r = await advance(r.record);
    assert.ok(!r.pending || r.pending.lord !== lord);
    assert.equal(r.record.snapshot.lords[lord].isPlayer, false);
    const back = reclaim(r.record, lord);
    assert.deepEqual(back.reclaim, [lord]);
  });

  console.log(`${passed} multiplayer groups passed.`);
})().catch((e) => { console.error(e); process.exit(1); });
