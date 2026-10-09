-- 仙途三國：多人連線（房間、成員、遊戲狀態）
-- 執行方式：supabase db push，或在 Supabase SQL Editor 整份貼上執行。
-- 前端只能透過下方的 RPC 變更房間；遊戲狀態只能由 Edge Function（service role）寫入。

-- ───────────────────────── 資料表 ─────────────────────────

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  -- 5 位數房號，以字串保存（保留前導零，例如 00427）
  code text not null check (code ~ '^[0-9]{5}$'),
  host_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'waiting' check (status in ('waiting', 'playing', 'closed')),
  max_players int not null default 4 check (max_players between 2 and 4),
  -- null 為無盡模式
  max_rounds int default 40 check (max_rounds is null or max_rounds between 10 and 200),
  created_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  closed_at timestamptz
);
-- 只有尚未關閉的房間佔用房號；關閉後房號可重複使用
create unique index if not exists rooms_active_code on public.rooms (code) where status <> 'closed';
create index if not exists rooms_activity on public.rooms (last_activity_at) where status <> 'closed';

create table if not exists public.room_members (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  -- 電腦玩家沒有 user_id
  user_id uuid references auth.users (id) on delete cascade,
  nickname text not null check (char_length(nickname) between 1 and 16),
  kind text not null check (kind in ('human', 'ai')),
  lord_id text not null check (lord_id in ('cao', 'sun', 'liu', 'dong')),
  is_host boolean not null default false,
  ready boolean not null default false,
  -- 遊戲中斷線，交由電腦代打
  ai_control boolean not null default false,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint human_has_user check ((kind = 'human') = (user_id is not null)),
  constraint one_lord_per_seat unique (room_id, lord_id)
);
-- 同一位使用者不能重複加入同一房間
create unique index if not exists room_members_user on public.room_members (room_id, user_id) where user_id is not null;
create index if not exists room_members_by_user on public.room_members (user_id);

-- 玩家可讀：最新狀態與等待中的抉擇
create table if not exists public.game_public (
  room_id uuid primary key references public.rooms (id) on delete cascade,
  version int not null,
  state jsonb not null,
  pending jsonb,
  over boolean not null default false,
  -- 全是電腦行動、暫停等待繼續推進
  paused boolean not null default false,
  updated_at timestamptz not null default now()
);

-- 僅伺服器可讀：亂數種子、快照、尚未公開的回答（密封出價）
create table if not exists public.game_private (
  room_id uuid primary key references public.rooms (id) on delete cascade,
  data jsonb not null
);

-- 每個版本的畫面事件，玩家依序播放
create table if not exists public.game_events (
  room_id uuid not null references public.rooms (id) on delete cascade,
  version int not null,
  events jsonb not null,
  created_at timestamptz not null default now(),
  primary key (room_id, version)
);

-- 冪等：同一個操作 ID 只執行一次
create table if not exists public.game_ops (
  room_id uuid not null references public.rooms (id) on delete cascade,
  op_id uuid not null,
  user_id uuid not null,
  version int not null,
  created_at timestamptz not null default now(),
  primary key (room_id, op_id)
);

-- ───────────────────────── RLS ─────────────────────────

alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.game_public enable row level security;
alter table public.game_private enable row level security;
alter table public.game_events enable row level security;
alter table public.game_ops enable row level security;

create or replace function public.is_room_member(p_room uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.room_members m where m.room_id = p_room and m.user_id = auth.uid());
$$;

drop policy if exists rooms_select on public.rooms;
create policy rooms_select on public.rooms for select to authenticated using (public.is_room_member(id));
drop policy if exists members_select on public.room_members;
create policy members_select on public.room_members for select to authenticated using (public.is_room_member(room_id));
drop policy if exists game_public_select on public.game_public;
create policy game_public_select on public.game_public for select to authenticated using (public.is_room_member(room_id));
drop policy if exists game_events_select on public.game_events;
create policy game_events_select on public.game_events for select to authenticated using (public.is_room_member(room_id));
-- game_private、game_ops 沒有任何政策：前端完全無法讀寫

-- 前端不能直接寫入任何表；所有變更都走下方的 RPC 或 Edge Function
revoke insert, update, delete, truncate on public.rooms, public.room_members, public.game_public, public.game_private, public.game_events, public.game_ops from anon, authenticated;
revoke select on public.game_private, public.game_ops from anon, authenticated;

-- ───────────────────────── 工具函式 ─────────────────────────

