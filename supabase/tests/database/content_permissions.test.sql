begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();
select is((select count(*) from information_schema.columns where table_schema='public'
  and table_name='events' and column_name in ('organization_id','organizer_id')),1::bigint,
  'events have one physical organizer foreign key');
select is((select count(*) from public.organizers where source_type='localist'),
  (select count(*) from public.organizations where source_type='localist'),
  'compatibility view exposes the same imported identities');
select is((select count(*) from public.events e left join public.organizers o on o.id=e.organizer_id
  where e.organizer_id is not null and o.id is null),0::bigint,'existing event attribution preserved');


insert into auth.users(id,email) values
 ('41000000-0000-4000-8000-000000000001','owner@example.test'),
 ('41000000-0000-4000-8000-000000000002','other@example.test'),
 ('41000000-0000-4000-8000-000000000003','reviewer@example.test');
insert into profiles(id,display_name,role)
select id,'Permission test','student' from auth.users where id::text like '41000000-%';
insert into organizers(id,name,approved_at) values
 ('42000000-0000-4000-8000-000000000001','Approved',now()),
 ('42000000-0000-4000-8000-000000000002','Pending',null);
insert into organizer_memberships(organizer_id,profile_id,role) values
 ('42000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001','manager'),
 ('42000000-0000-4000-8000-000000000002','41000000-0000-4000-8000-000000000002','manager');
insert into organization_contacts(organizer_id,contact_email)
values ('42000000-0000-4000-8000-000000000001','fixture@example.test');
insert into content_reviewer_memberships(profile_id)
values ('41000000-0000-4000-8000-000000000003');

-- Applications go through submit_organizer_application (Task 1.1). Direct
-- inserts, including for another applicant, are not allowed.
create function pg_temp.submit(p_id uuid) returns void language plpgsql as $$
begin
  if p_id is distinct from auth.uid() then
    insert into public.organizer_applications(applicant_profile_id,organizer_name,organizer_kind,
      contact_name,contact_role,affiliation_url,about,plans_events,plans_deals,
      estimated_posting_frequency,organizer_terms_accepted_at)
    values (p_id,'Sample','individual','Contact','Host','https://example.test','About',true,false,'weekly',now());
  else
    perform public.submit_organizer_application('Sample','individual','Contact','Host',
      'https://example.test',null,'About',true,false,'weekly',true);
  end if;
end;
$$;

create function pg_temp.draft(p_organizer uuid, p_title text) returns void language sql as $$
insert into public.events(organizer_id,title,primary_category_id)
select p_organizer,p_title,id from public.categories order by id limit 1
$$;

insert into organizer_memberships(organizer_id,profile_id,role)
select id,'41000000-0000-4000-8000-000000000001','manager'
from organizers where source_type='localist' order by id limit 1;

set local role authenticated;
set local request.jwt.claim.sub = '41000000-0000-4000-8000-000000000001';
select lives_ok($$select pg_temp.submit('41000000-0000-4000-8000-000000000001')$$,'applicant submits own application');
select throws_ok($$select pg_temp.submit('41000000-0000-4000-8000-000000000002')$$,'42501',null,'cannot impersonate applicant');
select is((select count(id) from organizer_applications),1::bigint,'applicant reads own application');
select throws_ok($$select contact_email from organizer_applications$$,'42501',null,'raw contact column is private');
select throws_ok($$update organizer_applications set status='approved'$$,'42501',null,'applicants cannot approve themselves');
select is((select count(*) from organizers where source_type='localist'
  and public.can_manage_organizer(id)),0::bigint,'imported organizers never grant editing access');
select lives_ok($$select pg_temp.draft('42000000-0000-4000-8000-000000000001','Owned draft')$$,'approved member creates draft');
select lives_ok($$update events set title='Owned revision' where title='Owned draft'$$,'approved member edits own draft');
select is((select count(*) from events where title='Owned revision'),1::bigint,'own edit persists');
select throws_ok($$update events set status='published' where title='Owned revision'$$,'42501',null,'membership cannot bypass publishing operation');
select is((select count(*) from organization_contacts),0::bigint,'owner cannot read private contacts');
select is((select count(*) from audit_log),0::bigint,'owner cannot read audit');
select throws_ok($$insert into audit_log(action) values ('forged')$$,'42501',null,'client cannot append audit directly');

set local request.jwt.claim.sub = '41000000-0000-4000-8000-000000000002';
select is((select count(id) from organizer_applications),0::bigint,'other applicant cannot read application');
select throws_ok($$select pg_temp.draft('42000000-0000-4000-8000-000000000001','Foreign')$$,'42501',null,'cannot create for another organizer');
select throws_ok($$select pg_temp.draft('42000000-0000-4000-8000-000000000002','Pending')$$,'42501',null,'pending membership cannot create');
select throws_ok($$select remove_organizer_event(gen_random_uuid())$$,'42501',null,'ordinary user cannot take down event');
select throws_ok($$select reviewer_application_contact(gen_random_uuid())$$,'42501',null,'ordinary user cannot look up contact');

reset role;
update events set status='published' where title='Owned revision';
select is((select count(*) from events where title='Owned revision'),1::bigint,'test event seeded as published');
set local role authenticated;
select is((select count(*) from events where title='Owned revision'),1::bigint,'published organizer event visible to student');
update events set title='Foreign edit' where title='Owned revision';
select is((select count(*) from events where title='Owned revision'),1::bigint,'foreign edit changes zero rows');

set local request.jwt.claim.sub = '41000000-0000-4000-8000-000000000003';
select ok(is_content_reviewer(),'reviewer membership recognized');
select throws_ok($$update organizer_applications set status='approved'$$,'42501',null,
  'reviewer must use a trusted decision operation');
select throws_ok($$select remove_organizer_event(id) from events where source_type='localist' limit 1$$,
  'P0002',null,'reviewers cannot take down imported events through organizer moderation');
select is((select count(id) from organizer_applications),1::bigint,'reviewer can read application queue');
select is((select reviewer_application_contact(id) from organizer_applications),'owner@example.test','reviewer reads server-snapshotted email');
select is((select count(*) from organization_contacts),1::bigint,'reviewer reads approved organizer contacts');
select lives_ok($$select remove_organizer_event(id) from events where title='Owned revision'$$,'reviewer can remove organizer event');
select is((select count(*) from events where title='Owned revision'),0::bigint,'removed event no longer readable');
select ok(exists(select 1 from audit_log where action='event_update'),'event changes append audit entries');
select throws_ok($$update audit_log set action='forged'$$,'42501',null,'reviewer cannot edit audit');

reset role;
update events set status='published' where title='Owned revision';
update organizers set posting_revoked_at=now(),posting_revoked_by='41000000-0000-4000-8000-000000000003',
  posting_revocation_reason='Fixture' where id='42000000-0000-4000-8000-000000000001';
set local role authenticated;
set local request.jwt.claim.sub = '41000000-0000-4000-8000-000000000001';
select is((select count(*) from events where title='Owned revision'),0::bigint,'posting revocation hides published events');
select throws_ok($$select pg_temp.draft('42000000-0000-4000-8000-000000000001','Revoked')$$,'42501',null,'revoked organizer cannot create');
select * from finish();
rollback;
