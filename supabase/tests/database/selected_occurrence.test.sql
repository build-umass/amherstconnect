begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select no_plan();

truncate
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
  ('00000000-0000-0000-0000-0000000000b1', 'UMass Dance Club', 'umass-dance-club', 'https://dance.umass.edu');

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
  ('00000000-0000-0000-0000-0000000000e5', 'Private Event',        '00000000-0000-0000-0000-0000000000c1', null,                                   'published', 'private', true,  'amherst_connect', null, null, null),
  ('00000000-0000-0000-0000-0000000000e6', 'Cancelled Concert',    '00000000-0000-0000-0000-0000000000c3', null,                                   'cancelled', 'public',  true,  'amherst_connect', null, null, null),
  ('00000000-0000-0000-0000-0000000000e7', 'Cancelled Occurrence', '00000000-0000-0000-0000-0000000000c1', null,                                   'published', 'public',  true,  'amherst_connect', null, null, null),
  ('00000000-0000-0000-0000-0000000000e8', 'Ended Talk',           '00000000-0000-0000-0000-0000000000c1', null,                                   'published', 'public',  true,  'amherst_connect', null, null, null),
  ('00000000-0000-0000-0000-0000000000e9', '100% Fun Run',         '00000000-0000-0000-0000-0000000000c1', null,                                   'published', 'public',  true,  'amherst_connect', null, null, null),
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


insert into public.event_occurrences(id,event_id,starts_at,location_type,location_name,coordinates)
 select ('30000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
 '00000000-0000-0000-0000-0000000000e1',
 '2026-12-01T15:00:00Z'::timestamptz + i*interval '1 day',
 'physical','Selected future hall',extensions.st_setsrid(extensions.st_makepoint(-72.51,42.41),4326)::extensions.geography
 from generate_series(1,21) i;
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated"}';
select is((public.event_detail_occurrence('00000000-0000-0000-0000-0000000000e1','30000000-0000-4000-8000-000000000021')->>'id'),'30000000-0000-4000-8000-000000000021','exact occurrence beyond details window');
select ok(not exists(select 1 from public.event_details('00000000-0000-0000-0000-0000000000e1','2026-11-10T00:00:00Z') d, jsonb_array_elements(d.occurrences) o where o->>'id'='30000000-0000-4000-8000-000000000021'),'fixture really lies beyond twenty-row details window');
select is((public.event_detail_occurrence('00000000-0000-0000-0000-0000000000e1','30000000-0000-4000-8000-000000000021')->>'location_name'),'Selected future hall','selected location retained');
select is((public.event_detail_occurrence('00000000-0000-0000-0000-0000000000e1','30000000-0000-4000-8000-000000000021')->>'latitude')::numeric,42.41::numeric,'selected latitude');
select is(public.event_detail_occurrence('00000000-0000-0000-0000-0000000000e2','30000000-0000-4000-8000-000000000021'),null::jsonb,'wrong parent cannot resolve occurrence');
select is(public.event_detail_occurrence('00000000-0000-0000-0000-0000000000e5','00000000-0000-0000-0000-000000000007'),null::jsonb,'private parent hidden by RLS');
select is(public.event_detail_occurrence('00000000-0000-0000-0000-0000000000e4','00000000-0000-0000-0000-000000000006'),null::jsonb,'draft parent hidden by RLS');
set local role anon;
select throws_ok($$select public.event_detail_occurrence('00000000-0000-0000-0000-0000000000e1','30000000-0000-4000-8000-000000000021')$$,'42501',null,'anonymous denied');
reset role;
select * from finish();
rollback;
