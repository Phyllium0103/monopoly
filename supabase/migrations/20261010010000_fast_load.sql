-- 加速：Edge Function 一次讀回成員、公開狀態、伺服器記錄與操作 ID 是否已執行（原本要 4 次往返）
create or replace function public.load_game(p_room uuid, p_user uuid, p_op uuid default null)
returns json
language sql
stable
security definer
set search_path = ''
as $$
  select json_build_object(
    'member', (select row_to_json(m) from public.room_members m where m.room_id = p_room and m.user_id = p_user),
    'pub', (select json_build_object('version', g.version, 'pending', g.pending, 'over', g.over, 'paused', g.paused) from public.game_public g where g.room_id = p_room),
    'record', (select p.data -> 'record' from public.game_private p where p.room_id = p_room),
    'op_version', (select o.version from public.game_ops o where o.room_id = p_room and o.op_id = p_op)
  );
$$;

revoke all on function public.load_game(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.load_game(uuid, uuid, uuid) to service_role;
