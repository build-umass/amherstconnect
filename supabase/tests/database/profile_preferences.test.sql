begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select no_plan();

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

create function pg_temp.affected_rows(statement text)
returns bigint
language plpgsql
as $$
declare
  affected bigint;
begin
  execute statement;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '44444444-4444-4444-4444-444444444444',
    'authenticated', 'authenticated', 'profile-a@example.test',
    crypt('test-password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '55555555-5555-5555-5555-555555555555',
    'authenticated', 'authenticated', 'profile-b@example.test',
    crypt('test-password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '66666666-6666-6666-6666-666666666666',
    'authenticated', 'authenticated', 'profile-c@example.test',
    crypt('test-password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now()
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Create own default profile.
select lives_ok(
  $sql$
    insert into public.profiles (id, display_name, role)
    values ('44444444-4444-4444-4444-444444444444', 'Profile A', 'student')
  $sql$,
  'own profile can be created using interests and preference defaults'
);
-- Check empty interests default.
select is(
  (select interests from public.profiles where id = '44444444-4444-4444-4444-444444444444'),
  '{}'::text[],
  'interests default to an empty list'
);
-- Check notification defaults enabled.
select ok(
  (select notify_new_events and notify_saved_reminders
   from public.profiles where id = '44444444-4444-4444-4444-444444444444'),
  'both notification preferences default to true'
);

-- Save onboarding and preferences.
select is(
  pg_temp.affected_rows($sql$
    update public.profiles
    set interests = array['Dining', 'Music'],
        notify_new_events = false,
        notify_saved_reminders = false,
        onboarding_complete = true
    where id = '44444444-4444-4444-4444-444444444444'
  $sql$),
  1::bigint,
  'onboarding and preference values can be saved on the own profile'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
-- Reload saved interests.
select is(
  (select interests from public.profiles where id = '44444444-4444-4444-4444-444444444444'),
  array['Dining', 'Music']::text[],
  'saved interests are read back from the database'
);
-- Reload completed preference state.
select ok(
  (select onboarding_complete and not notify_new_events and not notify_saved_reminders
   from public.profiles where id = '44444444-4444-4444-4444-444444444444'),
  'saved onboarding and preference values are read back from the database'
);

-- Reject cross-user profile creation.
select ok(
  pg_temp.statement_denied($sql$
    insert into public.profiles (id, display_name, role, interests)
    values ('66666666-6666-6666-6666-666666666666', 'Profile C', 'student', array['Sports'])
  $sql$),
  'a user cannot create another profile with interests'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', true);
-- Create own populated profile.
select lives_ok(
  $sql$
    insert into public.profiles (
      id, display_name, role, interests, notify_new_events, notify_saved_reminders
    ) values (
      '55555555-5555-5555-5555-555555555555', 'Profile B', 'alumni',
      array['Arts'], false, true
    )
  $sql$,
  'a user can provide interests and preferences when creating their own profile'
);
-- Verify inserted interest values.
select is(
  (select interests from public.profiles where id = '55555555-5555-5555-5555-555555555555'),
  array['Arts']::text[],
  'explicit interests are stored at profile creation'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
-- Block cross-user preference updates.
select is(
  pg_temp.affected_rows($sql$
    update public.profiles set notify_new_events = true
    where id = '55555555-5555-5555-5555-555555555555'
  $sql$),
  0::bigint,
  'a user cannot update another profile'
);

select set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', true);
-- Hide another user's profile.
select is(
  (select count(*) from public.profiles where id = '44444444-4444-4444-4444-444444444444'),
  0::bigint,
  'a user cannot read another profile'
);

reset role;
set local role anon;
-- Deny anonymous profile reads.
select ok(
  pg_temp.statement_denied('select interests from public.profiles'),
  'anonymous clients cannot read profile interests'
);

select * from finish();
rollback;