-- 關閉閒置房間：等待中超過 2 小時、遊戲中超過 24 小時沒有任何動作
create or replace function public.close_stale_rooms()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.rooms
     set status = 'closed', closed_at = now()
   where status <> 'closed'
     and ((status = 'waiting' and last_activity_at < now() - interval '2 hours')
       or (status = 'playing' and last_activity_at < now() - interval '24 hours'));
$$;

create or replace function public.require_uid()
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

-- 第一個空著的主公
create or replace function public.free_lord(p_room uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select l from unnest(array['cao', 'sun', 'liu', 'dong']) with ordinality as t(l, i)
   where not exists (select 1 from public.room_members m where m.room_id = p_room and m.lord_id = t.l)
   order by i limit 1;
$$;

create or replace function public.clean_nickname(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select left(coalesce(nullif(btrim(regexp_replace(coalesce(p, ''), '[<>&"]', '', 'g')), ''), '無名修士'), 16);
$$;

-- ───────────────────────── 房間 RPC ─────────────────────────

-- 建立房間：產生 5 位數房號；靠唯一索引防止同時建立造成重複，碰撞時重試
create or replace function public.create_room(p_nickname text, p_max_rounds int default 40)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_uid();
  v_room uuid;
  v_code text;
begin
  perform public.close_stale_rooms();
  for i in 1..40 loop
    v_code := lpad(floor(random() * 100000)::int::text, 5, '0');
    begin
      insert into public.rooms (code, host_id, max_rounds) values (v_code, v_uid, p_max_rounds) returning id into v_room;
      exit;
    exception when unique_violation then
      v_room := null;
    end;
  end loop;
  if v_room is null then
    raise exception 'NO_FREE_CODE' using errcode = 'P0001';
  end if;
  insert into public.room_members (room_id, user_id, nickname, kind, lord_id, is_host)
  values (v_room, v_uid, public.clean_nickname(p_nickname), 'human', 'cao', true);
  return json_build_object('room_id', v_room, 'code', v_code);
end;
$$;

-- 加入房間：鎖住房間列，避免兩人同時搶最後一個空位；已是成員則直接回到房間（重新整理或斷線重連）
create or replace function public.join_room(p_code text, p_nickname text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_uid();
  r public.rooms;
  v_count int;
  v_lord text;
begin
  perform public.close_stale_rooms();
  select * into r from public.rooms where code = p_code and status <> 'closed' for update;
  if not found then
    raise exception 'ROOM_NOT_FOUND' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.room_members where room_id = r.id and user_id = v_uid) then
    update public.room_members set last_seen_at = now() where room_id = r.id and user_id = v_uid;
    update public.rooms set last_activity_at = now() where id = r.id;
    return json_build_object('room_id', r.id, 'code', r.code, 'rejoined', true);
  end if;
  if r.status = 'playing' then
    raise exception 'ROOM_STARTED' using errcode = 'P0001';
  end if;
  select count(*) into v_count from public.room_members where room_id = r.id;
  if v_count >= r.max_players then
    raise exception 'ROOM_FULL' using errcode = 'P0001';
  end if;
  v_lord := public.free_lord(r.id);
  insert into public.room_members (room_id, user_id, nickname, kind, lord_id)
  values (r.id, v_uid, public.clean_nickname(p_nickname), 'human', v_lord);
  update public.rooms set last_activity_at = now() where id = r.id;
  return json_build_object('room_id', r.id, 'code', r.code, 'rejoined', false);
end;
$$;

-- 離開房間：等待中直接移除；遊戲中保留座位（可重新加入，房主可交由電腦代打）。
-- 房主離開時交給最早加入的真人；沒有真人就關閉房間。
create or replace function public.leave_room(p_room uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_uid();
  r public.rooms;
  m public.room_members;
  v_next uuid;
begin
  select * into r from public.rooms where id = p_room for update;
  if not found then return; end if;
  select * into m from public.room_members where room_id = p_room and user_id = v_uid;
  if not found then return; end if;
  if r.status = 'waiting' then
    delete from public.room_members where id = m.id;
  else
    update public.room_members set last_seen_at = now() - interval '1 hour' where id = m.id;
  end if;
  if m.is_host then
    select user_id into v_next from public.room_members
     where room_id = p_room and kind = 'human' and user_id <> v_uid
     order by (last_seen_at > now() - interval '1 minute') desc, joined_at limit 1;
    if v_next is null then
      update public.rooms set status = 'closed', closed_at = now() where id = p_room;
      return;
    end if;
    update public.room_members set is_host = (user_id = v_next) where room_id = p_room and kind = 'human';
    update public.rooms set host_id = v_next where id = p_room;
  end if;
  if r.status = 'waiting' and not exists (select 1 from public.room_members where room_id = p_room and kind = 'human') then
    update public.rooms set status = 'closed', closed_at = now() where id = p_room;
  end if;
  update public.rooms set last_activity_at = now() where id = p_room;
end;
$$;

create or replace function public.set_ready(p_room uuid, p_ready boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_uid();
begin
  update public.room_members m set ready = p_ready, last_seen_at = now()
   from public.rooms r
   where m.room_id = p_room and m.user_id = v_uid and r.id = m.room_id and r.status = 'waiting';
  if not found then
    raise exception 'NOT_IN_WAITING_ROOM' using errcode = 'P0001';
  end if;
  update public.rooms set last_activity_at = now() where id = p_room;
end;
$$;

-- 選擇陣營；已被選走時回報 LORD_TAKEN。換陣營會取消準備。
create or replace function public.set_lord(p_room uuid, p_lord text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_uid();
begin
  if not exists (select 1 from public.rooms where id = p_room and status = 'waiting') then
    raise exception 'NOT_IN_WAITING_ROOM' using errcode = 'P0001';
  end if;
  begin
    update public.room_members set lord_id = p_lord, ready = false, last_seen_at = now()
     where room_id = p_room and user_id = v_uid;
  exception when unique_violation then
    raise exception 'LORD_TAKEN' using errcode = 'P0001';
  end;
  if not found then
    raise exception 'NOT_MEMBER' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.assert_host(p_room uuid)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.rooms;
begin
  select * into r from public.rooms where id = p_room for update;
  if not found then
    raise exception 'ROOM_NOT_FOUND' using errcode = 'P0001';
  end if;
  if r.host_id <> public.require_uid() then
    raise exception 'NOT_HOST' using errcode = 'P0001';
  end if;
  return r;
end;
$$;

-- 房主設定回合數（null 為無盡）
create or replace function public.set_room_rounds(p_room uuid, p_max_rounds int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.rooms := public.assert_host(p_room);
begin
  if r.status <> 'waiting' then
    raise exception 'NOT_IN_WAITING_ROOM' using errcode = 'P0001';
  end if;
  update public.rooms set max_rounds = p_max_rounds, last_activity_at = now() where id = p_room;
end;
$$;

-- 房主加入電腦玩家
create or replace function public.add_ai(p_room uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.rooms := public.assert_host(p_room);
  v_count int;
  v_lord text;
  v_n int;
begin
  if r.status <> 'waiting' then
    raise exception 'NOT_IN_WAITING_ROOM' using errcode = 'P0001';
  end if;
  select count(*) into v_count from public.room_members where room_id = p_room;
  if v_count >= r.max_players then
    raise exception 'ROOM_FULL' using errcode = 'P0001';
  end if;
  v_lord := public.free_lord(p_room);
  select count(*) + 1 into v_n from public.room_members where room_id = p_room and kind = 'ai';
  insert into public.room_members (room_id, nickname, kind, lord_id, ready)
  values (p_room, '電腦' || v_n, 'ai', v_lord, true);
  update public.rooms set last_activity_at = now() where id = p_room;
end;
$$;

create or replace function public.remove_ai(p_room uuid, p_member uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.rooms := public.assert_host(p_room);
begin
  if r.status <> 'waiting' then
    raise exception 'NOT_IN_WAITING_ROOM' using errcode = 'P0001';
  end if;
  delete from public.room_members where id = p_member and room_id = p_room and kind = 'ai';
  update public.rooms set last_activity_at = now() where id = p_room;
end;
$$;

-- 心跳：前端每 15 秒呼叫一次，用來判斷誰在線上
create or replace function public.heartbeat(p_room uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_uid();
begin
  update public.room_members set last_seen_at = now() where room_id = p_room and user_id = v_uid;
  if found then
    update public.rooms set last_activity_at = now() where id = p_room and status <> 'closed';
  end if;
end;
$$;

-- 開始遊戲（由 Edge Function 以房主身分呼叫）：鎖住房間、確認房主與所有真人都已準備，改為 playing 並回傳座位。
-- 若房間已開始但遊戲資料還沒建立（上次啟動中途失敗），允許房主重試。
create or replace function public.begin_game(p_room uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.rooms := public.assert_host(p_room);
  v_seats json;
begin
  if r.status = 'closed' then
    raise exception 'ROOM_CLOSED' using errcode = 'P0001';
  end if;
  if r.status = 'playing' and exists (select 1 from public.game_public where room_id = p_room) then
    raise exception 'ALREADY_STARTED' using errcode = 'P0001';
  end if;
  if r.status = 'waiting' then
    if exists (select 1 from public.room_members where room_id = p_room and kind = 'human' and not ready) then
      raise exception 'NOT_ALL_READY' using errcode = 'P0001';
    end if;
    if (select count(*) from public.room_members where room_id = p_room) < 2 then
      raise exception 'NEED_TWO_SEATS' using errcode = 'P0001';
    end if;
    update public.rooms set status = 'playing', last_activity_at = now() where id = p_room;
  end if;
  select json_agg(json_build_object('lord', lord_id, 'human', kind = 'human', 'name', nickname) order by joined_at)
    into v_seats from public.room_members where room_id = p_room;
  return json_build_object('seats', v_seats, 'max_rounds', r.max_rounds);
end;
$$;

-- 寫入新的遊戲狀態（僅 service role）：版本號不符代表有人同時操作，整筆不寫入
create or replace function public.commit_game(
  p_room uuid, p_expected int, p_private jsonb, p_state jsonb, p_pending jsonb,
  p_over boolean, p_paused boolean, p_events jsonb, p_op uuid, p_user uuid
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version int;
begin
  if p_expected = 0 then
    insert into public.game_public (room_id, version, state, pending, over, paused)
    values (p_room, 1, p_state, p_pending, p_over, p_paused)
    on conflict (room_id) do nothing;
    if not found then
      raise exception 'VERSION_CONFLICT' using errcode = 'P0001';
    end if;
    v_version := 1;
    insert into public.game_private (room_id, data) values (p_room, p_private)
    on conflict (room_id) do update set data = excluded.data;
  else
    update public.game_public
       set version = version + 1, state = p_state, pending = p_pending, over = p_over, paused = p_paused, updated_at = now()
     where room_id = p_room and version = p_expected
     returning version into v_version;
    if v_version is null then
      raise exception 'VERSION_CONFLICT' using errcode = 'P0001';
    end if;
    update public.game_private set data = p_private where room_id = p_room;
  end if;
  insert into public.game_events (room_id, version, events) values (p_room, v_version, p_events);
  if p_op is not null then
    insert into public.game_ops (room_id, op_id, user_id, version) values (p_room, p_op, p_user, v_version);
  end if;
  update public.rooms set last_activity_at = now(), status = case when p_over then 'closed' else status end,
         closed_at = case when p_over then now() else closed_at end
   where id = p_room;
  -- 舊事件只保留最近 300 版，避免無限增長
  delete from public.game_events where room_id = p_room and version < v_version - 300;
  return v_version;
end;
$$;

-- ───────────────────────── 權限 ─────────────────────────

revoke all on function public.is_room_member(uuid) from public, anon;
revoke all on function public.close_stale_rooms() from public, anon, authenticated;
revoke all on function public.free_lord(uuid) from public, anon, authenticated;
revoke all on function public.assert_host(uuid) from public, anon, authenticated;
revoke all on function public.commit_game(uuid, int, jsonb, jsonb, jsonb, boolean, boolean, jsonb, uuid, uuid) from public, anon, authenticated;
grant execute on function public.commit_game(uuid, int, jsonb, jsonb, jsonb, boolean, boolean, jsonb, uuid, uuid) to service_role;

revoke all on function public.create_room(text, int) from public, anon;
revoke all on function public.join_room(text, text) from public, anon;
revoke all on function public.leave_room(uuid) from public, anon;
revoke all on function public.set_ready(uuid, boolean) from public, anon;
revoke all on function public.set_lord(uuid, text) from public, anon;
revoke all on function public.set_room_rounds(uuid, int) from public, anon;
revoke all on function public.add_ai(uuid) from public, anon;
revoke all on function public.remove_ai(uuid, uuid) from public, anon;
revoke all on function public.heartbeat(uuid) from public, anon;
revoke all on function public.begin_game(uuid) from public, anon;
grant execute on function public.create_room(text, int), public.join_room(text, text), public.leave_room(uuid),
  public.set_ready(uuid, boolean), public.set_lord(uuid, text), public.set_room_rounds(uuid, int),
  public.add_ai(uuid), public.remove_ai(uuid, uuid), public.heartbeat(uuid), public.begin_game(uuid),
  public.is_room_member(uuid)
  to authenticated;

-- ───────────────────────── Realtime ─────────────────────────

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'rooms') then
    alter publication supabase_realtime add table public.rooms;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'room_members') then
    alter publication supabase_realtime add table public.room_members;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'game_events') then
    alter publication supabase_realtime add table public.game_events;
  end if;
end;
$$;
-- 刪除成員時讓 Realtime 帶出完整舊資料（含 room_id，方便過濾）
alter table public.room_members replica identity full;
