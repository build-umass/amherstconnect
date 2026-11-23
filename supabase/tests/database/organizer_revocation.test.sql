begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

-- Task 1.3: revocation with a reason, applicant-visible reasons, audit, and
-- queued emails for reviewer alerts and applicant decisions.

insert into auth.users (id, email) values
  ('81000000-0000-4000-8000-00000000000a', 'alice@example.test'),
  ('81000000-0000-4000-8000-00000000000b', 'bob@example.test'),
  ('81000000-0000-4000-8000-00000000000d', 'student@example.test'),
  ('81000000-0000-4000-8000-0000000000e1', 'rev1@example.test'),
  ('81000000-0000-4000-8000-0000000000e2', 'rev2@example.test');
insert into profiles (id, display_name, role)
select id, 'Revocation test', 'student' from auth.users where id::text like '81000000-%';
insert into content_reviewer_memberships (profile_id) values
  ('81000000-0000-4000-8000-0000000000e1'),
  ('81000000-0000-4000-8000-0000000000e2');

create function pg_temp.as_user(p_id text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_id, true);
$$;
create function pg_temp.apply(p_name text) returns uuid language sql as $$
  select id from public.submit_organizer_application(
    p_name, 'local_business', 'Owner', 'Owner', 'https://example.test/' || md5(p_name),
    null, 'About us.', true, true, 'weekly', true)
$$;

-- ── Emails: a new application alerts every reviewer ─────────────────────────

set local role authenticated;
select pg_temp.as_user('81000000-0000-4000-8000-00000000000a');
create temp table ids as select pg_temp.apply('Alice''s Café') as alice_app;
select pg_temp.as_user('81000000-0000-4000-8000-00000000000b');
alter table ids add column bob_app uuid;
reset role;
grant select, update on ids to authenticated;
set local role authenticated;
update ids set bob_app = pg_temp.apply('Bob''s Bagels');

reset role;
select results_eq(
  $$select recipient_email from email_outbox
    where kind = 'reviewer_new_application' and organizer_application_id = (select alice_app from ids)
    order by recipient_email$$,
  $$values ('rev1@example.test'::text), ('rev2@example.test'::text)$$,
  'a new application queues an alert for each reviewer'
);
select is((select payload ->> 'organizer_name' from email_outbox
           where kind = 'reviewer_new_application' and organizer_application_id = (select alice_app from ids) limit 1),
  'Alice''s Café', 'the alert names the organizer');

-- Editing a pending application does not alert again.
set local role authenticated;
select pg_temp.as_user('81000000-0000-4000-8000-00000000000a');
select lives_ok($$select * from update_organizer_application((select alice_app from ids), 'Alice''s Café', 'local_business',
  'Owner', 'Owner', 'https://example.test/alice', null, 'Updated.', true, true, 'weekly', true)$$, 'Alice edits');
reset role;
select is((select count(*) from email_outbox where organizer_application_id = (select alice_app from ids)), 2::bigint,
  'editing does not queue more reviewer alerts');

-- Nobody in the app can read the outbox.
set local role authenticated;
select pg_temp.as_user('81000000-0000-4000-8000-0000000000e1');
select throws_ok($$select * from email_outbox$$, '42501', null, 'reviewers cannot read the email outbox');
select throws_ok($$select * from claim_email_outbox()$$, '42501', null, 'app users cannot claim emails');

-- ── Decisions queue applicant emails ─────────────────────────────────────────

select lives_ok($$select * from approve_organizer_application((select alice_app from ids))$$, 'approve Alice');
select lives_ok($$select * from reject_organizer_application((select bob_app from ids), 'Add a business link.')$$, 'reject Bob');
reset role;
select results_eq(
  $$select recipient_email, payload ->> 'status' from email_outbox where kind = 'application_approved'$$,
  $$values ('alice@example.test'::text, 'approved'::text)$$,
  'approval queues an email to the applicant'
);
select results_eq(
  $$select recipient_email, payload ->> 'rejection_reason' from email_outbox where kind = 'application_rejected'$$,
  $$values ('bob@example.test'::text, 'Add a business link.'::text)$$,
  'rejection queues an email with the reason'
);

create temp table alice_org as
  select approved_organizer_id as id from organizer_applications where id = (select alice_app from ids);
grant select on alice_org to authenticated;

-- A published event for Alice's organizer, to check it gets hidden.
insert into events (organizer_id, title, primary_category_id, status)
select (select id from alice_org), 'Latte art night', c.id, 'published' from categories c order by c.id limit 1;

-- ── Revocation is reviewer-only and needs a reason ───────────────────────────

set local role authenticated;
select pg_temp.as_user('81000000-0000-4000-8000-00000000000d');
select throws_ok($$select * from revoke_organizer((select id from alice_org), 'spam')$$, '42501', null,
  'a non-reviewer cannot revoke');
select pg_temp.as_user('81000000-0000-4000-8000-00000000000a');
select throws_ok($$select * from revoke_organizer((select id from alice_org), 'spam')$$, '42501', null,
  'an organizer cannot revoke (or un-revoke) themselves');
select throws_ok($$update organizers set posting_revoked_at = null$$, '42501', null,
  'an organizer cannot edit revocation fields directly');

select is((select count(*) from events where title = 'Latte art night'), 1::bigint,
  'before revocation, the organizer''s event is visible');

select pg_temp.as_user('81000000-0000-4000-8000-0000000000e1');
select throws_ok($$select * from revoke_organizer((select id from alice_org), '   ')$$, '22023',
  'Enter a revocation reason (up to 1,000 characters).', 'revocation requires a reason');
