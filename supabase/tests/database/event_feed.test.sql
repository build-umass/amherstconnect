begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select no_plan();

truncate
  public.notification_deliveries,
  public.notification_inbox,
  public.push_devices,
  public.listing_submissions,
  public.content_reviewer_memberships,
  public.business_memberships,
  public.businesses,
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
  ('00000000-0000-0000-0000-0000000000c1', 'Social & Community', 'social-community'),
  ('00000000-0000-0000-0000-0000000000c2', 'Food & Drink',       'food-drink'),
  ('00000000-0000-0000-0000-0000000000c3', 'Arts & Culture',     'arts-culture');

insert into public.organizations (id, name, slug, website_url) values
  ('00000000-0000-0000-0000-0000000000b1', 'UMass Dance Club',   'umass-dance-club',   'https://dance.umass.edu'),
  ('00000000-0000-0000-0000-0000000000b2', 'Amherst Run Club',   'amherst-run-club',   null),
  ('00000000-0000-0000-0000-0000000000b3', 'Past Speakers',      'past-speakers',      null),
  ('00000000-0000-0000-0000-0000000000b4', 'Secret Society',     'secret-society',     null),
  ('00000000-0000-0000-0000-0000000000b5', 'No Events Club',     'no-events-club',     null);

insert into public.venues (id, name, room, address_line_1, city, region, postal_code, coordinates) values
  ('00000000-0000-0000-0000-0000000000a1', 'Campus Center', '101', '1 Campus Center Way', 'Amherst', 'MA', '01003',
   st_setsrid(st_makepoint(-72.5281, 42.3896), 4326)::geography);

insert into public.events
  (id, title, primary_category_id, organization_id, status, visibility, is_free, source_type, external_id, source_url, description)
values
  ('00000000-0000-0000-0000-0000000000e1', 'Weekly Tea Social',    '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', 'published', 'public',  true,  'amherst_connect', null, null, 'Tea every week'),
  ('00000000-0000-0000-0000-0000000000e2', 'Pizza Night',          '00000000-0000-0000-0000-0000000000c2', null,                                   'published', 'public',  true,  'amherst_connect', null, null, null),
  ('00000000-0000-0000-0000-0000000000e3', 'Gallery Opening',      '00000000-0000-0000-0000-0000000000c3', null,                                   'published', 'public',  false, 'localist', 'g-1', 'https://events.umass.edu/event/gallery-opening', 'Student art'),
  ('00000000-0000-0000-0000-0000000000e4', 'Draft Event',          '00000000-0000-0000-0000-0000000000c1', null,                                   'draft',     'public',  true,  'amherst_connect', null, null, null),
  ('00000000-0000-0000-0000-0000000000e5', 'Private Event',        '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b4', 'published', 'private', true,  'amherst_connect', null, null, null),
  ('00000000-0000-0000-0000-0000000000e6', 'Cancelled Concert',    '00000000-0000-0000-0000-0000000000c3', null,                                   'cancelled', 'public',  true,  'amherst_connect', null, null, null),
  ('00000000-0000-0000-0000-0000000000e7', 'Cancelled Occurrence', '00000000-0000-0000-0000-0000000000c1', null,                                   'published', 'public',  true,  'amherst_connect', null, null, null),
  ('00000000-0000-0000-0000-0000000000e8', 'Ended Talk',           '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b3', 'published', 'public',  true,  'amherst_connect', null, null, null),
  ('00000000-0000-0000-0000-0000000000e9', '100% Fun Run',         '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b2', 'published', 'public',  true,  'amherst_connect', null, null, null),
  ('00000000-0000-0000-0000-0000000000ea', 'Postponed Show',       '00000000-0000-0000-0000-0000000000c3', null,                                   'postponed', 'public',  true,  'amherst_connect', null, null, null),
  ('00000000-0000-0000-0000-0000000000eb', 'Far Future',           '00000000-0000-0000-0000-0000000000c1', null,                                   'published', 'public',  true,  'amherst_connect', null, null, null);

