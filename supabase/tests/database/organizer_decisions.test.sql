begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

-- Task 1.2: reviewer queue/detail reads and approve/reject decisions.

insert into auth.users (id, email) values
  ('61000000-0000-4000-8000-00000000000a', 'alice@example.test'),   -- applicant, approved
  ('61000000-0000-4000-8000-00000000000b', 'bob@example.test'),     -- applicant, rejected
  ('61000000-0000-4000-8000-00000000000c', 'carol@example.test'),   -- applicant, withdraws
  ('61000000-0000-4000-8000-00000000000d', 'student@example.test'), -- not a reviewer
  ('61000000-0000-4000-8000-0000000000e1', 'rev1@example.test'),    -- reviewer
  ('61000000-0000-4000-8000-0000000000e2', 'rev2@example.test');    -- reviewer
insert into profiles (id, display_name, role)
select id, 'Decision test', 'student' from auth.users where id::text like '61000000-%';
insert into content_reviewer_memberships (profile_id) values
  ('61000000-0000-4000-8000-0000000000e1'),
  ('61000000-0000-4000-8000-0000000000e2');

create function pg_temp.as_user(p_id text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_id, true);
$$;

create function pg_temp.apply(p_name text) returns uuid language sql as $$
  select id from public.submit_organizer_application(
    p_name, 'local_business', 'Owner', 'Owner', 'https://example.test/' || md5(p_name),
    null, 'About us.', true, true, 'weekly', true)
$$;

create function pg_temp.app_id(p_user text) returns uuid language sql as $$
  select id from public.organizer_applications
  where applicant_profile_id = p_user::uuid
  order by created_at desc limit 1
$$;

set local role authenticated;
select pg_temp.as_user('61000000-0000-4000-8000-00000000000a');
select pg_temp.apply('Alice''s Café');
select pg_temp.as_user('61000000-0000-4000-8000-00000000000b');
select pg_temp.apply('Bob''s Bagels');
select pg_temp.as_user('61000000-0000-4000-8000-00000000000c');
select pg_temp.apply('Carol''s Crafts');
reset role;
-- Make the queue order deterministic.
update organizer_applications set created_at = now() - interval '3 hours'
where applicant_profile_id = '61000000-0000-4000-8000-00000000000a';
update organizer_applications set created_at = now() - interval '2 hours'
where applicant_profile_id = '61000000-0000-4000-8000-00000000000b';
set local role authenticated;

-- ── Non-reviewers are blocked ────────────────────────────────────────────────

select pg_temp.as_user('61000000-0000-4000-8000-00000000000d');
select throws_ok($$select * from reviewer_list_organizer_applications()$$, '42501', null,
  'a non-reviewer cannot read the queue');
select throws_ok($$select * from reviewer_get_organizer_application(pg_temp.app_id('61000000-0000-4000-8000-00000000000a'))$$,
  '42501', null, 'a non-reviewer cannot read application detail');
select throws_ok($$select * from approve_organizer_application(pg_temp.app_id('61000000-0000-4000-8000-00000000000a'))$$,
  '42501', null, 'a non-reviewer cannot approve');
select throws_ok($$select * from reject_organizer_application(pg_temp.app_id('61000000-0000-4000-8000-00000000000a'), 'no')$$,
  '42501', null, 'a non-reviewer cannot reject');

select pg_temp.as_user('61000000-0000-4000-8000-00000000000a');
select throws_ok($$select * from approve_organizer_application(pg_temp.app_id('61000000-0000-4000-8000-00000000000a'))$$,
  '42501', null, 'an applicant cannot approve their own application');

reset role;
set local role anon;
select throws_ok($$select * from public.reviewer_list_organizer_applications('pending', 10)$$, '42501', null,
  'signed-out users cannot read the queue');
reset role;
set local role authenticated;

-- ── Reviewer reads ───────────────────────────────────────────────────────────

