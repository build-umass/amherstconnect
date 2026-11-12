begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(13);

create temporary table actors as
  select id, row_number() over (order by id) as n from public.profiles limit 2;
grant select on actors to authenticated;
insert into public.content_reviewer_memberships (profile_id)
select id from actors where n = 1 on conflict (profile_id) do nothing;

insert into public.organizations(id,name,slug)
values ('22000000-0000-4000-8000-000000000001','Duplicate test','duplicate-test');
insert into public.venues(id,name)
values ('22000000-0000-4000-8000-000000000002','Duplicate test venue');
insert into public.events(id,title,organization_id,primary_category_id,status,source_type,external_id)
values ('22000000-0000-4000-8000-000000000003','Duplicate test listing',
  '22000000-0000-4000-8000-000000000001',(select id from public.categories limit 1),'published','localist','dup-original');
insert into public.event_occurrences(event_id,venue_id,starts_at,source_type,external_id)
values ('22000000-0000-4000-8000-000000000003','22000000-0000-4000-8000-000000000002','2099-01-01','localist','dup-occ-original');
insert into public.events(id,title,organization_id,primary_category_id,status,source_type,external_id)
values ('22000000-0000-4000-8000-000000000004','Duplicate test listing',
  '22000000-0000-4000-8000-000000000001',(select id from public.categories limit 1),'published','localist','dup-later'),
 ('22000000-0000-4000-8000-000000000005','Duplicate test listing',
  '22000000-0000-4000-8000-000000000001',(select id from public.categories limit 1),'published','localist','dup-batch');
insert into public.event_occurrences(event_id,venue_id,starts_at,source_type,external_id)
values ('22000000-0000-4000-8000-000000000004','22000000-0000-4000-8000-000000000002','2099-01-01','localist','dup-occ-later'),
 ('22000000-0000-4000-8000-000000000005','22000000-0000-4000-8000-000000000002','2099-01-01','localist','dup-occ-batch');
select is((select duplicate_review_status from public.events where external_id='dup-batch'),'pending','second event in the same batch is also held');
select is((select duplicate_review_status from public.events where external_id='dup-later'),'pending','later Localist record held');
select is((select duplicate_review_status from public.events where external_id='dup-original'),'clear','existing record remains visible');

set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from actors where n=2),true);
select is((select count(*) from public.events where external_id in ('dup-original','dup-later')),1::bigint,'student sees only original');
select is((select count(*) from public.event_occurrences where external_id='dup-occ-later'),0::bigint,'held occurrence inherits event privacy');
select throws_ok('select * from public.list_held_localist_duplicates()', '42501', null, 'ordinary user cannot see queue');
select throws_ok($$select public.resolve_held_localist_duplicate('22000000-0000-4000-8000-000000000004','release')$$,'42501',null,'ordinary user cannot resolve');
select set_config('request.jwt.claim.sub',(select id::text from actors where n=1),true);
select is((select count(*) from public.list_held_localist_duplicates()
  where held_external_id='dup-later' and other_external_id='dup-original'),1::bigint,'reviewer sees candidate and existing event');
select lives_ok($$select public.resolve_held_localist_duplicate('22000000-0000-4000-8000-000000000004','release')$$,'reviewer can release');
select is((select count(*) from public.events where external_id in ('dup-original','dup-later')),2::bigint,'released event uses its existing identity');
select lives_ok($$select public.resolve_held_localist_duplicate('22000000-0000-4000-8000-000000000005','suppress')$$,'reviewer can suppress');
select is((select count(*) from public.events where external_id='dup-batch'),0::bigint,'suppressed event stays hidden');
select throws_ok($$select public.resolve_held_localist_duplicate('22000000-0000-4000-8000-000000000005','release')$$,'22023',null,'resolved record cannot be decided again');
select * from finish();
rollback;
