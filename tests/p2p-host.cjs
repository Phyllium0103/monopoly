// 點對點多人：房主端權威邏輯（HostRoom）與訊息分段
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
const { HostRoom } = require('../src/net/HostRoom.ts');
const { encode, Decoder } = require('../src/net/p2p/link.ts');
const { OFFLINE_MS } = require('../src/net/roomTypes.ts');

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// 依抉擇種類給出合法回答（與 multiplayer.cjs 相同的測試玩家）
function bot(rand, state, pending) {
  const p = pending.prompt;
  const enabled = (cs) => cs.map((c, i) => (c.disabled ? -1 : i)).filter((i) => i >= 0);
  const pick = (a) => a[Math.floor(rand() * a.length)];
  switch (p.kind) {
    case 'choose': { const e = enabled(p.choices); if (p.cancel !== null && (rand() < 0.3 || !e.length)) return null; return e.length ? pick(e) : null; }
    case 'pickMany': { const e = enabled(p.choices); return e.slice(0, Math.min(e.length, p.min + Math.floor(rand() * (p.max - p.min + 1)))); }
    case 'slider': return p.min + Math.floor(rand() * ((p.max - p.min) / p.step + 1)) * p.step;
    case 'confirm': return rand() < 0.5;
    case 'preroll': return rand() < 0.8 ? { type: 'roll' } : pick([{ type: 'items' }, { type: 'roster' }, { type: 'materials' }]);
    case 'shop': return { type: 'leave' };
    case 'casino': return null;
    case 'bid': return 0;
    case 'duel': return 'attack';
    case 'tile': return Math.floor(rand() * state.tiles.length);
    case 'roster': return { type: 'close' };
  }
  throw new Error('unknown prompt ' + p.kind);
}

let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log(`PASS ${name}`); }
const code = (fn) => { try { fn(); } catch (e) { return e.code; } return 'NO_ERROR'; };
const acode = async (p) => { try { await p; } catch (e) { return e.code; } return 'NO_ERROR'; };

/** 依房主推送的版本推進到下一個要真人回答的抉擇（全電腦時自己繼續） */
async function settle(h) {
  for (let i = 0; i < 50 && h.pub.paused && !h.pub.pending && !h.pub.over; i++) await h.continue();
}

