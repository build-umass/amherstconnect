begin;

-- Q01: where to deliver Expo push notifications. Each row is one signed-in
-- app installation that is allowed to show notifications. What a user wants
-- to receive stays in the existing profiles.notify_new_events and
-- profiles.notify_saved_reminders preferences; senders check those first.
--
-- A row belongs to the Supabase Auth session that registered it. Signing out
-- (this device, everywhere, or other devices), session expiry and account
-- deletion all delete that session, and with it the registration. A
-- signed-out device therefore stops receiving the account's notifications
-- even when the app cannot run any cleanup of its own.
create table public.push_devices (
  auth_session_id uuid primary key references auth.sessions (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  expo_push_token text not null,
  platform text not null,
  -- Refreshed every time the app starts signed in; the age of a registration.
  last_registered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- An installation has one Expo token, so one account receives on it at a time.
  constraint push_devices_expo_push_token_key unique (expo_push_token),
  constraint push_devices_expo_push_token_valid check (
    length(expo_push_token) <= 255
    and expo_push_token ~ '^(ExponentPushToken|ExpoPushToken)\[[^][[:space:]]+\]$'
  ),
  constraint push_devices_platform_valid check (platform in ('ios', 'android'))
);

create index push_devices_profile_id_idx on public.push_devices (profile_id);

create trigger push_devices_set_updated_at
before update on public.push_devices
for each row execute function public.set_updated_at();

-- Clients never read or write rows directly; they call the functions below,
-- which take the user and session from the verified access token.
alter table public.push_devices enable row level security;

revoke all on table public.push_devices from public, anon, authenticated;
grant select, insert, update, delete on table public.push_devices to service_role;

-- Registers the caller's Expo push token for the current session, or
-- refreshes last_registered_at when it is already registered. A token held
-- by another session (another account, or an earlier sign-in on this
-- installation) moves to this session.
create function public.register_push_device(p_expo_push_token text, p_platform text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid := (select auth.uid());
  v_session_id uuid := nullif((select auth.jwt()) ->> 'session_id', '')::uuid;
begin
  if v_profile_id is null or v_session_id is null then
    raise insufficient_privilege using message = 'A signed-in session is required';
  end if;

  -- Serialize registrations of one token so that two sessions cannot both
  -- keep it.
  perform pg_advisory_xact_lock(
    hashtextextended('push_devices:' || coalesce(p_expo_push_token, ''), 0)
  );

  delete from public.push_devices
  where expo_push_token = p_expo_push_token
    and auth_session_id <> v_session_id;

  -- The foreign keys reject a caller without a profile, and an access token
  -- whose session has already ended (it stays valid until it expires).
  insert into public.push_devices (auth_session_id, profile_id, expo_push_token, platform)
  values (v_session_id, v_profile_id, p_expo_push_token, p_platform)
  on conflict (auth_session_id) do update
  set profile_id = excluded.profile_id,
      expo_push_token = excluded.expo_push_token,
      platform = excluded.platform,
      last_registered_at = now();
end;
$$;

revoke all on function public.register_push_device(text, text)
from public, anon, authenticated, service_role;
grant execute on function public.register_push_device(text, text) to authenticated;

-- Removes the current session's registration, for example when notifications
-- are turned off for the app in system settings. Returns whether one existed.
create function public.unregister_push_device()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid := (select auth.uid());
  v_session_id uuid := nullif((select auth.jwt()) ->> 'session_id', '')::uuid;
begin
  if v_profile_id is null or v_session_id is null then
    raise insufficient_privilege using message = 'A signed-in session is required';
  end if;

  delete from public.push_devices
  where auth_session_id = v_session_id
    and profile_id = v_profile_id;

  return found;
end;
$$;

revoke all on function public.unregister_push_device()
from public, anon, authenticated, service_role;
grant execute on function public.unregister_push_device() to authenticated;

-- For the Q02 sender: Expo reported DeviceNotRegistered for these tokens in
-- a send made at p_sent_at. A registration refreshed after that send is kept,
-- because the installation has registered again since.
create function public.remove_unregistered_push_tokens(
  p_expo_push_tokens text[],
  p_sent_at timestamptz
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  removed_count integer;
begin
  if p_sent_at is null then
    raise exception 'p_sent_at is required' using errcode = '22023';
  end if;

  delete from public.push_devices
  where expo_push_token = any (p_expo_push_tokens)
    and last_registered_at <= p_sent_at;

  get diagnostics removed_count = row_count;
  return removed_count;
end;
$$;

revoke all on function public.remove_unregistered_push_tokens(text[], timestamptz)
from public, anon, authenticated, service_role;
grant execute on function public.remove_unregistered_push_tokens(text[], timestamptz)
to service_role;

commit;
