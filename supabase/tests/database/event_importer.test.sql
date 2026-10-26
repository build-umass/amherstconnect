begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

insert into public.categories(id,name,slug) values
 ('90000000-0000-4000-8000-000000000001','Importer category A','importer-test-a'),
 ('90000000-0000-4000-8000-000000000002','Importer category B','importer-test-b');
insert into public.organizations(id,name,slug) values
 ('91000000-0000-4000-8000-000000000001','Importer organization','importer-test-org');
insert into public.venues(id,name) values
 ('92000000-0000-4000-8000-000000000001','Importer venue');

create function pg_temp.draft() returns jsonb language sql as $$
 select '{
 "sourceType":"localist","externalId":"db-import-event","sourceUrl":null,
 "sourceUpdatedAt":"2026-10-26T12:00:00Z","title":"Database import test","description":"Plain text",
 "imageUrl":null,"status":"published","visibility":"public","timezone":"America/New_York",
 "registrationType":"none","registrationUrl":null,"isFree":true,"featuredRank":null,
 "occurrences":[
 {"sourceType":"localist","externalId":"db-import-instance-a","sourceUpdatedAt":"2026-10-26T12:00:00Z",
 "startsAt":"2026-11-01T22:00:00Z","endsAt":"2026-11-01T23:00:00Z","allDay":false,
 "status":"scheduled","locationType":"physical","locationName":"Test venue",
 "coordinates":{"longitude":-72.5267,"latitude":42.3912},"virtualUrl":null,"sourceAttendanceCount":0},
 {"sourceType":"localist","externalId":"db-import-instance-b","sourceUpdatedAt":"2026-10-26T12:00:00Z",
 "startsAt":"2026-11-02T22:00:00Z","endsAt":null,"allDay":false,
 "status":"scheduled","locationType":"physical","locationName":"Test venue",
 "coordinates":null,"virtualUrl":null,"sourceAttendanceCount":null}]}'::jsonb
$$;
create function pg_temp.mapping() returns jsonb language sql as $$
 select '{"organizationId":"91000000-0000-4000-8000-000000000001",
 "categoryIds":["90000000-0000-4000-8000-000000000001","90000000-0000-4000-8000-000000000002"],
 "primaryCategoryId":"90000000-0000-4000-8000-000000000001",
 "venueIds":["92000000-0000-4000-8000-000000000001",null]}'::jsonb
$$;
create function pg_temp.run_import(d jsonb, m jsonb default pg_temp.mapping(), failure jsonb default null)
returns jsonb language plpgsql as $$
declare r uuid; result jsonb;
begin
 insert into public.import_runs(source_type,expected_records) values(d->>'sourceType',1) returning id into r;
 result := public.import_event_record(r,0,d,m,repeat(md5(d::text || m::text),2),failure);
 update public.import_runs set status='completed',finished_at=now() where id=r;
 return result;
end $$;

create temporary table result_store as select pg_temp.run_import(pg_temp.draft()) as result;
select is((select result->>'outcome' from result_store),'created','first import creates event');
select is((select count(*) from public.events where external_id='db-import-event'),1::bigint,'one event');
select is((select count(*) from public.event_occurrences where external_id like 'db-import-instance-%'),2::bigint,'distinct occurrence identities');
select is((select count(*) from public.event_categories where event_id=(select (result->>'eventId')::uuid from result_store)),2::bigint,'category set persisted');
select ok(exists(select 1 from public.events e join public.event_categories c
 on c.event_id=e.id and c.category_id=e.primary_category_id where e.external_id='db-import-event'),'primary category in relationship set');
select is((select organization_id::text from public.events where external_id='db-import-event'),
 '91000000-0000-4000-8000-000000000001','organization mapping');
select is((select venue_id::text from public.event_occurrences where external_id='db-import-instance-a'),
 '92000000-0000-4000-8000-000000000001','venue mapping');
select is((select extensions.st_x(coordinates::extensions.geometry) from public.event_occurrences where external_id='db-import-instance-a'),-72.5267::double precision,'longitude is X');
select is((select extensions.st_y(coordinates::extensions.geometry) from public.event_occurrences where external_id='db-import-instance-a'),42.3912::double precision,'latitude is Y');
create temporary table occurrence_ids as select id,external_id from public.event_occurrences where external_id like 'db-import-instance-%';
select is(pg_temp.run_import(pg_temp.draft())->>'outcome','unchanged','identical reimport is a no-op');
select is((select count(*) from public.event_occurrences o join occurrence_ids old using(id,external_id)),2::bigint,'occurrence IDs preserved');
select is((select count(*) from public.events where external_id='db-import-event'),1::bigint,'no duplicate event');