-- Pizza Night is also tagged Social & Community.
insert into public.event_categories (event_id, category_id) values
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000c1');

-- "Now" in these tests is 2026-11-10T15:00:00Z.
insert into public.event_occurrences (id, event_id, venue_id, starts_at, ends_at, status, location_name) values
  -- Weekly Tea Social: one past, two upcoming. The feed shows the 11th.
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e1', null, '2026-11-03T17:00:00Z', '2026-11-03T18:00:00Z', 'scheduled', 'Student Union'),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000e1', null, '2026-11-11T17:00:00Z', '2026-11-11T18:00:00Z', 'scheduled', 'Student Union'),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000e1', null, '2026-11-18T17:00:00Z', '2026-11-18T18:00:00Z', 'scheduled', 'Student Union'),
  -- Pizza Night: already started, still running. Location comes from the venue.
  ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000a1', '2026-11-10T14:00:00Z', '2026-11-10T16:00:00Z', 'scheduled', null),
  ('00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000e3', null, '2026-11-12T23:00:00Z', null, 'scheduled', 'Fine Arts Center'),
  ('00000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-0000000000e4', null, '2026-11-11T12:00:00Z', null, 'scheduled', 'Draft Hall'),
  ('00000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-0000000000e5', null, '2026-11-11T12:00:00Z', null, 'scheduled', 'Private Hall'),
  ('00000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-0000000000e6', null, '2026-11-13T00:00:00Z', null, 'scheduled', 'Concert Hall'),
  -- Cancelled Occurrence: the next time is cancelled, so the feed shows the one after.
  ('00000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-0000000000e7', null, '2026-11-13T12:00:00Z', null, 'cancelled', 'Room A'),
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-0000000000e7', null, '2026-11-20T12:00:00Z', null, 'scheduled', 'Room A'),
  -- Ended Talk: ends exactly at "now", so it is over.
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-0000000000e8', null, '2026-11-10T13:00:00Z', '2026-11-10T15:00:00Z', 'scheduled', 'Old Chapel'),
  ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-0000000000e9', null, '2026-11-14T13:00:00Z', null, 'scheduled', 'Track'),
  ('00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-0000000000ea', null, '2026-11-15T13:00:00Z', null, 'scheduled', 'Stage'),
  ('00000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-0000000000eb', null, '2026-12-20T13:00:00Z', null, 'scheduled', 'Far Hall');

set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated"}';

-- ── Feed ─────────────────────────────────────────────────────────────────────

select results_eq(
  $$ select event_id, occurrence_id
     from public.event_feed_filtered('2026-11-10T15:00:00Z') $$,
  $$ values
       ('00000000-0000-0000-0000-0000000000e2'::uuid, '00000000-0000-0000-0000-000000000004'::uuid),
       ('00000000-0000-0000-0000-0000000000e1'::uuid, '00000000-0000-0000-0000-000000000002'::uuid),
       ('00000000-0000-0000-0000-0000000000e3'::uuid, '00000000-0000-0000-0000-000000000005'::uuid),
       ('00000000-0000-0000-0000-0000000000e9'::uuid, '00000000-0000-0000-0000-000000000012'::uuid),
       ('00000000-0000-0000-0000-0000000000e7'::uuid, '00000000-0000-0000-0000-000000000010'::uuid),
       ('00000000-0000-0000-0000-0000000000eb'::uuid, '00000000-0000-0000-0000-000000000014'::uuid) $$,
  'feed: one row per event at its next available time, sorted by start time; hides draft, private, cancelled, postponed and ended events'
);

select is(
  (select location_name from public.event_feed_filtered('2026-11-10T15:00:00Z')
   where event_id = '00000000-0000-0000-0000-0000000000e2'),
  'Campus Center',
  'feed: falls back to the venue name'
);

