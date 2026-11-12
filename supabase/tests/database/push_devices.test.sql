begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select no_plan();

-- Devices registered on this database (for example from a phone) must not
-- affect the counts below. The surrounding transaction rolls this back.
truncate public.notification_deliveries, public.push_devices;

create function pg_temp.statement_denied(statement text)
returns boolean
language plpgsql
as $$
begin
  execute statement;
  return false;
exception
  when insufficient_privilege then
    return true;
end;
$$;

-- Acts as the app signed in with one Auth session: the role and access-token
-- claims that PostgREST sets for a request.
create function pg_temp.use_session(p_user_id uuid, p_session_id uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', p_user_id,
      'role', 'authenticated',
      'session_id', p_session_id
    )::text,
    true
  );
end;
$$;

-- Users A and B have profiles; C signed up but has not created one yet.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '77777777-7777-7777-7777-777777777777',
    'authenticated', 'authenticated', 'device-a@example.test',
    crypt('test-password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '88888888-8888-8888-8888-888888888888',
    'authenticated', 'authenticated', 'device-b@example.test',
    crypt('test-password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '99999999-9999-9999-9999-999999999999',
    'authenticated', 'authenticated', 'device-c@example.test',
    crypt('test-password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now()
  );

insert into public.profiles (id, display_name, role)
values
  ('77777777-7777-7777-7777-777777777777', 'Device A', 'student'),
  ('88888888-8888-8888-8888-888888888888', 'Device B', 'student');

-- One Auth session per sign-in: A on a phone (a1), a tablet (a2) and an
-- ended session (a3); B and C on one device each.
insert into auth.sessions (id, user_id, created_at, updated_at)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', '77777777-7777-7777-7777-777777777777', now(), now()),
  ('aaaaaaaa-0000-0000-0000-000000000002', '77777777-7777-7777-7777-777777777777', now(), now()),
  ('aaaaaaaa-0000-0000-0000-000000000003', '77777777-7777-7777-7777-777777777777', now(), now()),
  ('bbbbbbbb-0000-0000-0000-000000000001', '88888888-8888-8888-8888-888888888888', now(), now()),
  ('cccccccc-0000-0000-0000-000000000001', '99999999-9999-9999-9999-999999999999', now(), now());

-- Privileges.
select ok(
  not exists (
    select 1
    from unnest(array['anon', 'authenticated']) as client(role_name),
         unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) as operation(privilege)
    where has_table_privilege(client.role_name, 'public.push_devices', operation.privilege)
  ),
  'clients have no direct privileges on push_devices'
);
select ok(
  not exists (
    select 1
    from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) as operation(privilege)
    where not has_table_privilege('service_role', 'public.push_devices', operation.privilege)
  ),
  'service_role keeps CRUD privileges for notification senders'
);
select ok(
  has_function_privilege('authenticated', 'public.register_push_device(text, text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.unregister_push_device()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.register_push_device(text, text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.unregister_push_device()', 'EXECUTE'),
  'only signed-in users can register and unregister devices'
);
select ok(
  has_function_privilege('service_role', 'public.remove_unregistered_push_tokens(text[], timestamptz)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.remove_unregistered_push_tokens(text[], timestamptz)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.remove_unregistered_push_tokens(text[], timestamptz)', 'EXECUTE'),
  'only service_role can remove tokens that Expo reported unregistered'
);

-- Register a device.
select pg_temp.use_session('77777777-7777-7777-7777-777777777777', 'aaaaaaaa-0000-0000-0000-000000000001');
select lives_ok(
  $sql$ select public.register_push_device('ExponentPushToken[phone-1]', 'android') $sql$,
  'a signed-in user registers their device'
);
select ok(
  pg_temp.statement_denied('select * from public.push_devices'),
  'a client cannot read registrations directly'
);
select ok(
  pg_temp.statement_denied($sql$
    insert into public.push_devices (auth_session_id, profile_id, expo_push_token, platform)
    values (
      'bbbbbbbb-0000-0000-0000-000000000001', '88888888-8888-8888-8888-888888888888',
      'ExponentPushToken[forged]', 'android'
    )
  $sql$),
  'a client cannot write a registration for another session or profile'
);

reset role;
select results_eq(
  $sql$
    select auth_session_id, profile_id, expo_push_token, platform
    from public.push_devices
  $sql$,
  $sql$
    values (
      'aaaaaaaa-0000-0000-0000-000000000001'::uuid,
      '77777777-7777-7777-7777-777777777777'::uuid,
      'ExponentPushToken[phone-1]'::text,
      'android'::text
    )
  $sql$,
  'the profile and session come from the access token'
);

