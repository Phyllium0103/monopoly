// 仙途三國：多人對局的權威端（Supabase Edge Function，Deno）
// 所有會改變遊戲的操作都在這裡執行：開始遊戲、回答抉擇、繼續推進、斷線代打與接手。
// 前端只送出「回答」，骰子與所有結果都由這裡用伺服器的亂數算出，再寫回資料庫並透過 Realtime 通知所有玩家。
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
// 引擎由 `npm run build:engine` 從 src/engine/server.ts 打包而來（沒有型別宣告檔，這裡只描述用到的部分）
import { advance, answer, createMultiplayerState, newRecord, reclaim, takeover } from './_engine/engine.js';

// deno-lint-ignore no-explicit-any
type GameRecord = any;
interface StepResult {
  record: GameRecord;
  state: unknown;
  pending: { lord: string; seq: string } | null;
  events: unknown[];
  over: boolean;
  paused: boolean;
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
/** 新版金鑰以 JSON 提供（{ default: "sb_..." }），舊版為單一字串 */
const firstKey = (name: string) => {
  const raw = Deno.env.get(name);
  if (!raw) return undefined;
  try {
    const v = JSON.parse(raw) as Record<string, string>;
    return v.default ?? Object.values(v)[0];
  } catch {
    return raw;
  }
};
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? firstKey('SUPABASE_SECRET_KEYS')!;
const PUBLIC_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? firstKey('SUPABASE_PUBLISHABLE_KEYS')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-region',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  // 讓瀏覽器快取預檢結果，之後的呼叫不必每次多一趟 OPTIONS 往返
  'Access-Control-Max-Age': '86400',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

/** 判定離線：超過這段時間沒有心跳 */
const OFFLINE_MS = 45_000;

interface Member {
  id: string;
  room_id: string;
  user_id: string | null;
  kind: 'human' | 'ai';
  lord_id: string;
  is_host: boolean;
  ai_control: boolean;
  last_seen_at: string;
}

interface PublicRow {
  version: number;
  pending: { lord: string; seq: string } | null;
  over: boolean;
  paused: boolean;
}

/** 各階段耗時（毫秒），方便診斷速度 */
let timing: Record<string, number> = {};

Deno.serve(async (req) => {
  timing = { region: 0 };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    const t0 = performance.now();
    const userId = await verify(jwt);
    timing.verify = Math.round(performance.now() - t0);
    if (!userId) return json({ error: 'UNAUTHORIZED' }, 401);
    const user = { id: userId };

    const body = (await req.json()) as { action?: string; roomId?: string; seq?: string; answer?: unknown; opId?: string; lord?: string };
    const roomId = body.roomId;
    if (!roomId || typeof roomId !== 'string') return json({ error: 'BAD_REQUEST' }, 400);
    // 一次讀回成員、公開狀態、伺服器記錄與操作 ID（減少往返）
    const t1 = performance.now();
    const { data: bundle, error: loadError } = await admin.rpc('load_game', { p_room: roomId, p_user: userId, p_op: body.opId ?? null });
    timing.load = Math.round(performance.now() - t1);
    if (loadError) return json({ error: loadError.message }, 500);
    const member = bundle?.member as Member | null;
    if (!member) return json({ error: 'NOT_MEMBER' }, 403);
    const loaded = bundle.pub && bundle.record ? { pub: bundle.pub as PublicRow, record: bundle.record as GameRecord } : null;

    switch (body.action) {
      case 'start': {
        // 用玩家本人的身分呼叫，資料庫會在交易中確認房主與準備狀態
        const asUser = createClient(SUPABASE_URL, PUBLIC_KEY, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
        const { data, error } = await asUser.rpc('begin_game', { p_room: roomId });
        if (error) return json({ error: error.message }, 409);
        const seed = crypto.getRandomValues(new Int32Array(1))[0];
        const state = createMultiplayerState(data.seats, data.max_rounds, seed);
        return commit(admin, roomId, 0, await advance(newRecord(state, seed)), null, user.id);
      }
      case 'answer': {
        if (!loaded) return json({ error: 'NO_GAME' }, 404);
        if (bundle.op_version != null) return json({ ok: true, duplicate: true, version: bundle.op_version });
        if (member.ai_control) return json({ error: 'AI_CONTROLLED' }, 409);
        let record: GameRecord;
        try {
          record = answer(loaded.record, loaded.pub.pending, member.lord_id, String(body.seq), body.answer);
        } catch {
          return json({ error: 'STALE_ANSWER', version: loaded.pub.version }, 409);
        }
        const t2 = performance.now();
        const result = await advance(record);
        timing.advance = Math.round(performance.now() - t2);
        return commit(admin, roomId, loaded.pub.version, result, body.opId ?? null, user.id);
      }
      case 'continue': {
        if (!loaded) return json({ error: 'NO_GAME' }, 404);
        if (loaded.pub.over || loaded.pub.pending) return json({ ok: true, version: loaded.pub.version });
        return commit(admin, roomId, loaded.pub.version, await advance(loaded.record), null, user.id);
      }
      case 'takeover': {
        // 房主把斷線的玩家交給電腦代打
        if (!member.is_host) return json({ error: 'NOT_HOST' }, 403);
        if (!loaded) return json({ error: 'NO_GAME' }, 404);
        const { data: target } = await admin.from('room_members').select('*').eq('room_id', roomId).eq('lord_id', String(body.lord)).maybeSingle<Member>();
        if (!target || target.kind !== 'human' || target.ai_control) return json({ error: 'BAD_TARGET' }, 400);
        if (Date.now() - new Date(target.last_seen_at).getTime() < OFFLINE_MS) return json({ error: 'PLAYER_ONLINE' }, 409);
        const result = await advance(takeover(loaded.record, target.lord_id));
        const response = await commit(admin, roomId, loaded.pub.version, result, null, user.id);
        if (response.status === 200) await admin.from('room_members').update({ ai_control: true }).eq('id', target.id);
        return response;
      }
      case 'reclaim': {
        // 被代打的玩家回來，下一位主公的回合開始時交還操作
        if (!member.ai_control) return json({ ok: true });
        if (!loaded) return json({ error: 'NO_GAME' }, 404);
        const result = await advance(reclaim(loaded.record, member.lord_id));
        const response = await commit(admin, roomId, loaded.pub.version, result, null, user.id);
        if (response.status === 200) await admin.from('room_members').update({ ai_control: false }).eq('id', member.id);
        return response;
      }
      default:
        return json({ error: 'UNKNOWN_ACTION' }, 400);
    }
  } catch (e) {
    console.error(e);
    return json({ error: 'SERVER_ERROR', detail: String(e) }, 500);
  }
});

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

/** 驗證玩家的登入憑證：優先在本地以公開金鑰驗簽（不需往返認證伺服器），不支援時退回查詢 */
async function verify(jwt: string): Promise<string | null> {
  if (!jwt) return null;
  try {
    const { data, error } = await admin.auth.getClaims(jwt);
    if (!error && data?.claims?.sub) return data.claims.sub as string;
  } catch { /* 舊版金鑰：改用 getUser */ }
  const { data } = await admin.auth.getUser(jwt);
  return data?.user?.id ?? null;
}

const withoutTiles = (state: unknown) => ({ ...(state as Record<string, unknown>), tiles: undefined });

/** 以版本號寫入（樂觀鎖）：同時有兩個操作時只有一個成功，另一個回報衝突由前端重新讀取 */
async function commit(admin: SupabaseClient, roomId: string, expected: number, r: StepResult, opId: string | null, userId: string) {
  const t3 = performance.now();
  const { data: version, error } = await admin.rpc('commit_game', {
    p_room: roomId,
    p_expected: expected,
    p_private: { record: r.record },
    // 地圖格子是固定資料，玩家端自行補上，不必每次傳送
    p_state: withoutTiles(r.state),
    p_pending: r.pending,
    p_over: r.over,
    p_paused: r.paused,
    p_events: r.events,
    p_op: opId,
    p_user: userId,
  });
  timing.commit = Math.round(performance.now() - t3);
  if (error) return json({ error: error.message.includes('VERSION_CONFLICT') ? 'VERSION_CONFLICT' : error.message }, 409);
  const update = { version, state: withoutTiles(r.state), pending: r.pending, over: r.over, paused: r.paused, events: r.events };
  // 同時推送給房間裡的其他玩家（私有頻道，只有成員收得到）；不等推送完成就先回應
  const pushed = broadcast(roomId, update);
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime;
  if (runtime) runtime.waitUntil(pushed);
  else await pushed;
  // 直接回傳新狀態與事件，呼叫的玩家不必再向資料庫讀取一次
  return json({ ok: true, ...update, timing });
}

/** Realtime 單則訊息上限約 256KB；太大時只推送版本號，玩家改從資料庫讀取 */
const BROADCAST_LIMIT = 230_000;

async function broadcast(roomId: string, update: { version: number }) {
  const full = JSON.stringify(update);
  const payload = full.length < BROADCAST_LIMIT ? update : { version: update.version, partial: true };
  try {
    await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ topic: `game:${roomId}`, event: 'update', payload, private: true }] }),
    });
  } catch (e) {
    console.error('broadcast failed', e);
  }
}