select pg_temp.as_user('61000000-0000-4000-8000-0000000000e1');
select results_eq(
  $$select organizer_name from reviewer_list_organizer_applications('pending')$$,
  $$values ('Alice''s Café'::text), ('Bob''s Bagels'::text), ('Carol''s Crafts'::text)$$,
  'reviewer sees pending applications, oldest first'
);
select is(
  (select contact_email from reviewer_get_organizer_application(pg_temp.app_id('61000000-0000-4000-8000-00000000000a'))),
  'alice@example.test',
  'reviewer detail includes the private contact email'
);
select throws_ok($$select * from reviewer_get_organizer_application(gen_random_uuid())$$, 'P0002',
  'Application not found.', 'unknown application is reported as not found');
select throws_ok($$select * from reviewer_list_organizer_applications('maybe')$$, '22023', null,
  'unknown status filter is rejected');

-- ── Reject ───────────────────────────────────────────────────────────────────

select throws_ok($$select * from reject_organizer_application(pg_temp.app_id('61000000-0000-4000-8000-00000000000b'), '   ')$$,
  '22023', 'Enter a rejection reason (up to 1,000 characters).', 'a rejection needs a reason');
select results_eq(
  $$select status, rejection_reason from reject_organizer_application(
      pg_temp.app_id('61000000-0000-4000-8000-00000000000b'), '  Add a link to your business page.  ')$$,
  $$values ('rejected'::text, 'Add a link to your business page.'::text)$$,
  'reviewer rejects with a reason'
);
select throws_ok($$select * from approve_organizer_application(pg_temp.app_id('61000000-0000-4000-8000-00000000000b'))$$,
  '55000', null, 'a rejected application cannot then be approved (no double decisions)');

select pg_temp.as_user('61000000-0000-4000-8000-00000000000b');
select results_eq(
  $$select status, rejection_reason from my_organizer_applications$$,
  $$values ('rejected'::text, 'Add a link to your business page.'::text)$$,
  'the applicant sees the rejection reason'
);
select is((select count(*) from my_organizer_access()), 0::bigint,
  'a rejected applicant has no organizer access');

-- ── Approve ──────────────────────────────────────────────────────────────────

select pg_temp.as_user('61000000-0000-4000-8000-0000000000e1');
select throws_ok($$select * from approve_organizer_application(pg_temp.app_id('61000000-0000-4000-8000-00000000000a'), -1)$$,
  '22023', null, 'the weekly cap cannot be negative');
select results_eq(
  $$select status, weekly_cap from approve_organizer_application(pg_temp.app_id('61000000-0000-4000-8000-00000000000a'))$$,
  $$values ('approved'::text, 3)$$,
  'reviewer approves with the default weekly cap of 3'
);
select throws_ok($$select * from approve_organizer_application(pg_temp.app_id('61000000-0000-4000-8000-00000000000a'))$$,
  '55000', null, 'approving twice is blocked');

select pg_temp.as_user('61000000-0000-4000-8000-0000000000e2');
select throws_ok($$select * from reject_organizer_application(pg_temp.app_id('61000000-0000-4000-8000-00000000000a'), 'Changed my mind')$$,
  '55000', null, 'a second reviewer cannot overturn a decision');

reset role;
create temp table alice_org as
  select approved_organizer_id as id from organizer_applications
  where id = pg_temp.app_id('61000000-0000-4000-8000-00000000000a');
grant select on alice_org to authenticated;

select is((select count(*) from organizers where name = 'Alice''s Café'), 1::bigint,
  'approval creates exactly one organizer');
select ok((select approved_at is not null and posting_revoked_at is null from organizers where id = (select id from alice_org)),
  'the organizer is approved and not revoked');
select results_eq(
  $$select role, granted_by, revoked_at from organizer_memberships
    where organizer_id = (select id from alice_org)$$,
  $$values ('manager'::text, '61000000-0000-4000-8000-0000000000e1'::uuid, null::timestamptz)$$,
  'the applicant gets a current membership granted by the reviewer'
);
select is((select profile_id from organizer_memberships where organizer_id = (select id from alice_org)),
  '61000000-0000-4000-8000-00000000000a'::uuid, 'the membership belongs to the applicant');
select is((select contact_email from organization_contacts where organizer_id = (select id from alice_org)),
  'alice@example.test', 'the private contact email is copied from the application');
