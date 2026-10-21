-- A room expires only when no human browser has reported occupancy for >5 minutes.
-- Host online status stays separate: a remaining guest can wait for the host to return.
begin;
create extension if not exists pg_cron with schema pg_catalog;
alter table public.p2p_rooms add column if not exists last_occupied_at timestamptz not null default now();
create index if not exists p2p_rooms_occupied on public.p2p_rooms (greatest(last_occupied_at,last_seen_at));

create or replace function public.p2p_note_host_presence()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 new.last_occupied_at:=greatest(new.last_occupied_at,new.last_seen_at);
 return new;
end;
$$;
revoke all on function public.p2p_note_host_presence() from public,anon,authenticated;
drop trigger if exists p2p_host_presence on public.p2p_rooms;
create trigger p2p_host_presence before insert or update of last_seen_at on public.p2p_rooms
 for each row execute function public.p2p_note_host_presence();

create or replace function public.p2p_present(p_code text)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.p2p_uid();
 update public.p2p_rooms set last_occupied_at=clock_timestamp() where code=p_code;
end;
$$;
revoke all on function public.p2p_present(text) from public,anon;
grant execute on function public.p2p_present(text) to authenticated;

create or replace function public.p2p_remove_empty_rooms()
returns integer language plpgsql security definer set search_path='' as $$
declare removed integer;
begin
 delete from public.p2p_rooms where greatest(last_occupied_at,last_seen_at)<clock_timestamp()-interval '5 minutes';
 get diagnostics removed=row_count;
 return removed;
end;
$$;
revoke all on function public.p2p_remove_empty_rooms() from public,anon,authenticated;

-- Persistent database job, independent of players' browsers and this chat.
-- Named schedule is updated in place if this migration is run again.
set local role postgres;
select cron.schedule('p2p-empty-room-cleanup','* * * * *','select public.p2p_remove_empty_rooms();');
commit;
