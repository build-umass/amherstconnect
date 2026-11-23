begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

-- Task 1.1: applicants submit, read, edit/resubmit and withdraw only their own
-- pending application. Cross-account access and reviewer-field writes fail.

insert into auth.users (id, email) values
  ('51000000-0000-4000-8000-000000000001', 'alice@example.test'),
  ('51000000-0000-4000-8000-000000000002', 'bob@example.test'),
  ('51000000-0000-4000-8000-000000000003', 'reviewer@example.test');
insert into profiles (id, display_name, role)
select id, 'Applicant test', 'student' from auth.users where id::text like '51000000-%';
insert into content_reviewer_memberships (profile_id)
values ('51000000-0000-4000-8000-000000000003');

-- A valid application, with one field overridable for validation tests.
create function pg_temp.apply(
  p_name text default 'Pioneer Valley Book Club',
  p_kind text default 'informal_group',
  p_url text default 'https://instagram.com/pvbookclub',
  p_about text default 'Monthly book discussions downtown.',
  p_events boolean default true,
  p_deals boolean default false,
  p_frequency text default 'monthly',
  p_terms boolean default true
) returns setof public.my_organizer_applications
language sql as $$
  select * from public.submit_organizer_application(
    p_name, p_kind, 'Alice Reader', 'Organizer', p_url, '  ', p_about,
    p_events, p_deals, p_frequency, p_terms)
$$;

create function pg_temp.edit(p_id uuid, p_name text) returns setof public.my_organizer_applications
language sql as $$
  select * from public.update_organizer_application(
    p_id, p_name, 'informal_group', 'Alice Reader', 'Organizer',
    'https://instagram.com/pvbookclub', '100 N Pleasant St', 'Updated about.',
    true, true, 'weekly', true)
$$;

-- ── Signed out ───────────────────────────────────────────────────────────────

set local role anon;
select throws_ok($$select * from pg_temp.apply()$$, '42501', null,
  'signed-out users cannot submit');
select throws_ok($$select * from public.my_organizer_applications$$, '42501', null,
  'signed-out users cannot read applications');

-- ── Alice submits ────────────────────────────────────────────────────────────

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '51000000-0000-4000-8000-000000000001';

select results_eq(
  $$select organizer_name, status, amherst_street_address from pg_temp.apply()$$,
  $$values ('Pioneer Valley Book Club'::text, 'pending'::text, null::text)$$,
  'applicant submits a pending application; a blank address is stored as empty'
);

reset role;
select is(
  (select contact_email from organizer_applications
   where applicant_profile_id = '51000000-0000-4000-8000-000000000001'),
  'alice@example.test',
  'contact email is snapshotted from the account, not the client'
);
select ok(
  (select organizer_terms_accepted_at is not null from organizer_applications
   where applicant_profile_id = '51000000-0000-4000-8000-000000000001'),
  'server records terms acceptance time'
);
set local role authenticated;
set local request.jwt.claim.sub = '51000000-0000-4000-8000-000000000001';

select is((select count(*) from my_organizer_applications), 1::bigint,
  'applicant reads their own application');
select throws_ok($$select contact_email from organizer_applications$$, '42501', null,
  'applicant cannot read the private email column');
select throws_ok($$select * from pg_temp.apply()$$, '23505', null,
  'only one pending application per account');

-- ── Validation ───────────────────────────────────────────────────────────────

select throws_ok($$select * from pg_temp.apply(p_name => '   ')$$, '22023',
  'Enter an organization name (up to 200 characters).', 'name is required');
select throws_ok($$select * from pg_temp.apply(p_kind => 'cult')$$, '22023',
  'Choose an organization type.', 'organization type must be a known value');
select throws_ok($$select * from pg_temp.apply(p_url => 'http://pvbookclub.org')$$, '22023',
  'Enter a valid https:// link that shows your affiliation.', 'affiliation link must be https');
select throws_ok($$select * from pg_temp.apply(p_url => 'https://not a link')$$, '22023',
  'Enter a valid https:// link that shows your affiliation.', 'affiliation link must be a real URL');
select throws_ok($$select * from pg_temp.apply(p_about => repeat('a', 501))$$, '22023',
  'Tell reviewers about your organization (up to 500 characters).', 'about is at most 500 characters');
select throws_ok($$select * from pg_temp.apply(p_about => e'hi\x07there')$$, '22023',
  'About can only contain plain text.', 'about must be plain text');
select throws_ok($$select * from pg_temp.apply(p_events => false, p_deals => false)$$, '22023',
  'Choose at least one thing you plan to post: events or deals.', 'at least one posting plan');
select throws_ok($$select * from pg_temp.apply(p_frequency => 'hourly')$$, '22023',
  'Choose how often you expect to post.', 'posting frequency must be a known value');
select throws_ok($$select * from pg_temp.apply(p_terms => false)$$, '22023',
  'Accept the organizer terms to continue.', 'terms must be accepted');

-- ── Reviewer fields and direct writes are blocked ────────────────────────────

select throws_ok($$update organizer_applications set status = 'approved'$$, '42501', null,
  'applicant cannot approve themselves');
select throws_ok($$update organizer_applications set rejection_reason = 'x', decided_at = now()$$,
  '42501', null, 'applicant cannot write reviewer fields');
select throws_ok(
  $$insert into organizer_applications (applicant_profile_id, organizer_name, organizer_kind,
      contact_name, contact_role, contact_email, affiliation_url, about, plans_events, plans_deals,
      estimated_posting_frequency, organizer_terms_accepted_at, status)
    values ('51000000-0000-4000-8000-000000000001', 'Forged', 'other', 'A', 'B', 'x@example.test',
      'https://example.test', 'About', true, false, 'weekly', now(), 'approved')$$,
  '42501', null, 'applicant cannot insert directly (for example as already approved)');
