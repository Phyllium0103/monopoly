-- 仙途三國：點對點多人連線的房號目錄與配對頻道
-- 遊戲本身在房主的瀏覽器上執行、玩家之間直接連線（WebRTC）；Supabase 只負責兩件事：
--   1. p2p_rooms：房號 → 開房玩家（房主）的連線識別與是否在線
--   2. Realtime 私有頻道「p2p:<房號>」：建立連線的幾秒內轉交雙方的連線資訊（SDP，內含 IP 與連接埠）
-- 執行方式：supabase db push，或在 Supabase SQL Editor 整份貼上執行。
-- 舊版（伺服器裁決）的資料表與 Edge Function 不再使用，不影響本檔；確認不需要後可自行刪除。

create table if not exists public.p2p_rooms (
  -- 5 位數房號，以字串保存（保留前導零）
  code text primary key check (code ~ '^[0-9]{5}$'),
  host_id uuid not null references auth.users (id) on delete cascade,
  -- 房主這次開啟頁面的連線識別（重新整理後會更新）
  host_peer text not null check (char_length(host_peer) between 1 and 64),
  status text not null default 'waiting' check (status in ('waiting', 'playing', 'closed')),
  created_at timestamptz not null default now(),
  -- 房主每 20 秒回報一次；超過 3 分鐘沒回報視為不在線上（背景分頁的計時器會被瀏覽器放慢）
  last_seen_at timestamptz not null default now()
);
create index if not exists p2p_rooms_seen on public.p2p_rooms (last_seen_at);

-- 前端不能直接讀寫，一律透過下方函式
alter table public.p2p_rooms enable row level security;
revoke all on public.p2p_rooms from anon, authenticated;

create or replace function public.p2p_uid()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_SIGNED_IN' using errcode = 'P0001';
  end if;
  return auth.uid();
end;
$$;

-- 房號可重複使用：已關閉、或房主超過 3 天沒出現的房間
create or replace function public.p2p_code_free(p_code text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1 from public.p2p_rooms
     where code = p_code and status <> 'closed' and last_seen_at > now() - interval '3 days'
  );
$$;

-- 建立房間：產生沒人使用的 5 位數房號
create or replace function public.p2p_create_room(p_peer text, p_status text default 'waiting')
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.p2p_uid();
  v_code text;
begin
  for i in 1..60 loop
    v_code := lpad(floor(random() * 100000)::int::text, 5, '0');
    if public.p2p_code_free(v_code) then
      insert into public.p2p_rooms (code, host_id, host_peer, status, created_at, last_seen_at)
      values (v_code, v_uid, p_peer, coalesce(p_status, 'waiting'), now(), now())
      on conflict (code) do update
        set host_id = excluded.host_id, host_peer = excluded.host_peer, status = excluded.status,
            created_at = now(), last_seen_at = now()
        where public.p2p_code_free(p2p_rooms.code);
      if found then
        return v_code;
      end if;
    end if;
  end loop;
  raise exception 'NO_FREE_CODE' using errcode = 'P0001';
end;
$$;

-- 房主重新整理後重新登記同一個房號（只有原房主可以）
create or replace function public.p2p_claim_room(p_code text, p_peer text, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.p2p_uid();
begin
  update public.p2p_rooms set host_peer = p_peer, status = p_status, last_seen_at = now()
   where code = p_code and host_id = v_uid;
  if found then
    return;
  end if;
  if not public.p2p_code_free(p_code) then
    raise exception 'ROOM_NOT_FOUND' using errcode = 'P0001';
  end if;
  insert into public.p2p_rooms (code, host_id, host_peer, status) values (p_code, v_uid, p_peer, p_status)
  on conflict (code) do update set host_id = excluded.host_id, host_peer = excluded.host_peer,
    status = excluded.status, last_seen_at = now();
end;
$$;

-- 房主回報仍在線上（同時更新房間狀態）
create or replace function public.p2p_touch(p_code text, p_peer text, p_status text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.p2p_rooms set host_peer = p_peer, status = p_status, last_seen_at = now()
   where code = p_code and host_id = public.p2p_uid();
$$;

create or replace function public.p2p_close(p_code text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.p2p_rooms set status = 'closed', last_seen_at = now()
   where code = p_code and host_id = public.p2p_uid();
$$;

-- 用房號查詢房主：玩家拿到房主的連線識別後，透過配對頻道與房主交換連線資訊
create or replace function public.p2p_lookup(p_code text)
returns json
language sql
stable
security definer
set search_path = ''
as $$
  select json_build_object(
    'host_id', host_id,
    'host_peer', host_peer,
    'status', case when status <> 'closed' and last_seen_at < now() - interval '3 days' then 'closed' else status end,
    'online', last_seen_at > now() - interval '3 minutes'
  )
  from public.p2p_rooms where code = p_code and public.p2p_uid() is not null;
$$;

-- 配對頻道「p2p:<房號>」：只有登入的玩家、且房間仍開著時可以收發
create or replace function public.p2p_topic_open(p_topic text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_topic is not null and left(p_topic, 4) = 'p2p:' and exists (
    select 1 from public.p2p_rooms r
     where r.code = substring(p_topic from 5) and r.status <> 'closed'
  );
$$;

drop policy if exists p2p_signal_receive on realtime.messages;
create policy p2p_signal_receive on realtime.messages
  for select to authenticated
  using (realtime.messages.extension = 'broadcast' and public.p2p_topic_open(realtime.topic()));

drop policy if exists p2p_signal_send on realtime.messages;
create policy p2p_signal_send on realtime.messages
  for insert to authenticated
  with check (realtime.messages.extension = 'broadcast' and public.p2p_topic_open(realtime.topic()));

-- ───────────────────────── 權限 ─────────────────────────

revoke all on function public.p2p_uid() from public, anon;
revoke all on function public.p2p_code_free(text) from public, anon, authenticated;
revoke all on function public.p2p_create_room(text, text) from public, anon;
revoke all on function public.p2p_claim_room(text, text, text) from public, anon;
revoke all on function public.p2p_touch(text, text, text) from public, anon;
revoke all on function public.p2p_close(text) from public, anon;
revoke all on function public.p2p_lookup(text) from public, anon;
revoke all on function public.p2p_topic_open(text) from public, anon;
grant execute on function public.p2p_uid(), public.p2p_create_room(text, text), public.p2p_claim_room(text, text, text),
  public.p2p_touch(text, text, text), public.p2p_close(text), public.p2p_lookup(text), public.p2p_topic_open(text)
  to authenticated;
