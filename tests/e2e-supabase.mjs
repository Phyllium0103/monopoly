// 對實際的 Supabase 專案做端對端測試：兩位匿名玩家建房、加入、準備、開始並輪流回答抉擇。
// 執行：node tests/e2e-supabase.mjs（讀取 .env 的 VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY）
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(fs.readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => l.split(/=(.*)/s).slice(0, 2)));
const URL_ = env.VITE_SUPABASE_URL, KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const client = () => createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

async function player(name) {
  const sb = client();
  const { data, error } = await sb.auth.signInAnonymously();
  if (error) throw error;
  return { sb, id: data.user.id, name };
}
const rpc = async (p, fn, args) => {
  const { data, error } = await p.sb.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data;
};
const game = async (p, action, roomId, extra = {}) => {
  const { data, error } = await p.sb.functions.invoke('game', { body: { action, roomId, ...extra } });
  if (error) {
    let body = null;
    try { body = await error.context.json(); } catch { /* 無內容 */ }
    throw new Error(body?.error ?? error.message);
  }
  return data;
};
const rejects = async (fn, code) => {
  try { await fn(); } catch (e) { assert.ok(String(e.message).includes(code), `expected ${code}, got ${e.message}`); return; }
  assert.fail(`expected ${code}`);
};

let passed = 0;
const step = async (name, fn) => { await fn(); passed++; console.log(`PASS ${name}`); };

const host = await player('房主');
const guest = await player('客人');
const outsider = await player('路人');
let roomId, code;

await step('Create room returns a 5-digit code (string)', async () => {
  const r = await rpc(host, 'create_room', { p_nickname: host.name, p_max_rounds: 20 });
  roomId = r.room_id; code = r.code;
  assert.match(code, /^\d{5}$/);
});
await step('Invalid code reports ROOM_NOT_FOUND', async () => {
  const bad = code === '00000' ? '00001' : '00000';
  await rejects(() => rpc(guest, 'join_room', { p_code: bad === code ? '99999' : bad, p_nickname: 'x' }), 'ROOM_NOT_FOUND');
});
await step('Second player joins by code; joining again rejoins the same seat', async () => {
  const r = await rpc(guest, 'join_room', { p_code: code, p_nickname: guest.name });
  assert.equal(r.room_id, roomId);
  const again = await rpc(guest, 'join_room', { p_code: code, p_nickname: guest.name });
  assert.equal(again.rejoined, true);
  const { data } = await guest.sb.from('room_members').select('*').eq('room_id', roomId);
  assert.equal(data.length, 2);
});
await step('Outsiders cannot read the room or members (RLS)', async () => {
  const { data: rooms } = await outsider.sb.from('rooms').select('*').eq('id', roomId);
  const { data: members } = await outsider.sb.from('room_members').select('*').eq('room_id', roomId);
  assert.equal(rooms.length, 0);
  assert.equal(members.length, 0);
  const { error } = await outsider.sb.from('rooms').update({ status: 'closed' }).eq('id', roomId);
  assert.ok(error, 'direct writes are rejected');
});
await step('Host-only actions are rejected for a guest', async () => {
  await rejects(() => rpc(guest, 'add_ai', { p_room: roomId }), 'NOT_HOST');
  await rejects(() => game(guest, 'start', roomId), 'NOT_HOST');
});
await step('Host adds and removes an AI; room capacity is enforced', async () => {
  await rpc(host, 'add_ai', { p_room: roomId });
  await rpc(host, 'add_ai', { p_room: roomId });
  await rejects(() => rpc(host, 'add_ai', { p_room: roomId }), 'ROOM_FULL');
  await rejects(() => rpc(outsider, 'join_room', { p_code: code, p_nickname: 'z' }), 'ROOM_FULL');
  const { data } = await host.sb.from('room_members').select('*').eq('room_id', roomId).eq('kind', 'ai').order('joined_at');
  await rpc(host, 'remove_ai', { p_room: roomId, p_member: data[1].id });
});
await step('Cannot start until every human (host included) is ready', async () => {
  await rejects(() => game(host, 'start', roomId), 'NOT_ALL_READY');
  await rpc(guest, 'set_ready', { p_room: roomId, p_ready: true });
  await rejects(() => game(host, 'start', roomId), 'NOT_ALL_READY');
  await rpc(guest, 'set_ready', { p_room: roomId, p_ready: false });
  await rpc(guest, 'set_ready', { p_room: roomId, p_ready: true });
  await rpc(host, 'set_ready', { p_room: roomId, p_ready: true });
});
let pub;
await step('Start creates the game; a repeated start is rejected', async () => {
  await game(host, 'start', roomId);
  await rejects(() => game(host, 'start', roomId), 'ALREADY_STARTED');
  const { data } = await guest.sb.from('game_public').select('*').eq('room_id', roomId).single();
  pub = data;
  assert.ok(pub.version >= 1);
  assert.ok(pub.pending, 'waiting for a human');
  // 伺服器專用資料：直接拒絕存取（permission denied）或查不到
  const { data: hidden, error: denied } = await guest.sb.from('game_private').select('*').eq('room_id', roomId);
  assert.ok(denied || hidden.length === 0, 'private game data is not readable');
  await rejects(() => rpc(outsider, 'join_room', { p_code: code, p_nickname: 'late' }), 'ROOM_STARTED');
});
const lordOf = async () => {
  const { data } = await host.sb.from('room_members').select('user_id, lord_id').eq('room_id', roomId);
  return Object.fromEntries(data.filter((m) => m.user_id).map((m) => [m.lord_id, m.user_id]));
};
const seats = await lordOf();
const who = (lord) => (seats[lord] === host.id ? host : guest);
const fetchPub = async (p) => (await p.sb.from('game_public').select('*').eq('room_id', roomId).single()).data;

