begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select no_plan();

truncate
  public.event_import_records,
  public.event_import_state,
  public.import_runs,
  public.rsvps,
  public.bookmarks,
  public.event_occurrences,
  public.event_categories,
  public.event_duplicate_candidates,
  public.events,
  public.categories,
  public.venues,
  public.organizations,
  public.profiles;

insert into public.categories (id, name, slug) values
  ('00000000-0000-0000-0000-0000000000c1', 'Social & Community', 'social-community');

insert into public.venues (id, name, coordinates) values
  ('00000000-0000-0000-0000-0000000000a1', 'Campus Center',
   st_setsrid(st_makepoint(-72.5281, 42.3896), 4326)::geography);

insert into public.events (id, title, primary_category_id, status, visibility) values
  -- bounds, time window, venue fallback and RLS
  ('00000000-0000-0000-0000-0000000000e1', 'Inside with own coordinates', '00000000-0000-0000-0000-0000000000c1', 'published', 'public'),
  ('00000000-0000-0000-0000-0000000000e2', 'Inside via venue',            '00000000-0000-0000-0000-0000000000c1', 'published', 'public'),
  ('00000000-0000-0000-0000-0000000000e3', 'Outside the map',             '00000000-0000-0000-0000-0000000000c1', 'published', 'public'),
  ('00000000-0000-0000-0000-0000000000e4', 'Draft event',                 '00000000-0000-0000-0000-0000000000c1', 'draft',     'public'),
  ('00000000-0000-0000-0000-0000000000e5', 'Outside the time window',     '00000000-0000-0000-0000-0000000000c1', 'published', 'public'),
  -- window boundary (fix 1)
  ('00000000-0000-0000-0000-0000000000e6', 'Ends exactly at window start', '00000000-0000-0000-0000-0000000000c1', 'published', 'public'),
  ('00000000-0000-0000-0000-0000000000e7', 'Ends after window start',      '00000000-0000-0000-0000-0000000000c1', 'published', 'public'),
  ('00000000-0000-0000-0000-0000000000e8', 'No end, starts at window start', '00000000-0000-0000-0000-0000000000c1', 'published', 'public'),
  -- unavailable rows before the limit (fix 2)
  ('00000000-0000-0000-0000-0000000000e9', 'Cancelled event',             '00000000-0000-0000-0000-0000000000c1', 'cancelled', 'public'),
  ('00000000-0000-0000-0000-0000000000ea', 'Cancelled occurrence',        '00000000-0000-0000-0000-0000000000c1', 'published', 'public'),
  ('00000000-0000-0000-0000-0000000000eb', 'Postponed event',             '00000000-0000-0000-0000-0000000000c1', 'postponed', 'public');

insert into public.event_occurrences (id, event_id, venue_id, starts_at, ends_at, status, location_name, coordinates) values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e1', null,
   '2026-11-03T23:00:00Z', null, 'scheduled', 'Bowker Auditorium',
   st_setsrid(st_makepoint(-72.5262, 42.3914), 4326)::geography),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000e2',
   '00000000-0000-0000-0000-0000000000a1', '2026-11-04T17:00:00Z', null, 'scheduled', null, null),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000e3', null,
   '2026-11-04T17:00:00Z', null, 'scheduled', 'Boston Common',
   st_setsrid(st_makepoint(-71.0589, 42.3601), 4326)::geography),
  ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000e4', null,
   '2026-11-04T17:00:00Z', null, 'scheduled', 'Draft venue',
   st_setsrid(st_makepoint(-72.5270, 42.3900), 4326)::geography),
  ('00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000e5', null,
   '2026-12-01T17:00:00Z', null, 'scheduled', 'Later venue',
   st_setsrid(st_makepoint(-72.5270, 42.3900), 4326)::geography),

  ('00000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-0000000000e6', null,
   '2026-11-10T13:00:00Z', '2026-11-10T15:00:00Z', 'scheduled', 'Ends at start',
   st_setsrid(st_makepoint(-72.5270, 42.3900), 4326)::geography),
  ('00000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-0000000000e7', null,
   '2026-11-10T14:00:00Z', '2026-11-10T15:01:00Z', 'scheduled', 'Ends after start',
   st_setsrid(st_makepoint(-72.5270, 42.3900), 4326)::geography),
  ('00000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-0000000000e8', null,
   '2026-11-10T15:00:00Z', null, 'scheduled', 'Starts at window start',
   st_setsrid(st_makepoint(-72.5270, 42.3900), 4326)::geography),

  -- these start earliest, so without the fix they would fill the limit first
  ('00000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-0000000000e9', null,
   '2026-11-10T12:00:00Z', '2026-11-10T18:00:00Z', 'scheduled', 'Cancelled event venue',
   st_setsrid(st_makepoint(-72.5270, 42.3900), 4326)::geography),
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-0000000000ea', null,
   '2026-11-10T12:00:00Z', '2026-11-10T18:00:00Z', 'cancelled', 'Cancelled occurrence venue',
   st_setsrid(st_makepoint(-72.5270, 42.3900), 4326)::geography),
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-0000000000eb', null,
   '2026-11-10T12:00:00Z', '2026-11-10T18:00:00Z', 'scheduled', 'Postponed event venue',
   st_setsrid(st_makepoint(-72.5270, 42.3900), 4326)::geography);