select is(
  (select round(latitude::numeric, 4) from public.event_feed_filtered('2026-11-10T15:00:00Z')
   where event_id = '00000000-0000-0000-0000-0000000000e2'),
  42.3896::numeric,
  'feed: falls back to venue coordinates'
);

select is(
  (select organizer_name from public.event_feed_filtered('2026-11-10T15:00:00Z')
   where event_id = '00000000-0000-0000-0000-0000000000e1'),
  'UMass Dance Club',
  'feed: includes the organizer name'
);

select is(
  (select count(*) from public.event_feed_filtered('2026-11-10T15:00:00Z', '2026-12-01T00:00:00Z')),
  5::bigint,
  'feed: the time filter end drops events starting after it'
);

select is(
  (select count(*) from public.event_feed_filtered('2026-11-10T15:00:00Z', '2026-11-10T15:00:00Z')),
  0::bigint,
  'feed: an empty or inverted time range returns nothing'
);

select results_eq(
  $$ select event_id from public.event_feed_filtered('2026-11-10T15:00:00Z', null, array['food-drink']) $$,
  $$ values ('00000000-0000-0000-0000-0000000000e2'::uuid) $$,
  'feed: category filter matches the primary category'
);

select ok(
  '00000000-0000-0000-0000-0000000000e2'::uuid in (
    select event_id from public.event_feed_filtered('2026-11-10T15:00:00Z', null, array['social-community'])),
  'feed: category filter also matches secondary categories'
);

select results_eq(
  $$ select event_id from public.event_feed_filtered('2026-11-10T15:00:00Z', null, array['food-drink', 'arts-culture']) $$,
  $$ values ('00000000-0000-0000-0000-0000000000e2'::uuid),
            ('00000000-0000-0000-0000-0000000000e3'::uuid) $$,
  'feed: several categories match any of them'
);

select results_eq(
  $$ select event_id from public.event_feed_filtered('2026-11-10T15:00:00Z',
       p_organization_ids => array['00000000-0000-0000-0000-0000000000b1'::uuid]) $$,
  $$ values ('00000000-0000-0000-0000-0000000000e1'::uuid) $$,
  'feed: organization filter'
);

select ok(
  '00000000-0000-0000-0000-0000000000e3'::uuid not in (
    select event_id from public.event_feed_filtered('2026-11-10T15:00:00Z', p_is_free => true))
  and (select count(*) from public.event_feed_filtered('2026-11-10T15:00:00Z', p_is_free => true)) = 5,
  'feed: free only hides paid events'
);

select results_eq(
  $$ select event_id from public.event_feed_filtered('2026-11-10T15:00:00Z',
       p_category_slugs => array['social-community', 'arts-culture'],
       p_is_free => true) $$,
  $$ values ('00000000-0000-0000-0000-0000000000e2'::uuid),
            ('00000000-0000-0000-0000-0000000000e1'::uuid),
            ('00000000-0000-0000-0000-0000000000e9'::uuid),
            ('00000000-0000-0000-0000-0000000000e7'::uuid),
            ('00000000-0000-0000-0000-0000000000eb'::uuid) $$,
  'feed: different filters combine with AND'
);

select is(
  (select count(*) from public.event_feed_filtered('2026-11-10T15:00:00Z',
     p_organization_ids => array['00000000-0000-0000-0000-0000000000b1'::uuid],
     p_search => 'pizza')),
  0::bigint,
  'feed: search and organization combine with AND'
);

select is(
  (select count(*) from public.event_feed_filtered('2026-11-10T15:00:00Z',
     p_category_slugs => '{}', p_organization_ids => '{}', p_is_free => null)),
  6::bigint,
  'feed: empty lists and a null free filter are ignored'
);

select results_eq(
  $$ select event_id from public.event_feed_filtered('2026-11-10T15:00:00Z', null, null, '  GALLERY ') $$,
  $$ values ('00000000-0000-0000-0000-0000000000e3'::uuid) $$,
  'feed: search matches the title, ignoring case and surrounding spaces'
);