select throws_ok($$select * from revoke_organizer(gen_random_uuid(), 'reason')$$, 'P0002', null,
  'unknown organizer is reported as not found');
select results_eq(
  $$select posting_revocation_reason from revoke_organizer((select id from alice_org), '  Repeated spam listings.  ')$$,
  $$values ('Repeated spam listings.'::text)$$,
  'reviewer revokes with a reason'
);
select throws_ok($$select * from revoke_organizer((select id from alice_org), 'again')$$, '55000', null,
  'revoking twice is blocked');

-- ── Effects of revocation ────────────────────────────────────────────────────

reset role;
select results_eq(
  $$select posting_revoked_by, posting_revocation_reason from organizers where id = (select id from alice_org)$$,
  $$values ('81000000-0000-4000-8000-0000000000e1'::uuid, 'Repeated spam listings.'::text)$$,
  'revocation records who revoked and why'
);
select is((select status from organizer_applications where id = (select alice_app from ids)), 'revoked',
  'the applicant''s application shows as revoked');

set local role authenticated;
select pg_temp.as_user('81000000-0000-4000-8000-00000000000a');
select ok(not can_manage_organizer((select id from alice_org)), 'a revoked organizer cannot manage listings');
select results_eq(
  $$select can_post, posting_revocation_reason from my_organizer_access()$$,
  $$values (false, 'Repeated spam listings.'::text)$$,
  'the app sees posting is off, with the reason'
);
select results_eq(
  $$select status, revocation_reason from my_organizer_applications where id = (select alice_app from ids)$$,
  $$values ('revoked'::text, 'Repeated spam listings.'::text)$$,
  'the applicant sees the revocation reason'
);
select throws_ok(
  $$insert into events (organizer_id, title, primary_category_id)
    select (select a.id from alice_org a), 'New after revoke', c.id from categories c order by c.id limit 1$$,
  '42501', null, 'a revoked organizer cannot create listings');
update events set title = 'Edited after revoke' where title = 'Latte art night';
reset role;
select is((select count(*) from events where title = 'Latte art night'), 1::bigint,
  'a revoked organizer''s edit changes nothing');

set local role authenticated;
select pg_temp.as_user('81000000-0000-4000-8000-00000000000d');
select is((select count(*) from events where title = 'Latte art night'), 0::bigint,
  'students no longer see the revoked organizer''s listings');

select pg_temp.as_user('81000000-0000-4000-8000-00000000000b');
select is((select revocation_reason from my_organizer_applications), null,
  'other applicants never see someone else''s revocation reason');

-- ── Audit ────────────────────────────────────────────────────────────────────

select pg_temp.as_user('81000000-0000-4000-8000-0000000000e2');
select ok(exists(
  select 1 from reviewer_list_audit_log((select id from alice_org))
  where action = 'organizer_revoked' and actor_profile_id = '81000000-0000-4000-8000-0000000000e1'),
  'the revocation is audited with the reviewer as actor');
select is((select details ->> 'reason' from reviewer_list_audit_log((select id from alice_org))
           where action = 'organizer_revocation_reason'),
  'Repeated spam listings.', 'the audit keeps the reason');
select ok(exists(
  select 1 from reviewer_list_audit_log(p_application_id => (select alice_app from ids))
  where action = 'application_revoked'),
  'the application''s change to revoked is audited');
select ok(not exists(
  select 1 from reviewer_list_audit_log() where details::text like '%@%'),
  'audit details never contain email addresses');
select throws_ok($$delete from audit_log$$, '42501', null, 'audit entries cannot be deleted');

select pg_temp.as_user('81000000-0000-4000-8000-00000000000d');
select throws_ok($$select * from reviewer_list_audit_log()$$, '42501', null,
  'non-reviewers cannot read the audit log');

-- ── Revocation email and the sender's claim/finish cycle ─────────────────────

reset role;
select results_eq(
  $$select recipient_email, payload ->> 'revocation_reason' from email_outbox where kind = 'organizer_revoked'$$,
  $$values ('alice@example.test'::text, 'Repeated spam listings.'::text)$$,
  'revocation queues an email to the organizer''s private contact'
);

set local role service_role;
create temp table batch1 as select * from claim_email_outbox(100);
select is((select count(*) from batch1), 7::bigint,
  'the sender claims every queued email (4 reviewer alerts, 2 decisions, 1 revocation)');
select is((select count(*) from claim_email_outbox(100)), 0::bigint,
  'a second sender gets nothing while the first holds the claim');

select ok(finish_email_outbox((select id from batch1 where kind = 'application_approved'),
                              (select claim_token from batch1 limit 1)),
  'a sent email is marked done');
select ok(not finish_email_outbox((select id from batch1 where kind = 'application_approved'),
                                  (select claim_token from batch1 limit 1)),
  'finishing it again does nothing (no duplicate send)');
select ok(finish_email_outbox((select id from batch1 where kind = 'organizer_revoked'),
                              (select claim_token from batch1 limit 1), 'SMTP timeout'),
  'a failed send is recorded');
reset role;
select ok((select sent_at is null and retry_after > now() and last_error = 'SMTP timeout'
           from email_outbox where kind = 'organizer_revoked'),
  'a failed email waits and is retried later');
select ok((select sent_at is not null from email_outbox where kind = 'application_approved'),
  'the sent email stays marked as sent');

select * from finish();
rollback;