select is(pg_temp.run_import(jsonb_set(jsonb_set(pg_temp.draft(),'{title}','"Changed title"'),'{sourceUpdatedAt}','"2026-10-27T12:00:00Z"'))->>'outcome','updated','changed content updates');
select is((select title from public.events where external_id='db-import-event'),'Changed title','changed content stored');
select is(pg_temp.run_import(pg_temp.draft())->>'outcome','stale','older event update skipped');
select is(pg_temp.run_import(jsonb_set(pg_temp.draft(),'{sourceUpdatedAt}','null'))->>'outcome','stale','undated input cannot erase reliable timestamp');
select is((select title from public.events where external_id='db-import-event'),'Changed title','stale content not written');
select is(pg_temp.run_import(jsonb_set(jsonb_set(pg_temp.draft(),'{sourceUpdatedAt}','"2026-10-28T12:00:00Z"'),
 '{occurrences,0,sourceUpdatedAt}','"2026-10-25T12:00:00Z"'))->>'outcome','stale','older occurrence prevents whole-record update');

-- Force failure after the event/category write by violating occurrence times.
select is(pg_temp.run_import(jsonb_set(jsonb_set(jsonb_set(jsonb_set(pg_temp.draft(),'{title}','"Must roll back"'),
 '{sourceUpdatedAt}','"2026-10-28T12:00:00Z"'),'{occurrences,0,status}','"cancelled"'),
 '{occurrences,1,startsAt}','"2026-11-01T22:00:00Z"'),
 jsonb_set(pg_temp.mapping(),'{categoryIds}','["90000000-0000-4000-8000-000000000001"]'))->>'outcome',
 'failed','late occurrence collision fails atomically');
select is((select title from public.events where external_id='db-import-event'),'Changed title','event modification rolled back');
select is((select status from public.event_occurrences where external_id='db-import-instance-a'),'scheduled','earlier occurrence update rolled back');
select is((select count(*) from public.event_categories where event_id=(select (result->>'eventId')::uuid from result_store)),2::bigint,'category deletion rolled back');
select is((select count(*) from public.event_occurrences o join occurrence_ids old using(id,external_id)),2::bigint,'related occurrence IDs preserved after failure');
select is((select count(*) from public.event_import_records where outcome='failed'),1::bigint,'failed outcome survives rollback');
select is(pg_temp.run_import(jsonb_set(pg_temp.draft(),'{externalId}','"unresolved-new"'),pg_temp.mapping(),
 '{"outcome":"unresolved","issues":[{"code":"unresolved_mapping"}]}'::jsonb)->>'outcome','unresolved','preflight mapping failure recorded');
select is((select count(*) from public.events where external_id='unresolved-new'),0::bigint,'no partial content on unresolved mapping');
select is(pg_temp.run_import(jsonb_set(pg_temp.draft(),'{externalId}','"invalid-new"'),pg_temp.mapping(),
 '{"outcome":"invalid","issues":[{"code":"invalid_shape"}]}'::jsonb)->>'outcome','invalid','invalid draft outcome recorded');
select is((select count(*) from public.events where external_id='invalid-new'),0::bigint,'invalid draft never persisted');
select is(pg_temp.run_import(jsonb_set(jsonb_set(pg_temp.draft(),'{externalId}','"bad-category"'),'{sourceUpdatedAt}','"2026-10-28T12:00:00Z"'),
 jsonb_set(pg_temp.mapping(),'{primaryCategoryId}','"90000000-0000-4000-8000-000000000099"'))->>'outcome','failed','invalid primary mapping rejected');
select is(pg_temp.run_import(jsonb_set(pg_temp.draft(),'{externalId}','"other-parent"'))->>'outcome','failed','occurrence cannot be moved to another parent');

-- Service role really has the import privileges; clients do not.
select ok(has_function_privilege('service_role','public.import_event_record(uuid,integer,jsonb,jsonb,text,jsonb)','EXECUTE'),'service role can invoke import');
select ok(not has_function_privilege('authenticated','public.import_event_record(uuid,integer,jsonb,jsonb,text,jsonb)','EXECUTE'),'authenticated has no import execution grant');
select ok(not has_function_privilege('anon','public.import_event_record(uuid,integer,jsonb,jsonb,text,jsonb)','EXECUTE'),'anon has no import execution grant');
set local role authenticated;
select throws_ok($q$select public.import_event_record(null,0,'{}','{}',repeat('a',64),null)$q$,
 '42501',null,'authenticated invocation is denied');
select throws_ok($q$insert into public.import_runs(source_type) values('localist')$q$,
 '42501',null,'authenticated cannot create import runs');
reset role;
select ok(not has_table_privilege('authenticated','public.events','INSERT'),'no new event-write privileges for mobile');
select ok(not has_table_privilege('authenticated','public.event_import_records','SELECT'),'import outcomes are not exposed to mobile');
select ok(not has_table_privilege('anon','public.event_import_state','SELECT'),'hash state is not exposed anonymously');
select is(pg_temp.run_import(jsonb_set(jsonb_set(jsonb_set(pg_temp.draft(),'{sourceType}','"campus_pulse"'),
 '{occurrences,0,sourceType}','"campus_pulse"'),'{occurrences,1,sourceType}','"campus_pulse"'))->>'outcome',
 'created','same external IDs in a different provider are distinct identities');