-- Registering again on every app start refreshes the registration.
update public.push_devices
set last_registered_at = now() - interval '40 days'
where auth_session_id = 'aaaaaaaa-0000-0000-0000-000000000001';

select pg_temp.use_session('77777777-7777-7777-7777-777777777777', 'aaaaaaaa-0000-0000-0000-000000000001');
select public.register_push_device('ExponentPushToken[phone-1]', 'android');
reset role;
select is(
  (select count(*) from public.push_devices),
  1::bigint,
  'registering the same device again does not add a row'
);
select is(
  (select last_registered_at from public.push_devices
   where auth_session_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  now(),
  'registering the same device again refreshes last_registered_at'
);

-- A second device for the same user.
select pg_temp.use_session('77777777-7777-7777-7777-777777777777', 'aaaaaaaa-0000-0000-0000-000000000002');
select lives_ok(
  $sql$ select public.register_push_device('ExpoPushToken[tablet-1]', 'ios') $sql$,
  'the same user registers a second device'
);
reset role;
select is(
  (select count(*) from public.push_devices where profile_id = '77777777-7777-7777-7777-777777777777'),
  2::bigint,
  'each signed-in device has its own registration'
);

-- A session that reports a new token keeps one registration.
select pg_temp.use_session('77777777-7777-7777-7777-777777777777', 'aaaaaaaa-0000-0000-0000-000000000002');
select public.register_push_device('ExpoPushToken[tablet-2]', 'ios');
reset role;
select results_eq(
  $sql$
    select expo_push_token from public.push_devices
    where auth_session_id = 'aaaaaaaa-0000-0000-0000-000000000002'
  $sql$,
  $sql$ values ('ExpoPushToken[tablet-2]'::text) $sql$,
  'a new token from the same session replaces the old one'
);

-- Another account signs in on A's phone: the phone now delivers to B only.
select pg_temp.use_session('88888888-8888-8888-8888-888888888888', 'bbbbbbbb-0000-0000-0000-000000000001');
select lives_ok(
  $sql$ select public.register_push_device('ExponentPushToken[phone-1]', 'android') $sql$,
  'another account registers a token already registered by someone else'
);
reset role;
select results_eq(
  $sql$
    select auth_session_id, profile_id from public.push_devices
    where expo_push_token = 'ExponentPushToken[phone-1]'
  $sql$,
  $sql$
    values (
      'bbbbbbbb-0000-0000-0000-000000000001'::uuid,
      '88888888-8888-8888-8888-888888888888'::uuid
    )
  $sql$,
  'a token belongs only to the account most recently signed in with it'
);
select results_eq(
  $sql$
    select expo_push_token from public.push_devices
    where profile_id = '77777777-7777-7777-7777-777777777777'
  $sql$,
  $sql$ values ('ExpoPushToken[tablet-2]'::text) $sql$,
  'the previous account keeps its other devices'
);

-- Invalid input.
select pg_temp.use_session('77777777-7777-7777-7777-777777777777', 'aaaaaaaa-0000-0000-0000-000000000001');
select throws_ok(
  $sql$ select public.register_push_device('fcm-device-token', 'android') $sql$,
  '23514', null,
  'values that are not Expo push tokens are rejected'
);
select throws_ok(
  $sql$ select public.register_push_device('ExponentPushToken[phone-1] ', 'android') $sql$,
  '23514', null,
  'tokens with surrounding text are rejected'
);
select throws_ok(
  $sql$ select public.register_push_device('ExponentPushToken[phone-3]', 'web') $sql$,
  '23514', null,
  'only iOS and Android devices are registered'
);
select throws_ok(
  $sql$ select public.register_push_device(null, 'android') $sql$,
  '23502', null,
  'a token is required'
);

-- Callers without a usable session.
reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"77777777-7777-7777-7777-777777777777","role":"authenticated"}',
  true
);
select throws_ok(
  $sql$ select public.register_push_device('ExponentPushToken[phone-3]', 'android') $sql$,
  '42501', null,
  'an access token without a session is refused'
);
select throws_ok(
  $sql$ select public.unregister_push_device() $sql$,
  '42501', null,
  'unregistering also requires a session'
);
select set_config('request.jwt.claims', '', true);
select throws_ok(
  $sql$ select public.register_push_device('ExponentPushToken[phone-3]', 'android') $sql$,
  '42501', null,
  'a request without a user is refused'
);

