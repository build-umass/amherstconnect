begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(12);

create temporary table reminder_accounts as
select id, row_number() over (order by id) as n from public.profiles order by id limit 2;
grant select on reminder_accounts to authenticated, service_role;
update public.profiles set notify_saved_reminders = true where id = (select id from reminder_accounts where n=1);
insert into auth.sessions (id,user_id,created_at,updated_at)
select '23000000-0000-4000-8000-000000000001',id,now(),now() from reminder_accounts where n=1;
insert into public.push_devices(auth_session_id,profile_id,expo_push_token,platform)
select '23000000-0000-4000-8000-000000000001',id,'ExpoPushToken[test-local-only]','android'
from reminder_accounts where n=1;
insert into public.events(id,title,primary_category_id,status)
values ('23000000-0000-4000-8000-000000000002','Test reminder',(select id from public.categories limit 1),'published');
insert into public.event_occurrences(id,event_id,starts_at,location_type,location_name)
values ('23000000-0000-4000-8000-000000000003','23000000-0000-4000-8000-000000000002',now()+interval '30 minutes','physical','Test venue');
insert into public.bookmarks(profile_id,event_id)
select id,'23000000-0000-4000-8000-000000000002' from reminder_accounts where n=1;

set local role service_role;
select is(public.enqueue_saved_event_reminders(),1,'one reminder created');
select is(public.enqueue_saved_event_reminders(),0,'same account and occurrence are deduplicated');
create temporary table claimed_reminder as select * from public.claim_saved_event_deliveries();
select is((select count(*) from claimed_reminder),1::bigint,'registered session claims one delivery');
select is((select count(*) from public.claim_saved_event_deliveries()),0::bigint,'active claim prevents immediate second attempt');
select ok((select public.is_saved_event_delivery_current(notification_id,auth_session_id,attempt_token,push_token)
  from claimed_reminder),'registered and opted-in claim is current');
reset role;
update public.profiles set notify_saved_reminders = false where id = (select id from reminder_accounts where n=1);
set local role service_role;
select is((select public.is_saved_event_delivery_current(notification_id,auth_session_id,attempt_token,push_token)
  from claimed_reminder),false,'claim becomes stale when reminders are disabled');
reset role;
update public.profiles set notify_saved_reminders = true where id = (select id from reminder_accounts where n=1);
delete from public.push_devices where auth_session_id = '23000000-0000-4000-8000-000000000001';
set local role service_role;
select is((select public.is_saved_event_delivery_current(notification_id,auth_session_id,attempt_token,push_token)
  from claimed_reminder),false,'detaching an installation invalidates its claimed delivery');

set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from reminder_accounts where n=2),true);
select is((select count(*) from public.list_saved_event_notifications()),0::bigint,'another account cannot read the inbox');
select throws_ok('select public.enqueue_saved_event_reminders()','42501',null,'client cannot run worker');
select set_config('request.jwt.claim.sub',(select id::text from reminder_accounts where n=1),true);
select is((select event_id from public.list_saved_event_notifications()),'23000000-0000-4000-8000-000000000002'::uuid,'owner reads the canonical event');
select is((select occurrence_id from public.list_saved_event_notifications()),'23000000-0000-4000-8000-000000000003'::uuid,'owner reads the canonical occurrence');
update public.notification_inbox set read_at=now();
select ok((select read_at is not null from public.list_saved_event_notifications()),'owner marks notification read');
select * from finish();
rollback;