select is((select count(*) from public.events where external_id='db-import-event'),2::bigint,'source scope prevents cross-provider overwrite');
-- Schedule moves must be checked against the final set, not loop order.
create function pg_temp.schedule(a text, b text, reversed boolean default false) returns jsonb language plpgsql as $$
declare d jsonb := pg_temp.draft(); x jsonb; y jsonb;
begin
 d := jsonb_set(d,'{sourceUpdatedAt}','"2026-10-29T12:00:00Z"');
 x := jsonb_set(jsonb_set(d->'occurrences'->0,'{startsAt}',to_jsonb(a)), '{endsAt}','null');
 y := jsonb_set(jsonb_set(d->'occurrences'->1,'{startsAt}',to_jsonb(b)), '{endsAt}','null');
 return jsonb_set(d,'{occurrences}',case when reversed then jsonb_build_array(y,x) else jsonb_build_array(x,y) end);
end $$;
select is(pg_temp.run_import(pg_temp.schedule('2026-11-02T22:00:00Z','2026-11-03T22:00:00Z'))->>'outcome',
 'updated','forward schedule move succeeds in A,B order');
select is(pg_temp.run_import(pg_temp.schedule('2026-11-01T22:00:00Z','2026-11-02T22:00:00Z'))->>'outcome','updated','restore schedule');
select is(pg_temp.run_import(pg_temp.schedule('2026-11-02T22:00:00Z','2026-11-03T22:00:00Z',true))->>'outcome',
 'updated','forward schedule move succeeds in B,A order');
select is(pg_temp.run_import(pg_temp.schedule('2026-11-03T22:00:00Z','2026-11-02T22:00:00Z'))->>'outcome',
 'updated','schedule swap succeeds in A,B order');
select is(pg_temp.run_import(pg_temp.schedule('2026-11-02T22:00:00Z','2026-11-03T22:00:00Z',true))->>'outcome',
 'updated','schedule swap succeeds in B,A order');
select is((select starts_at from public.event_occurrences where external_id='db-import-instance-a' and source_type='localist'),
 '2026-11-02T22:00:00Z'::timestamptz,'A retains its identity at final Tuesday slot');
select is((select starts_at from public.event_occurrences where external_id='db-import-instance-b' and source_type='localist'),
 '2026-11-03T22:00:00Z'::timestamptz,'B retains its identity at final Wednesday slot');
select is((select count(*) from public.event_occurrences o join occurrence_ids old using(id,external_id)),2::bigint,'moves and swaps preserve UUIDs');
create temporary table before_collision as select * from public.event_occurrences where event_id=(select (result->>'eventId')::uuid from result_store);
create temporary table before_event as select * from public.events where external_id='db-import-event' and source_type='localist';
create temporary table before_hash as select * from public.event_import_state where source_type='localist' and external_id='db-import-event';
select is(pg_temp.run_import(jsonb_set(pg_temp.schedule('2026-11-04T22:00:00Z','2026-11-04T22:00:00Z'),'{title}','"Collision rollback"'))->>'outcome',
 'failed','conflicting final schedule rejected in A,B order');
select is(pg_temp.run_import(pg_temp.schedule('2026-11-04T22:00:00Z','2026-11-04T22:00:00Z',true))->>'outcome',
 'failed','conflicting final schedule rejected in B,A order');
select is((select count(*) from ((select * from before_collision except select * from public.event_occurrences)
 union all (select * from public.event_occurrences where event_id=(select id from before_event) except select * from before_collision)) delta),
 0::bigint,'failed schedules roll back every occurrence column');
select is((select to_jsonb(e) from public.events e where id=(select id from before_event)),
 (select to_jsonb(e) from before_event e),'failed schedules roll back every event column');
select is((select to_jsonb(s) from public.event_import_state s where source_type='localist' and external_id='db-import-event'),
 (select to_jsonb(s) from before_hash s),'failed schedule preserves import hash and timestamp');
select is(pg_temp.run_import(jsonb_set(pg_temp.schedule('2026-11-03T22:00:00Z','2026-11-04T22:00:00Z'),
 '{occurrences}', jsonb_build_array(pg_temp.schedule('2026-11-03T22:00:00Z','2026-11-04T22:00:00Z')->'occurrences'->0)),
 jsonb_set(pg_temp.mapping(),'{venueIds}','[null]'))->>'outcome', 'failed','omitted retained occurrence still blocks a conflicting final slot');
select is(pg_temp.run_import(pg_temp.schedule('2026-11-05T22:00:00Z','2026-11-06T22:00:00Z'))->>'outcome',
 'updated','subsequent valid import succeeds after schedule failures');
select * from finish();
rollback;
