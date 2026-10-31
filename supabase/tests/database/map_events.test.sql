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
  public.events,
  public.categories,
  public.venues,
  public.organizations,
  public.profiles;

insert into public.categories (id, name, slug) values
  ('00000000-0000-0000-0000-0000000000c1', 'Campus', 'campus');

insert into public.venues (id, name, coordinates) values
  ('00000000-0000-0000-0000-0000000000a1', 'Campus Center',
   st_setsrid(st_makepoint(-72.5281, 42.3896), 4326)::geography);

insert into public.events (id, title, primary_category_id, status, visibility) values
  ('00000000-0000-0000-0000-0000000000e1', 'Inside with own coordinates', '00000000-0000-0000-0000-0000000000c1', 'published', 'public'),
  ('00000000-0000-0000-0000-0000000000e2', 'Inside via venue',            '00000000-0000-0000-0000-0000000000c1', 'published', 'public'),
  ('00000000-0000-0000-0000-0000000000e3', 'Outside the map',             '00000000-0000-0000-0000-0000000000c1', 'published', 'public'),
  ('00000000-0000-0000-0000-0000000000e4', 'Draft event',                 '00000000-0000-0000-0000-0000000000c1', 'draft',     'public'),
  ('00000000-0000-0000-0000-0000000000e5', 'Outside the time window',     '00000000-0000-0000-0000-0000000000c1', 'published', 'public');

insert into public.event_occurrences (id, event_id, venue_id, starts_at, location_name, coordinates) values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e1', null,
   '2026-11-03T23:00:00Z', 'Bowker Auditorium',
   st_setsrid(st_makepoint(-72.5262, 42.3914), 4326)::geography),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000e2',
   '00000000-0000-0000-0000-0000000000a1', '2026-11-04T17:00:00Z', null, null),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000e3', null,
   '2026-11-04T17:00:00Z', 'Boston Common',
   st_setsrid(st_makepoint(-71.0589, 42.3601), 4326)::geography),
  ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000e4', null,
   '2026-11-04T17:00:00Z', 'Draft venue',
   st_setsrid(st_makepoint(-72.5270, 42.3900), 4326)::geography),
  ('00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000e5', null,
   '2026-12-01T17:00:00Z', 'Later venue',
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