(async () => {
  await test('Room rules match the old server: join, lords, ready, AI, host-only actions, capacity', async () => {
    const h = HostRoom.create('01234', 'host', 'k-host', '房主<b>', 40);
    let rooms = 0;
    h.onRoom = () => rooms++;
    assert.equal(h.members()[0].nickname, '房主b', 'HTML characters are stripped');
    assert.equal(h.members()[0].is_host, true);
    assert.equal(h.members()[0].secret, undefined, 'seat keys are never sent to players');
    assert.deepEqual(h.join('p1', 'k1', '甲'), { room_id: '01234', code: '01234', rejoined: false });
    assert.equal(h.seats.find((m) => m.user_id === 'p1').lord_id, 'sun', 'first free lord');
    assert.equal(code(() => h.setLord('p1', 'cao')), 'LORD_TAKEN');
    h.setReady('p1', true);
    h.setLord('p1', 'dong');
    assert.equal(h.seats.find((m) => m.user_id === 'p1').ready, false, 'changing lord cancels ready');
    assert.equal(code(() => h.addAi('p1')), 'NOT_HOST');
    assert.equal(code(() => h.setRounds('p1', 60)), 'NOT_HOST');
    h.addAi('host');
    h.join('p2', 'k2', '乙');
    assert.equal(code(() => h.join('p3', 'k3', '丙')), 'ROOM_FULL');
    assert.equal(code(() => h.join('p1', 'wrong', '冒充')), 'SEAT_TAKEN', 'another browser cannot take a seat');
    assert.equal(h.join('p1', 'k1', '甲').rejoined, true);
    const ai = h.seats.find((m) => m.kind === 'ai');
    h.removeAi('host', ai.id);
    assert.equal(h.seats.length, 3);
    assert.equal(await acode(h.start('p1')), 'NOT_HOST');
    assert.equal(await acode(h.start('host')), 'NOT_ALL_READY');
    for (const u of ['host', 'p1', 'p2']) h.setReady(u, true);
    await h.start('host');
    assert.equal(h.room.status, 'playing');
    assert.equal(code(() => h.join('p9', 'k9', '新人')), 'ROOM_STARTED');
    assert.equal(h.join('p2', 'k2', '乙').rejoined, true, 'members can come back mid-game');
    assert.equal(await acode(h.start('host')), 'ALREADY_STARTED');
    assert.ok(rooms > 5, 'every change is pushed to players');
    h.dispose();
  });

  await test('Two humans and one AI play many rounds through the host; stale, duplicate and wrong-player answers are handled', async () => {
    const h = HostRoom.create('22222', 'host', 'kh', '房主', 40);
    h.join('p1', 'k1', '甲');
    h.addAi('host');
    h.setReady('host', true);
    h.setReady('p1', true);
    const updates = [];
    h.onUpdate = (u) => updates.push(u.version);
    await h.start('host');
    const userOf = (lord) => h.seats.find((m) => m.lord_id === lord).user_id;
    const rand = rng(7);
    let answers = 0, checkedDup = false, checkedStale = false;
    while (!h.pub.over && h.pub.state.round <= 8 && answers < 3000) {
      await settle(h);
      if (h.pub.over || !h.pub.pending) break;
      const p = h.pub.pending;
      const user = userOf(p.lord);
      assert.ok(user, 'only humans are asked');
      if (!checkedStale) {
        const other = user === 'host' ? 'p1' : 'host';
        assert.equal(await acode(h.answer(other, p.seq, null, null)), 'STALE_ANSWER', 'not your turn');
        assert.equal(await acode(h.answer(user, 'x:0', null, null)), 'STALE_ANSWER', 'outdated prompt');
        checkedStale = true;
      }
      const op = `op-${answers}`;
      const value = bot(rand, h.pub.state, p);
      const res = await h.answer(user, p.seq, value, op);
      if (!checkedDup) {
        const again = await h.answer(user, p.seq, value, op);
        assert.equal(again.duplicate, true, 'the same operation is not applied twice');
        assert.equal(again.version, res.version);
        checkedDup = true;
      }
      answers++;
    }
    assert.ok(h.pub.state.round > 8 || h.pub.over, `reached round ${h.pub.state.round}`);
    assert.deepEqual(updates, updates.slice().sort((a, b) => a - b), 'versions only go up');
    assert.equal(updates[updates.length - 1], h.pub.version);
    assert.ok(h.getEvents(h.pub.version - 3).length <= 3);
    console.log(`   ${answers} answers over ${h.pub.state.round} rounds; ${updates.length} versions`);
    h.dispose();
  });

  await test('Host refresh: the saved snapshot restores the game and play continues', async () => {
    const h = HostRoom.create('33333', 'host', 'kh', '房主', 40);
    h.join('p1', 'k1', '甲');
    h.setReady('host', true);
    h.setReady('p1', true);
    await h.start('host');
    const rand = rng(3);
    const userOf = (room, lord) => room.seats.find((m) => m.lord_id === lord).user_id;
    for (let i = 0; i < 25; i++) {
      await settle(h);
      const p = h.pub.pending;
      await h.answer(userOf(h, p.lord), p.seq, bot(rand, h.pub.state, p), null);
    }
    const saved = JSON.parse(JSON.stringify(h.snapshot()));
    h.dispose();
    const back = HostRoom.restore(saved);
    assert.equal(back.pub.version, h.pub.version);
    assert.equal(JSON.stringify(back.pub.state), JSON.stringify(h.pub.state));
    const p1 = back.seats.find((m) => m.user_id === 'p1');
    assert.ok(Date.now() - new Date(p1.last_seen_at).getTime() > OFFLINE_MS, 'players must reconnect after a host refresh');
    assert.equal(back.join('p1', 'k1', '甲').rejoined, true);
    for (let i = 0; i < 25; i++) {
      await settle(back);
      const p = back.pub.pending;
      await back.answer(userOf(back, p.lord), p.seq, bot(rand, back.pub.state, p), null);
    }
    assert.ok(back.pub.version > saved.pub.version + 10);
    back.dispose();
  });

  await test('Takeover only for offline players; reclaim hands control back', async () => {
    const h = HostRoom.create('44444', 'host', 'kh', '房主', 40);
    h.join('p1', 'k1', '甲');
    h.setReady('host', true);
    h.setReady('p1', true);
    await h.start('host');
    const lord = h.seats.find((m) => m.user_id === 'p1').lord_id;
    assert.equal(await acode(h.takeover('host', lord)), 'PLAYER_ONLINE');
    assert.equal(await acode(h.takeover('p1', 'cao')), 'NOT_HOST');
    h.markOffline('p1');
    await h.takeover('host', lord);
    assert.equal(h.seats.find((m) => m.user_id === 'p1').ai_control, true);
    assert.equal(h.record.autoFrom[lord] !== undefined || !h.record.snapshot.lords[lord].isPlayer, true);
    await h.reclaim('p1');
    assert.equal(h.seats.find((m) => m.user_id === 'p1').ai_control, false);
    h.dispose();
  });

  await test('Host leaving the waiting room closes it; a player leaving frees the seat', async () => {
    const h = HostRoom.create('55555', 'host', 'kh', '房主', 40);
    h.join('p1', 'k1', '甲');
    h.leave('p1');
    assert.equal(h.seats.length, 1);
    h.leave('host');
    assert.equal(h.room.status, 'closed');
    assert.equal(code(() => h.join('p2', 'k2', '乙')), 'ROOM_CLOSED');
    h.dispose();
  });

  await test('Large messages are split into DataChannel-safe chunks and reassembled in any order', async () => {
    const big = { t: 'update', update: { state: { text: '天下'.repeat(60000), n: [...Array(5000).keys()] } } };
    const parts = encode(big);
    assert.ok(parts.length > 5 && parts.every((p) => p.length <= 15100));
    const d = new Decoder();
    const shuffled = parts.slice().reverse();
    let out;
    for (const p of shuffled) out = d.push(p) ?? out;
    assert.deepEqual(out, big);
    assert.deepEqual(new Decoder().push(encode({ t: 'res', id: 1 })[0]), { t: 'res', id: 1 });
  });

  console.log(`${passed} p2p host groups passed.`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
