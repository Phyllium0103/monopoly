-- 加速：Edge Function 寫入後直接把新狀態推送到私有頻道「game:<房間 id>」，
-- 其他玩家不必等資料庫通知、也不必再讀取一次。只有房間成員能收聽。

-- 由頻道名稱判斷是否為該房間成員（名稱格式不符時回傳 false，不會出錯）
create or replace function public.is_game_topic_member(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_room uuid;
begin
  if p_topic is null or left(p_topic, 5) <> 'game:' then
    return false;
  end if;
  begin
    v_room := substring(p_topic from 6)::uuid;
  exception when others then
    return false;
  end;
  return public.is_room_member(v_room);
end;
$$;

revoke all on function public.is_game_topic_member(text) from public, anon;
grant execute on function public.is_game_topic_member(text) to authenticated;

drop policy if exists game_broadcast_receive on realtime.messages;
create policy game_broadcast_receive on realtime.messages
  for select to authenticated
  using (realtime.messages.extension = 'broadcast' and public.is_game_topic_member(realtime.topic()));