select throws_ok($$delete from organizer_applications$$, '42501', null,
  'applicant cannot delete applications');

-- ── Edit and resubmit the same record ────────────────────────────────────────

create temp table alice_app as
  select id, created_at, updated_at from my_organizer_applications;
reset role;
-- Make "before" clearly earlier than the edit.
update organizer_applications set updated_at = now() - interval '1 hour'
where applicant_profile_id = '51000000-0000-4000-8000-000000000001';
update alice_app set updated_at = now() - interval '1 hour';
set local role authenticated;
set local request.jwt.claim.sub = '51000000-0000-4000-8000-000000000001';

select results_eq(
  $$select organizer_name, plans_deals, estimated_posting_frequency, amherst_street_address
    from pg_temp.edit((select id from alice_app), 'PV Book Club')$$,
  $$values ('PV Book Club'::text, true, 'weekly'::text, '100 N Pleasant St'::text)$$,
  'applicant edits and resubmits their pending application'
);
select is((select count(*) from my_organizer_applications), 1::bigint,
  'editing keeps the same record (no new application)');
select ok(
  (select a.created_at = b.created_at and a.updated_at > b.updated_at
   from my_organizer_applications a join alice_app b using (id)),
  'edit keeps created_at and moves updated_at'
);
select throws_ok($$select * from pg_temp.edit((select id from alice_app), '')$$, '22023', null,
  'edits are validated too');

-- ── Bob cannot see or touch Alice's application ──────────────────────────────

set local request.jwt.claim.sub = '51000000-0000-4000-8000-000000000002';
select is((select count(*) from my_organizer_applications), 0::bigint,
  'another account sees none of Alice''s applications');
select is((select count(*) from organizer_applications), 0::bigint,
  'another account cannot read Alice''s row from the table either');
select throws_ok($$select * from pg_temp.edit((select id from alice_app), 'Hijacked')$$, 'P0002',
  'Application not found.', 'another account cannot edit Alice''s application');
select throws_ok($$select * from withdraw_organizer_application((select id from alice_app))$$, 'P0002',
  'Application not found.', 'another account cannot withdraw Alice''s application');
select lives_ok($$select * from pg_temp.apply('Bob''s Bagels', 'local_business')$$,
  'Bob can still submit his own application');

-- ── Reviewer ─────────────────────────────────────────────────────────────────

set local request.jwt.claim.sub = '51000000-0000-4000-8000-000000000003';
select is((select count(*) from organizer_applications), 2::bigint,
  'reviewer reads the whole queue');
select is((select count(*) from my_organizer_applications), 0::bigint,
  'the "my applications" view only shows the caller''s own, even for reviewers');
select throws_ok($$update organizer_applications set status = 'approved'$$, '42501', null,
  'reviewers cannot write decisions directly either (Task 1.2 operation only)');
select throws_ok($$select * from pg_temp.edit((select id from alice_app), 'Reviewer edit')$$, 'P0002',
  null, 'reviewers cannot edit an applicant''s submission');

-- ── Withdraw, then apply again ───────────────────────────────────────────────

set local request.jwt.claim.sub = '51000000-0000-4000-8000-000000000001';
select results_eq(
  $$select status from withdraw_organizer_application((select id from alice_app))$$,
  $$values ('withdrawn'::text)$$,
  'applicant withdraws their pending application'
);
select throws_ok($$select * from withdraw_organizer_application((select id from alice_app))$$, '55000',
  null, 'a withdrawn application cannot be withdrawn again');
select throws_ok($$select * from pg_temp.edit((select id from alice_app), 'Too late')$$, '55000',
  null, 'a withdrawn application cannot be edited');
select lives_ok($$select * from pg_temp.apply()$$,
  'after withdrawing, the applicant can submit a new application');
select is((select count(*) from my_organizer_applications), 2::bigint,
  'the withdrawn record stays as history');

reset role;
select ok(
  exists (select 1 from audit_log
          where action = 'application_withdrawn'
            and organizer_application_id = (select id from alice_app)
            and actor_profile_id = '51000000-0000-4000-8000-000000000001'),
  'withdrawal is recorded in the audit log with the applicant as actor'
);

-- ── Rejected and approved records cannot be edited or duplicated ────────────

update organizer_applications
set status = 'rejected', decided_by = '51000000-0000-4000-8000-000000000003',
    decided_at = now(), rejection_reason = 'Add an active affiliation link.'
where applicant_profile_id = '51000000-0000-4000-8000-000000000002';

set local role authenticated;
set local request.jwt.claim.sub = '51000000-0000-4000-8000-000000000002';
select is((select rejection_reason from my_organizer_applications),
  'Add an active affiliation link.', 'applicant sees the rejection reason');
select throws_ok(
  $$select * from update_organizer_application(
      (select id from my_organizer_applications), 'Bob''s Bagels', 'local_business', 'Bob', 'Owner',
      'https://bobsbagels.example', null, 'Bagels.', false, true, 'weekly', true)$$,
  '55000', null, 'a rejected application cannot be edited');
select lives_ok($$select * from pg_temp.apply('Bob''s Bagels', 'local_business')$$,
  'reapplying after rejection creates a new record');
select is((select count(*) from my_organizer_applications), 2::bigint,
  'the rejected record is kept alongside the new one');

select * from finish();
rollback;