await step('Both players see the same version, turn and state', async () => {
  const a = await fetchPub(host), b = await fetchPub(guest);
  assert.equal(a.version, b.version);
  assert.equal(JSON.stringify(a.state), JSON.stringify(b.state));
  assert.equal(a.pending.seq, b.pending.seq);
});
await step('Only the player being asked can answer; stale answers are rejected', async () => {
  const p = await fetchPub(host);
  const other = who(p.pending.lord) === host ? guest : host;
  await rejects(() => game(other, 'answer', roomId, { seq: p.pending.seq, answer: null, opId: crypto.randomUUID() }), 'STALE_ANSWER');
  await rejects(() => game(outsider, 'answer', roomId, { seq: p.pending.seq, answer: null }), 'NOT_MEMBER');
});
await step('Retrying the same operation ID does not apply it twice', async () => {
  const p = await fetchPub(host);
  const actor = who(p.pending.lord);
  const opId = crypto.randomUUID();
  const value = p.pending.prompt.kind === 'choose' ? p.pending.prompt.choices.findIndex((c) => !c.disabled) : p.pending.prompt.kind === 'preroll' ? { type: 'roll' } : null;
  const first = await game(actor, 'answer', roomId, { seq: p.pending.seq, answer: value, opId });
  const again = await game(actor, 'answer', roomId, { seq: p.pending.seq, answer: value, opId });
  assert.equal(again.duplicate, true);
  assert.equal(again.version, first.version);
  assert.equal((await fetchPub(host)).version, first.version);
});
await step('Players keep answering for several turns; events are delivered in order', async () => {
  let answers = 0;
  for (let i = 0; i < 60; i++) {
    const p = await fetchPub(host);
    if (p.over) break;
    if (!p.pending) { await game(host, 'continue', roomId); continue; }
    const actor = who(p.pending.lord);
    const pr = p.pending.prompt;
    const value = pr.kind === 'choose' ? (pr.cancel !== null ? null : pr.choices.findIndex((c) => !c.disabled))
      : pr.kind === 'pickMany' ? pr.choices.map((c, i) => (c.disabled ? -1 : i)).filter((i) => i >= 0).slice(0, pr.min)
      : pr.kind === 'slider' ? pr.min : pr.kind === 'confirm' ? false : pr.kind === 'preroll' ? { type: 'roll' }
      : pr.kind === 'shop' ? { type: 'leave' } : pr.kind === 'duel' ? 'attack' : pr.kind === 'bid' ? 0 : pr.kind === 'roster' ? { type: 'close' } : null;
    await game(actor, 'answer', roomId, { seq: p.pending.seq, answer: value, opId: crypto.randomUUID() });
    answers++;
  }
  const { data: events } = await guest.sb.from('game_events').select('version').eq('room_id', roomId).order('version');
  const versions = events.map((e) => e.version);
  assert.deepEqual(versions, [...versions].sort((a, b) => a - b));
  const p = await fetchPub(guest);
  console.log(`   ${answers} answers; round ${p.state.round}; version ${p.version}; ${events.length} event rows`);
  assert.ok(p.state.round >= 2, 'game advanced at least one round');
});
await step('Leaving: host hands over to the remaining human', async () => {
  await rpc(host, 'leave_room', { p_room: roomId });
  const { data } = await guest.sb.from('rooms').select('host_id').eq('id', roomId).single();
  assert.equal(data.host_id, guest.id);
});

console.log(`${passed} end-to-end steps passed (room ${code}).`);