select results_eq(
  $$select weekly_cap, updated_by from organizer_publishing_settings where organizer_id = (select id from alice_org)$$,
  $$values (3, '61000000-0000-4000-8000-0000000000e1'::uuid)$$,
  'publishing settings are created with the cap'
);
select results_eq(
  $$select status, decided_by from organizer_applications where id = pg_temp.app_id('61000000-0000-4000-8000-00000000000a')$$,
  $$values ('approved'::text, '61000000-0000-4000-8000-0000000000e1'::uuid)$$,
  'the application records who approved it'
);
select ok(exists(
  select 1 from audit_log
  where action = 'application_approved'
    and organizer_application_id = pg_temp.app_id('61000000-0000-4000-8000-00000000000a')
    and actor_profile_id = '61000000-0000-4000-8000-0000000000e1'
    and organizer_id = (select id from alice_org)),
  'approval is in the audit log with the reviewer as actor');
select ok(exists(
  select 1 from audit_log
  where action = 'application_rejected'
    and organizer_application_id = pg_temp.app_id('61000000-0000-4000-8000-00000000000b')),
  'rejection is in the audit log');

-- ── Approval gives posting eligibility ───────────────────────────────────────

set local role authenticated;
select pg_temp.as_user('61000000-0000-4000-8000-00000000000a');
select ok(can_manage_organizer((select id from alice_org)), 'the approved applicant can manage their organizer');
select results_eq(
  $$select organizer_name, can_post, weekly_cap from my_organizer_access()$$,
  $$values ('Alice''s Café'::text, true, 3)$$,
  'my_organizer_access shows the app the user can post, with the cap'
);
select lives_ok(
  $$insert into events (organizer_id, title, primary_category_id)
    select (select a.id from alice_org a), 'Latte art night', c.id from categories c order by c.id limit 1$$,
  'the approved organizer can create a draft event');
select is((select weekly_cap from organizer_publishing_settings), 3,
  'the organizer can read their own cap');

select pg_temp.as_user('61000000-0000-4000-8000-00000000000b');
select ok(not can_manage_organizer((select id from alice_org)), 'another user cannot manage Alice''s organizer');
select throws_ok(
  $$insert into events (organizer_id, title, primary_category_id)
    select (select a.id from alice_org a), 'Hijack', c.id from categories c order by c.id limit 1$$,
  '42501', null, 'another user cannot post for Alice''s organizer');
select is((select count(*) from organizer_publishing_settings), 0::bigint,
  'another user cannot read Alice''s publishing settings');
select throws_ok($$update organizer_publishing_settings set weekly_cap = 50$$, '42501', null,
  'organizers cannot raise their own cap');

-- Bob reapplies after rejection: a new pending record.
select lives_ok($$select pg_temp.apply('Bob''s Bagels')$$, 'a rejected applicant can reapply');

-- ── Withdrawn and self-review ────────────────────────────────────────────────

select pg_temp.as_user('61000000-0000-4000-8000-00000000000c');
select lives_ok($$select * from withdraw_organizer_application(pg_temp.app_id('61000000-0000-4000-8000-00000000000c'))$$,
  'Carol withdraws');
select pg_temp.as_user('61000000-0000-4000-8000-0000000000e1');
select throws_ok($$select * from approve_organizer_application(pg_temp.app_id('61000000-0000-4000-8000-00000000000c'))$$,
  '55000', null, 'a withdrawn application cannot be approved');
select results_eq(
  $$select organizer_name from reviewer_list_organizer_applications('pending')$$,
  $$values ('Bob''s Bagels'::text)$$,
  'the pending queue now holds only Bob''s new application'
);

select lives_ok($$select pg_temp.apply('Reviewer Side Project')$$, 'a reviewer can apply as an organizer');
select throws_ok($$select * from approve_organizer_application(pg_temp.app_id('61000000-0000-4000-8000-0000000000e1'))$$,
  '42501', 'Reviewers cannot approve their own application.', 'reviewers cannot approve themselves');
select pg_temp.as_user('61000000-0000-4000-8000-0000000000e2');
select lives_ok($$select * from approve_organizer_application(pg_temp.app_id('61000000-0000-4000-8000-0000000000e1'), 0)$$,
  'another reviewer can approve it, here with posting paused (cap 0)');

select * from finish();
rollback;