reset role;
set local role anon;
select ok(
  pg_temp.statement_denied($sql$ select public.register_push_device('ExponentPushToken[phone-3]', 'android') $sql$),
  'anonymous clients cannot register devices'
);

reset role;
select pg_temp.use_session('99999999-9999-9999-9999-999999999999', 'cccccccc-0000-0000-0000-000000000001');
select throws_ok(
  $sql$ select public.register_push_device('ExponentPushToken[no-profile]', 'android') $sql$,
  '23503', null,
  'a user registers devices only after creating a profile'
);

-- Signed out elsewhere: the session is gone but its access token has not expired.
reset role;
delete from auth.sessions where id = 'aaaaaaaa-0000-0000-0000-000000000003';
select pg_temp.use_session('77777777-7777-7777-7777-777777777777', 'aaaaaaaa-0000-0000-0000-000000000003');
select throws_ok(
  $sql$ select public.register_push_device('ExponentPushToken[ended]', 'android') $sql$,
  '23503', null,
  'an access token whose session has ended cannot register a device'
);

-- Unregister this device only.
select pg_temp.use_session('77777777-7777-7777-7777-777777777777', 'aaaaaaaa-0000-0000-0000-000000000001');
select public.register_push_device('ExponentPushToken[phone-2]', 'android');
select is(
  public.unregister_push_device(),
  true,
  'unregistering removes the current device'
);
select is(
  public.unregister_push_device(),
  false,
  'unregistering again reports that nothing was registered'
);
reset role;
select results_eq(
  $sql$
    select auth_session_id from public.push_devices
    where profile_id = '77777777-7777-7777-7777-777777777777'
  $sql$,
  $sql$ values ('aaaaaaaa-0000-0000-0000-000000000002'::uuid) $sql$,
  'unregistering one device keeps the user''s other devices'
);

-- Supabase Auth deletes the session when the user signs out.
delete from auth.sessions where id = 'aaaaaaaa-0000-0000-0000-000000000002';
select is(
  (select count(*) from public.push_devices where profile_id = '77777777-7777-7777-7777-777777777777'),
  0::bigint,
  'signing out removes that device''s registration'
);

delete from auth.users where id = '88888888-8888-8888-8888-888888888888';
select is(
  (select count(*) from public.push_devices where profile_id = '88888888-8888-8888-8888-888888888888'),
  0::bigint,
  'deleting an account removes its registrations'
);

-- Stale tokens: Expo reported DeviceNotRegistered for a send an hour ago.
insert into auth.sessions (id, user_id, created_at, updated_at)
values
  ('aaaaaaaa-0000-0000-0000-000000000004', '77777777-7777-7777-7777-777777777777', now(), now()),
  ('aaaaaaaa-0000-0000-0000-000000000005', '77777777-7777-7777-7777-777777777777', now(), now());
insert into public.push_devices (
  auth_session_id, profile_id, expo_push_token, platform, last_registered_at
)
values
  (
    'aaaaaaaa-0000-0000-0000-000000000004', '77777777-7777-7777-7777-777777777777',
    'ExponentPushToken[uninstalled]', 'android', now() - interval '2 hours'
  ),
  (
    'aaaaaaaa-0000-0000-0000-000000000005', '77777777-7777-7777-7777-777777777777',
    'ExponentPushToken[registered-again]', 'ios', now()
  );

set local role service_role;
select is(
  public.remove_unregistered_push_tokens(
    array[
      'ExponentPushToken[uninstalled]',
      'ExponentPushToken[registered-again]',
      'ExponentPushToken[never-registered]'
    ],
    now() - interval '1 hour'
  ),
  1,
  'tokens Expo reported unregistered are removed'
);
select throws_ok(
  $sql$ select public.remove_unregistered_push_tokens(array['ExponentPushToken[x]'], null) $sql$,
  '22023', null,
  'the send time is required'
);
reset role;
select results_eq(
  $sql$ select expo_push_token from public.push_devices $sql$,
  $sql$ values ('ExponentPushToken[registered-again]'::text) $sql$,
  'a token registered again after the failed send is kept'
);

select pg_temp.use_session('77777777-7777-7777-7777-777777777777', 'aaaaaaaa-0000-0000-0000-000000000005');
select ok(
  pg_temp.statement_denied($sql$
    select public.remove_unregistered_push_tokens(array['ExponentPushToken[registered-again]'], now())
  $sql$),
  'clients cannot remove tokens'
);

select * from finish();
rollback;