set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated"}';

select results_eq(
  $$ select occurrence_id
     from public.map_occurrences_in_bounds(
       42.37, -72.55, 42.40, -72.50,
       '2026-11-02T00:00:00Z', '2026-11-09T00:00:00Z')
     order by occurrence_id $$,
  $$ values ('00000000-0000-0000-0000-000000000001'::uuid),
            ('00000000-0000-0000-0000-000000000002'::uuid) $$,
  'returns published occurrences inside the bounds and time window only'
);

select is(
  (select location_name
   from public.map_occurrences_in_bounds(
     42.37, -72.55, 42.40, -72.50,
     '2026-11-02T00:00:00Z', '2026-11-09T00:00:00Z')
   where occurrence_id = '00000000-0000-0000-0000-000000000002'),
  'Campus Center',
  'falls back to the venue name when the occurrence has none'
);

select is(
  (select round(latitude::numeric, 4)
   from public.map_occurrences_in_bounds(
     42.37, -72.55, 42.40, -72.50,
     '2026-11-02T00:00:00Z', '2026-11-09T00:00:00Z')
   where occurrence_id = '00000000-0000-0000-0000-000000000002'),
  42.3896::numeric,
  'uses venue coordinates when the occurrence has none'
);

select is(
  (select count(*)
   from public.map_occurrences_in_bounds(
     42.40, -72.55, 42.37, -72.50,
     '2026-11-02T00:00:00Z', '2026-11-09T00:00:00Z')),
  0::bigint,
  'inverted bounds return no rows'
);

-- Regression: an occurrence ending exactly at the window start is excluded;
-- cancelled and postponed occurrences are excluded.
select results_eq(
  $$ select occurrence_id
     from public.map_occurrences_in_bounds(
       42.37, -72.55, 42.40, -72.50,
       '2026-11-10T15:00:00Z', '2026-11-11T00:00:00Z')
     order by occurrence_id $$,
  $$ values ('00000000-0000-0000-0000-000000000007'::uuid),
            ('00000000-0000-0000-0000-000000000008'::uuid) $$,
  'excludes occurrences that end at the window start and unavailable occurrences'
);

-- Regression: unavailable occurrences are filtered before the limit.
select results_eq(
  $$ select occurrence_id
     from public.map_occurrences_in_bounds(
       42.37, -72.55, 42.40, -72.50,
       '2026-11-10T15:00:00Z', '2026-11-11T00:00:00Z', 1) $$,
  $$ values ('00000000-0000-0000-0000-000000000007'::uuid) $$,
  'unavailable occurrences do not use up the result limit'
);

reset role;
set local role anon;

select throws_ok(
  $$ select * from public.map_occurrences_in_bounds(
       42.37, -72.55, 42.40, -72.50, now(), now() + interval '1 day') $$,
  '42501',
  null,
  'anonymous users cannot call the map query'
);

select * from finish();
rollback;