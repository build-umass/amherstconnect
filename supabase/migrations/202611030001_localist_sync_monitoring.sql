-- Server-only run telemetry and a crash-expiring lease. No client grants.
create table public.localist_sync_runs (
 id uuid primary key default gen_random_uuid(),
 started_at timestamptz not null default now(),
 finished_at timestamptz,
 lease_until timestamptz not null default (now() + interval '15 minutes'),
 status text not null default 'running' check (status in ('running','completed','failed')),
 counts jsonb not null default '{}'::jsonb
);
alter table public.localist_sync_runs enable row level security;
revoke all on public.localist_sync_runs from anon, authenticated;
grant select,insert,update,delete on public.localist_sync_runs to service_role;
create function public.begin_localist_sync() returns uuid language plpgsql security invoker set search_path = '' as $$
declare result uuid;
begin
 perform pg_advisory_xact_lock(831103);
 if exists(select 1 from public.localist_sync_runs where status='running' and lease_until>now()) then
  raise exception 'Localist sync already running' using errcode='55P03';
 end if;
 update public.localist_sync_runs set status='failed',finished_at=now() where status='running';
 insert into public.localist_sync_runs default values returning id into result;
 return result;
end $$;
create function public.finish_localist_sync(p_id uuid,p_status text,p_counts jsonb) returns boolean language plpgsql security invoker set search_path = '' as $$
begin
 if p_status not in ('completed','failed') then raise exception 'Invalid final status'; end if;
 perform 1 from public.localist_sync_runs where id=p_id for update;
 if exists(select 1 from public.localist_sync_runs where id=p_id and status=p_status and counts=p_counts) then return true; end if;
 update public.localist_sync_runs set status=p_status,counts=p_counts,finished_at=clock_timestamp()
 where id=p_id and status='running' and (p_status='failed' or lease_until>clock_timestamp());
 if not found then raise exception 'Lease lost or finalization conflicts'; end if;
 return true;
end $$;
revoke all on function public.begin_localist_sync() from public,anon,authenticated;
revoke all on function public.finish_localist_sync(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.begin_localist_sync() to service_role;
grant execute on function public.finish_localist_sync(uuid,text,jsonb) to service_role;
create index localist_sync_success on public.localist_sync_runs(finished_at desc) where status='completed';

alter table public.import_runs add column sync_id uuid references public.localist_sync_runs(id);
create index import_runs_sync_id on public.import_runs(sync_id);
create function public.assert_localist_lease(p_id uuid) returns void language plpgsql security invoker set search_path='' as $$
begin
 perform 1 from public.localist_sync_runs where id=p_id and status='running' and lease_until>clock_timestamp() for update;
 if not found then raise exception 'Localist lease lost' using errcode='55P03'; end if;
end $$;
create function public.fence_localist_write() returns trigger language plpgsql security invoker set search_path='' as $$
declare sync uuid;
begin
 if tg_table_name='import_runs' then sync:=new.sync_id;
 else select sync_id into sync from public.import_runs where id=new.run_id; end if;
 if sync is not null then perform public.assert_localist_lease(sync); end if;
 return new;
end $$;
create trigger fence_sync_run before insert or update on public.import_runs for each row execute function public.fence_localist_write();
create trigger fence_sync_record before insert on public.event_import_records for each row execute function public.fence_localist_write();
create function public.hosted_import_event_record(p_sync_id uuid,p_run_id uuid,p_record_index integer,p_draft jsonb,p_mapping jsonb,p_payload_hash text,p_failure jsonb default null) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 perform public.assert_localist_lease(p_sync_id);
 if not exists(select 1 from public.import_runs where id=p_run_id and sync_id=p_sync_id) then raise exception 'Sync/run mismatch'; end if;
 result:=public.import_event_record(p_run_id,p_record_index,p_draft,p_mapping,p_payload_hash,p_failure);
 perform public.assert_localist_lease(p_sync_id);
 return result;
end $$;
revoke all on function public.assert_localist_lease(uuid),public.fence_localist_write(),public.hosted_import_event_record(uuid,uuid,integer,jsonb,jsonb,text,jsonb) from public,anon,authenticated;
grant execute on function public.assert_localist_lease(uuid),public.fence_localist_write(),public.hosted_import_event_record(uuid,uuid,integer,jsonb,jsonb,text,jsonb) to service_role;
