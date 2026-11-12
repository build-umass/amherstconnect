begin;

-- Keep the latest installation revision even when the installation is opted out.
create table public.push_installation_revisions (
  proof_hash text primary key,
  revision bigint not null check (revision > 0)
);
alter table public.push_installation_revisions enable row level security;
revoke all on public.push_installation_revisions from public, anon, authenticated, service_role;

alter table public.push_devices
  add column installation_proof_hash text unique;

create function public.sync_push_installation(
  p_proof text, p_revision bigint, p_token text default null, p_platform text default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_hash text;
  v_profile uuid := auth.uid();
  v_session uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
begin
  if p_proof is null or p_proof !~ '^[0-9a-f]{64}$'
    or p_revision is null or p_revision < 1 then
    raise invalid_parameter_value;
  end if;
  if v_profile is null then raise insufficient_privilege; end if;
  v_hash := encode(sha256(convert_to(p_proof, 'UTF8')), 'hex');

  if p_token is not null and (
    not exists (
      select 1 from auth.sessions s join public.profiles p on p.id = s.user_id
      where s.id = v_session and s.user_id = v_profile
        and (s.not_after is null or s.not_after > now())
        and p.onboarding_complete and (p.notify_new_events or p.notify_saved_reminders)
    )
  ) then
    raise insufficient_privilege;
  end if;

  insert into public.push_installation_revisions as state (proof_hash, revision)
  values (v_hash, p_revision)
  on conflict (proof_hash) do update set revision = excluded.revision
  where state.revision < excluded.revision;
  if not found then return; end if;

  delete from public.push_devices where installation_proof_hash = v_hash
    and (p_token is null or auth_session_id <> v_session);
  if p_token is null then return; end if;

  -- Permit upgrading an existing session's pre-handoff row, but never let
  -- a different installation proof take over an already bound device.
  insert into public.push_devices as device (
    auth_session_id, profile_id, expo_push_token, platform, installation_proof_hash
  ) values (v_session, v_profile, p_token, p_platform, v_hash)
  on conflict (auth_session_id) do update set
    expo_push_token = excluded.expo_push_token, platform = excluded.platform,
    installation_proof_hash = excluded.installation_proof_hash, last_registered_at = now()
  where device.installation_proof_hash is null or device.installation_proof_hash = v_hash;
  if not found then raise insufficient_privilege; end if;
end;
$$;
revoke all on function public.sync_push_installation(text, bigint, text, text)
from public, anon, authenticated, service_role;
grant execute on function public.sync_push_installation(text, bigint, text, text) to authenticated;

-- Keep the session-only RPCs for existing clients, scoped to their own
-- unbound registrations. They cannot transfer or overwrite a bound device.
create or replace function public.register_push_device(p_expo_push_token text, p_platform text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_profile_id uuid := auth.uid();
  v_session_id uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
begin
  if v_profile_id is null or v_session_id is null then raise insufficient_privilege; end if;
  perform pg_advisory_xact_lock(hashtextextended('push_devices:' || coalesce(p_expo_push_token, ''), 0));
  delete from public.push_devices where expo_push_token = p_expo_push_token
    and auth_session_id <> v_session_id and installation_proof_hash is null;
  insert into public.push_devices as device (auth_session_id, profile_id, expo_push_token, platform)
  values (v_session_id, v_profile_id, p_expo_push_token, p_platform)
  on conflict (auth_session_id) do update set profile_id = excluded.profile_id,
    expo_push_token = excluded.expo_push_token, platform = excluded.platform, last_registered_at = now()
  where device.installation_proof_hash is null;
  if not found then raise insufficient_privilege; end if;
end;
$$;

create or replace function public.unregister_push_device()
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_profile_id uuid := auth.uid();
  v_session_id uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
begin
  if v_profile_id is null or v_session_id is null then raise insufficient_privilege; end if;
  delete from public.push_devices where auth_session_id = v_session_id
    and profile_id = v_profile_id and installation_proof_hash is null;
  return found;
end;
$$;

commit;