select results_eq(
  $$ select event_id from public.event_feed_filtered('2026-11-10T15:00:00Z', p_search => 'art students') $$,
  $$ values ('00000000-0000-0000-0000-0000000000e3'::uuid) $$,
  'feed: indexed description search matches stemmed terms in either order'
);

select results_eq(
  $$ select event_id from public.event_feed_filtered('2026-11-10T15:00:00Z', p_is_free => false) $$,
  $$ values ('00000000-0000-0000-0000-0000000000e3'::uuid) $$,
  'feed: paid filter returns paid events only'
);

select is(
  (select count(*) from public.event_feed('2026-11-10T15:00:00Z', p_category_slug => 'food-drink')),
  1::bigint,
  'legacy feed RPC continues to serve installed clients'
);

select results_eq(
  $$ select event_id from public.event_feed_filtered('2026-11-10T15:00:00Z', null, null, 'campus center') $$,
  $$ values ('00000000-0000-0000-0000-0000000000e2'::uuid) $$,
  'feed: search matches the location, including the venue name'
);

select results_eq(
  $$ select event_id from public.event_feed_filtered('2026-11-10T15:00:00Z', null, null, 'dance club') $$,
  $$ values ('00000000-0000-0000-0000-0000000000e1'::uuid) $$,
  'feed: search matches the organizer'
);

select results_eq(
  $$ select event_id from public.event_feed_filtered('2026-11-10T15:00:00Z', null, null, '%') $$,
  $$ values ('00000000-0000-0000-0000-0000000000e9'::uuid) $$,
  'feed: % in a search is matched literally, not as a wildcard'
);

select is(
  (select count(*) from public.event_feed_filtered('2026-11-10T15:00:00Z', null, array['   '], '   ')),
  6::bigint,
  'feed: blank category and search are ignored'
);

-- Pagination: two pages of two, then a third page, no repeats.
select results_eq(
  $$ select event_id from public.event_feed_filtered('2026-11-10T15:00:00Z', p_limit => 2) $$,
  $$ values ('00000000-0000-0000-0000-0000000000e2'::uuid),
            ('00000000-0000-0000-0000-0000000000e1'::uuid) $$,
  'feed: first page respects the limit'
);

select results_eq(
  $$ select event_id from public.event_feed_filtered('2026-11-10T15:00:00Z',
       p_after_starts_at => '2026-11-11T17:00:00Z',
       p_after_event_id  => '00000000-0000-0000-0000-0000000000e1',
       p_limit => 2) $$,
  $$ values ('00000000-0000-0000-0000-0000000000e3'::uuid),
            ('00000000-0000-0000-0000-0000000000e9'::uuid) $$,
  'feed: the cursor returns the rows after the last one received'
);

select is(
  (select count(*) from public.event_feed_filtered('2026-11-10T15:00:00Z',
     p_after_starts_at => '2026-11-11T17:00:00Z')),
  0::bigint,
  'feed: a cursor with only one of its two values returns nothing'
);

select is(
  (select count(*) from public.event_feed_filtered('2026-11-10T15:00:00Z', p_limit => 0)),
  1::bigint,
  'feed: the limit is at least 1'
);

-- ── Organization choices ─────────────────────────────────────────────────────

select results_eq(
  $$ select organization_id, name from public.event_feed_organizations('2026-11-10T15:00:00Z') $$,
  $$ values ('00000000-0000-0000-0000-0000000000b2'::uuid, 'Amherst Run Club'::text),
            ('00000000-0000-0000-0000-0000000000b1'::uuid, 'UMass Dance Club'::text) $$,
  'organizations: only ones with an available upcoming event, sorted by name; skips ended, private and event-less ones'
);

-- ── Details ──────────────────────────────────────────────────────────────────

