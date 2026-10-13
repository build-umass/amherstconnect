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
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '11111111-1111-1111-1111-111111111111',
    'authenticated',
    'authenticated',
    'alice@example.test',
    crypt('test-password', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '22222222-2222-2222-2222-222222222222',
    'authenticated',
    'authenticated',
    'bob@example.test',
    crypt('test-password', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '33333333-3333-3333-3333-333333333333',
    'authenticated',
    'authenticated',
    'charlie@example.test',
    crypt('test-password', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

insert into public.profiles (id, display_name, role)
values
  ('11111111-1111-1111-1111-111111111111', 'Alice', 'student'),
  ('22222222-2222-2222-2222-222222222222', 'Bob', 'student');

insert into public.organizations (id, name, slug)
values ('00000000-0000-0000-0000-000000000020', 'Test Organization', 'test-organization');

insert into public.venues (id, name, room)
values ('00000000-0000-0000-0000-000000000030', 'Test Venue', '101');

insert into public.categories (id, name, slug)
values ('00000000-0000-0000-0000-000000000010', 'Test Category', 'test-category');

insert into public.events (
  id,
  title,
  organization_id,
  primary_category_id,
  status,
  visibility,
  registration_type,
  registration_url
)
values
  (
    '00000000-0000-0000-0000-000000000101',
    'Published public internal event',
    '00000000-0000-0000-0000-000000000020',
    '00000000-0000-0000-0000-000000000010',
    'published',
    'public',
    'internal',
    null
  ),
  (
    '00000000-0000-0000-0000-000000000102',
    'Published authenticated internal event',
    '00000000-0000-0000-0000-000000000020',
    '00000000-0000-0000-0000-000000000010',
    'published',
    'authenticated',
    'internal',
    null
  ),
  (
    '00000000-0000-0000-0000-000000000103',
    'Published private internal event',
    '00000000-0000-0000-0000-000000000020',
    '00000000-0000-0000-0000-000000000010',
    'published',
    'private',
    'internal',
    null
  ),
  (
    '00000000-0000-0000-0000-000000000104',
    'Draft public internal event',
    '00000000-0000-0000-0000-000000000020',
    '00000000-0000-0000-0000-000000000010',
    'draft',
    'public',
    'internal',
    null
  ),
  (
    '00000000-0000-0000-0000-000000000105',
    'Archived public internal event',
    '00000000-0000-0000-0000-000000000020',
    '00000000-0000-0000-0000-000000000010',
    'archived',
    'public',
    'internal',
    null
  ),
  (
    '00000000-0000-0000-0000-000000000106',
    'Cancelled public internal event',
    '00000000-0000-0000-0000-000000000020',
    '00000000-0000-0000-0000-000000000010',
    'cancelled',
    'public',
    'internal',
    null
  ),
  (
    '00000000-0000-0000-0000-000000000107',
    'Postponed authenticated internal event',
    '00000000-0000-0000-0000-000000000020',
    '00000000-0000-0000-0000-000000000010',
    'postponed',
    'authenticated',
    'internal',
    null
  ),
  (
    '00000000-0000-0000-0000-000000000108',
    'Published public external event',
    '00000000-0000-0000-0000-000000000020',
    '00000000-0000-0000-0000-000000000010',
    'published',
    'public',
    'external',
    'https://example.test/register'
  );

insert into public.event_categories (event_id, category_id)
select id, '00000000-0000-0000-0000-000000000010'
from public.events;

insert into public.event_occurrences (
  id,
  event_id,
  venue_id,
  starts_at,
  ends_at,
  location_type,
  location_name
)
select
  ('00000000-0000-0000-0000-' || lpad((200 + row_number() over (order by id))::text, 12, '0'))::uuid,
  id,
  '00000000-0000-0000-0000-000000000030',
  '2026-11-01 16:00:00-05'::timestamptz + (row_number() over (order by id) * interval '1 day'),
  '2026-11-01 17:00:00-05'::timestamptz + (row_number() over (order by id) * interval '1 day'),
  'physical',
  'Test Venue'
from public.events;

insert into public.event_occurrences (
  id,
  event_id,
  venue_id,
  starts_at,
  ends_at,
  status,
  location_type,
  location_name
)
values (
  '00000000-0000-0000-0000-000000000209',
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000030',
  '2026-12-01 16:00:00-05',
  '2026-12-01 17:00:00-05',
  'cancelled',
  'physical',
  'Test Venue'
);

insert into public.bookmarks (profile_id, event_id)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000101'),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000101');

insert into public.rsvps (id, profile_id, occurrence_id)
values
  (
    '00000000-0000-0000-0000-000000000301',
    '11111111-1111-1111-1111-111111111111',
    '00000000-0000-0000-0000-000000000201'
  ),
  (
    '00000000-0000-0000-0000-000000000302',
    '22222222-2222-2222-2222-222222222222',
    '00000000-0000-0000-0000-000000000201'
  );

select ok(
  not exists (
    select 1
    from unnest(array[
      'profiles',
      'organizations',
      'venues',
      'categories',
      'events',
      'event_categories',
      'event_occurrences',
      'bookmarks',
      'rsvps'
    ]) as protected_tables(table_name)
    where has_table_privilege('anon', format('public.%I', table_name), 'SELECT')
       or has_table_privilege('anon', format('public.%I', table_name), 'INSERT')
       or has_table_privilege('anon', format('public.%I', table_name), 'UPDATE')
       or has_table_privilege('anon', format('public.%I', table_name), 'DELETE')
  ),
  'anon has no privileges on application tables'
);

select ok(
  not has_schema_privilege('anon', 'public', 'USAGE'),
  'anon has no usage privilege on the public schema'
);

select ok(
  (select rolbypassrls from pg_roles where rolname = 'service_role')
  and not exists (
    select 1
    from unnest(array[
      'profiles',
      'organizations',
      'venues',
      'categories',
      'events',
      'event_categories',
      'event_occurrences',
      'bookmarks',
      'rsvps'
    ]) as backend_tables(table_name)
    where not has_table_privilege('service_role', format('public.%I', table_name), 'SELECT')
       or not has_table_privilege('service_role', format('public.%I', table_name), 'INSERT')
       or not has_table_privilege('service_role', format('public.%I', table_name), 'UPDATE')
       or not has_table_privilege('service_role', format('public.%I', table_name), 'DELETE')
  ),
  'service_role retains CRUD privileges and RLS bypass for backend operations'
);

set local role anon;
select ok(
  pg_temp.statement_denied('select * from public.events'),
  'anonymous access is denied at runtime'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is((select count(*) from public.profiles), 1::bigint, 'profiles: user reads only own profile');
select is(
  (select count(*) from public.profiles where id = '22222222-2222-2222-2222-222222222222'),
  0::bigint,
  'profiles: another user profile is hidden'
);
select is(
  pg_temp.affected_rows($sql$
    update public.profiles set display_name = 'Alice Updated'
    where id = '11111111-1111-1111-1111-111111111111'
  $sql$),
  1::bigint,
  'profiles: user can update own profile'
);
select is(
  pg_temp.affected_rows($sql$
    update public.profiles set display_name = 'Attacked'
    where id = '22222222-2222-2222-2222-222222222222'
  $sql$),
  0::bigint,
  'profiles: cross-user update changes no rows'
);
select ok(
  pg_temp.statement_denied($sql$
    insert into public.profiles (id, display_name, role)
    values ('33333333-3333-3333-3333-333333333333', 'Cross-user insert', 'student')
  $sql$),
  'profiles: user cannot create another user profile'
);
select ok(
  pg_temp.statement_denied($sql$
    delete from public.profiles where id = '11111111-1111-1111-1111-111111111111'
  $sql$),
  'profiles: client profile deletion is not granted'
);

select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
select lives_ok(
  $sql$
    insert into public.profiles (id, display_name, role)
    values ('33333333-3333-3333-3333-333333333333', 'Charlie', 'student')
  $sql$,
  'profiles: authenticated user can create own profile'
);
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

select is((select count(*) from public.organizations), 1::bigint, 'organizations: authenticated read is allowed');
select ok(
  pg_temp.statement_denied($sql$insert into public.organizations (name, slug) values ('Blocked', 'blocked')$sql$)
  and pg_temp.statement_denied($sql$update public.organizations set name = 'Blocked' where id = '00000000-0000-0000-0000-000000000020'$sql$)
  and pg_temp.statement_denied($sql$delete from public.organizations where id = '00000000-0000-0000-0000-000000000020'$sql$),
  'organizations: all client writes are denied'
);

select is((select count(*) from public.venues), 1::bigint, 'venues: authenticated read is allowed');
select ok(
  pg_temp.statement_denied($sql$insert into public.venues (name) values ('Blocked')$sql$)
  and pg_temp.statement_denied($sql$update public.venues set name = 'Blocked' where id = '00000000-0000-0000-0000-000000000030'$sql$)
  and pg_temp.statement_denied($sql$delete from public.venues where id = '00000000-0000-0000-0000-000000000030'$sql$),
  'venues: all client writes are denied'
);

select is((select count(*) from public.categories), 1::bigint, 'categories: authenticated read is allowed');
select ok(
  pg_temp.statement_denied($sql$insert into public.categories (name, slug) values ('Blocked', 'blocked')$sql$)
  and pg_temp.statement_denied($sql$update public.categories set name = 'Blocked' where id = '00000000-0000-0000-0000-000000000010'$sql$)
  and pg_temp.statement_denied($sql$delete from public.categories where id = '00000000-0000-0000-0000-000000000010'$sql$),
  'categories: all client writes are denied'
);

select is((select count(*) from public.events), 5::bigint, 'events: only readable statuses and visibilities are returned');
select is((select count(*) from public.events where status = 'cancelled'), 1::bigint, 'events: cancelled event is readable');
select is((select count(*) from public.events where status = 'postponed'), 1::bigint, 'events: postponed event is readable');
select is((select count(*) from public.events where visibility = 'private'), 0::bigint, 'events: private event is hidden');
select is((select count(*) from public.events where status = 'draft'), 0::bigint, 'events: draft event is hidden');
select is((select count(*) from public.events where status = 'archived'), 0::bigint, 'events: archived event is hidden');
select ok(
  pg_temp.statement_denied($sql$
    insert into public.events (title, primary_category_id)
    values ('Blocked', '00000000-0000-0000-0000-000000000010')
  $sql$)
  and pg_temp.statement_denied($sql$update public.events set title = 'Blocked' where id = '00000000-0000-0000-0000-000000000101'$sql$)
  and pg_temp.statement_denied($sql$delete from public.events where id = '00000000-0000-0000-0000-000000000101'$sql$),
  'events: all client writes are denied'
);

select is((select count(*) from public.event_categories), 5::bigint, 'event_categories: rows follow readable parent events');
select is(
  (select count(*) from public.event_categories where event_id = '00000000-0000-0000-0000-000000000103'),
  0::bigint,
  'event_categories: private parent row is hidden'
);
select ok(
  pg_temp.statement_denied($sql$insert into public.event_categories (event_id, category_id) values ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000010')$sql$)
  and pg_temp.statement_denied($sql$update public.event_categories set updated_at = now() where event_id = '00000000-0000-0000-0000-000000000101'$sql$)
  and pg_temp.statement_denied($sql$delete from public.event_categories where event_id = '00000000-0000-0000-0000-000000000101'$sql$),
  'event_categories: all client writes are denied'
);

select is((select count(*) from public.event_occurrences), 6::bigint, 'event_occurrences: rows follow readable parent events');
select is(
  (select count(*) from public.event_occurrences where event_id = '00000000-0000-0000-0000-000000000104'),
  0::bigint,
  'event_occurrences: draft parent row is hidden'
);
select ok(
  pg_temp.statement_denied($sql$
    insert into public.event_occurrences (event_id, starts_at, location_name)
    values ('00000000-0000-0000-0000-000000000101', now(), 'Blocked')
  $sql$)
  and pg_temp.statement_denied($sql$update public.event_occurrences set status = 'cancelled' where id = '00000000-0000-0000-0000-000000000201'$sql$)
  and pg_temp.statement_denied($sql$delete from public.event_occurrences where id = '00000000-0000-0000-0000-000000000201'$sql$),
  'event_occurrences: all client writes are denied'
);

select is((select count(*) from public.bookmarks), 1::bigint, 'bookmarks: user reads only own bookmarks');
select is(
  (select count(*) from public.bookmarks where profile_id = '22222222-2222-2222-2222-222222222222'),
  0::bigint,
  'bookmarks: another user bookmark is hidden'
);
select lives_ok(
  $sql$
    insert into public.bookmarks (profile_id, event_id)
    values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000102')
  $sql$,
  'bookmarks: user can bookmark a readable event'
);
select ok(
  pg_temp.statement_denied($sql$
    insert into public.bookmarks (profile_id, event_id)
    values ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000102')
  $sql$),
  'bookmarks: user cannot create a bookmark for another profile'
);
select ok(
  pg_temp.statement_denied($sql$
    insert into public.bookmarks (profile_id, event_id)
    values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000104')
  $sql$),
  'bookmarks: draft event cannot be bookmarked'
);
select ok(
  pg_temp.statement_denied($sql$
    insert into public.bookmarks (profile_id, event_id)
    values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000103')
  $sql$),
  'bookmarks: private event cannot be bookmarked'
);
select is(
  pg_temp.affected_rows($sql$
    delete from public.bookmarks
    where profile_id = '11111111-1111-1111-1111-111111111111'
      and event_id = '00000000-0000-0000-0000-000000000102'
  $sql$),
  1::bigint,
  'bookmarks: user can delete own bookmark'
);
select is(
  pg_temp.affected_rows($sql$
    delete from public.bookmarks
    where profile_id = '22222222-2222-2222-2222-222222222222'
  $sql$),
  0::bigint,
  'bookmarks: cross-user delete changes no rows'
);
select ok(
  pg_temp.statement_denied($sql$
    update public.bookmarks set updated_at = now()
    where profile_id = '11111111-1111-1111-1111-111111111111'
  $sql$),
  'bookmarks: update is not granted'
);

select is((select count(*) from public.rsvps), 1::bigint, 'rsvps: user reads only own RSVPs');
select is(
  (select count(*) from public.rsvps where profile_id = '22222222-2222-2222-2222-222222222222'),
  0::bigint,
  'rsvps: another user RSVP is hidden'
);
select lives_ok(
  $sql$
    insert into public.rsvps (profile_id, occurrence_id)
    values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000202')
  $sql$,
  'rsvps: user can RSVP to a readable internal-registration occurrence'
);
select ok(
  pg_temp.statement_denied($sql$
    insert into public.rsvps (profile_id, occurrence_id)
    values ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000202')
  $sql$),
  'rsvps: user cannot create an RSVP for another profile'
);
select ok(
  pg_temp.statement_denied($sql$
    insert into public.rsvps (profile_id, occurrence_id)
    values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000203')
  $sql$),
  'rsvps: private event occurrence cannot be RSVPed to'
);
select ok(
  pg_temp.statement_denied($sql$
    insert into public.rsvps (profile_id, occurrence_id)
    values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000208')
  $sql$),
  'rsvps: external-registration event occurrence is rejected'
);
select ok(
  pg_temp.statement_denied($sql$
    insert into public.rsvps (profile_id, occurrence_id)
    values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000206')
  $sql$),
  'rsvps: cancelled event rejects a going RSVP'
);
select ok(
  pg_temp.statement_denied($sql$
    insert into public.rsvps (profile_id, occurrence_id)
    values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000207')
  $sql$),
  'rsvps: postponed event rejects a going RSVP'
);
select ok(
  pg_temp.statement_denied($sql$
    insert into public.rsvps (profile_id, occurrence_id)
    values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000209')
  $sql$),
  'rsvps: cancelled occurrence rejects a going RSVP'
);
select is(
  pg_temp.affected_rows($sql$
    update public.rsvps set status = 'cancelled'
    where id = '00000000-0000-0000-0000-000000000302'
  $sql$),
  0::bigint,
  'rsvps: cross-user update changes no rows'
);

reset role;
update public.event_occurrences
set status = 'cancelled'
where id = '00000000-0000-0000-0000-000000000201';
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  pg_temp.affected_rows($sql$
    update public.rsvps set status = 'cancelled'
    where id = '00000000-0000-0000-0000-000000000301'
  $sql$),
  1::bigint,
  'rsvps: user can cancel an existing RSVP after its occurrence is cancelled'
);
select ok(
  pg_temp.statement_denied($sql$
    update public.rsvps set status = 'going'
    where id = '00000000-0000-0000-0000-000000000301'
  $sql$),
  'rsvps: cancelled occurrence prevents reactivating an RSVP'
);

reset role;
update public.events
set status = 'postponed'
where id = '00000000-0000-0000-0000-000000000102';
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  pg_temp.affected_rows($sql$
    update public.rsvps set status = 'cancelled'
    where profile_id = '11111111-1111-1111-1111-111111111111'
      and occurrence_id = '00000000-0000-0000-0000-000000000202'
  $sql$),
  1::bigint,
  'rsvps: user can cancel an existing RSVP after its event is postponed'
);
select ok(
  pg_temp.statement_denied($sql$
    update public.rsvps set status = 'going'
    where profile_id = '11111111-1111-1111-1111-111111111111'
      and occurrence_id = '00000000-0000-0000-0000-000000000202'
  $sql$),
  'rsvps: postponed event prevents reactivating an RSVP'
);
select is(
  pg_temp.affected_rows($sql$
    delete from public.rsvps
    where profile_id = '11111111-1111-1111-1111-111111111111'
      and occurrence_id = '00000000-0000-0000-0000-000000000202'
  $sql$),
  1::bigint,
  'rsvps: user can delete own RSVP'
);
select is(
  pg_temp.affected_rows($sql$
    delete from public.rsvps where id = '00000000-0000-0000-0000-000000000302'
  $sql$),
  0::bigint,
  'rsvps: cross-user delete changes no rows'
);

select * from finish();
rollback;
