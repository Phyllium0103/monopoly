-- Old server-authoritative multiplayer only. P2P and Auth remain intact.
-- Existing production data was separately backed up before this cleanup.
begin;
drop policy if exists game_broadcast_receive on realtime.messages;
drop function if exists public.is_game_topic_member(text) restrict;
drop function if exists public.assert_host(uuid) restrict;
drop table if exists public.game_ops,public.game_events,public.game_private,public.game_public,public.room_members,public.rooms restrict;
drop function if exists
 public.add_ai(uuid),public.begin_game(uuid),public.clean_nickname(text),
 public.close_stale_rooms(),public.commit_game(uuid,integer,jsonb,jsonb,jsonb,boolean,boolean,jsonb,uuid,uuid),
 public.create_room(text,integer),public.free_lord(uuid),public.heartbeat(uuid),
 public.is_room_member(uuid),public.join_room(text,text),public.leave_room(uuid),
 public.load_game(uuid,uuid,uuid),public.remove_ai(uuid,uuid),public.require_uid(),
 public.set_lord(uuid,text),public.set_ready(uuid,boolean),public.set_room_rounds(uuid,integer) restrict;
commit;