select results_eq(
  $$ select title, description, is_free, source_url, category_slug, status
     from public.event_details('00000000-0000-0000-0000-0000000000e3', '2026-11-10T15:00:00Z') $$,
  $$ values ('Gallery Opening'::text, 'Student art'::text, false,
             'https://events.umass.edu/event/gallery-opening'::text, 'arts-culture'::text, 'published'::text) $$,
  'details: returns the event fields the screen shows, including the official link'
);

select results_eq(
  $$ select organizer_name, organizer_url
     from public.event_details('00000000-0000-0000-0000-0000000000e1', '2026-11-10T15:00:00Z') $$,
  $$ values ('UMass Dance Club'::text, 'https://dance.umass.edu'::text) $$,
  'details: includes the organizer'
);

select is(
  (select jsonb_path_query_array(occurrences, '$[*].id')
   from public.event_details('00000000-0000-0000-0000-0000000000e1', '2026-11-10T15:00:00Z')),
  '["00000000-0000-0000-0000-000000000002", "00000000-0000-0000-0000-000000000003"]'::jsonb,
  'details: lists upcoming times in order and leaves out past ones'
);

select is(
  (select occurrences -> 0 ->> 'address'
   from public.event_details('00000000-0000-0000-0000-0000000000e2', '2026-11-10T15:00:00Z')),
  '1 Campus Center Way, Amherst, MA 01003',
  'details: builds the venue address'
);

select is(
  (select occurrences -> 0 ->> 'location_name'
   from public.event_details('00000000-0000-0000-0000-0000000000e2', '2026-11-10T15:00:00Z')),
  'Campus Center',
  'details: falls back to the venue name for the location'
);

select is(
  (select status
   from public.event_details('00000000-0000-0000-0000-0000000000e6', '2026-11-10T15:00:00Z')),
  'cancelled',
  'details: a cancelled event is still returned, marked cancelled'
);

select is(
  (select jsonb_path_query_array(occurrences, '$[*].status')
   from public.event_details('00000000-0000-0000-0000-0000000000e7', '2026-11-10T15:00:00Z')),
  '["cancelled", "scheduled"]'::jsonb,
  'details: a cancelled time is still listed with its status'
);

select is(
  (select jsonb_path_query_array(occurrences, '$[*].id')
   from public.event_details('00000000-0000-0000-0000-0000000000e8', '2026-11-10T15:00:00Z')),
  '["00000000-0000-0000-0000-000000000011"]'::jsonb,
  'details: with no upcoming times, returns the most recent past one'
);

select is(
  (select count(*) from public.event_details('00000000-0000-0000-0000-0000000000e4', '2026-11-10T15:00:00Z')),
  0::bigint,
  'details: draft events are hidden'
);

select is(
  (select count(*) from public.event_details('00000000-0000-0000-0000-0000000000e5', '2026-11-10T15:00:00Z')),
  0::bigint,
  'details: private events are hidden'
);

select is(
  (select count(*) from public.event_details('00000000-0000-0000-0000-0000000000ff', '2026-11-10T15:00:00Z')),
  0::bigint,
  'details: an unknown ID returns nothing'
);

-- ── Access ───────────────────────────────────────────────────────────────────

reset role;

select is(
  (select count(*) from pg_proc where proname = 'event_feed_filtered' and pronamespace = 'public'::regnamespace),
  1::bigint,
  'only one event_feed exists (the old signature was dropped)'
);

set local role anon;

select throws_ok(
  $$ select * from public.event_feed_filtered(now()) $$,
  '42501',
  null,
  'anonymous users cannot call the feed'
);

select throws_ok(
  $$ select * from public.event_feed_organizations() $$,
  '42501',
  null,
  'anonymous users cannot list organization choices'
);

select throws_ok(
  $$ select * from public.event_details('00000000-0000-0000-0000-0000000000e1') $$,
  '42501',
  null,
  'anonymous users cannot call event details'
);

select * from finish();
rollback;
