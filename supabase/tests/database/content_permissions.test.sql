begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select no_plan();

truncate
  public.listing_submissions,
  public.content_reviewer_memberships,
  public.business_memberships,
  public.businesses,
  public.categories,
  public.profiles
cascade;

create function pg_temp.statement_denied(statement text)
returns boolean
language plpgsql
as $$
begin
  execute statement;
  return false;
exception
  when insufficient_privilege then
    return true;
end;
$$;

create function pg_temp.statement_rejected(statement text)
returns boolean
language plpgsql
as $$
begin
  execute statement;
  return false;
exception
  when others then
    return true;
end;
$$;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '41000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'reviewer@example.test',
    crypt('test-password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '41000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'ordinary@example.test',
    crypt('test-password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '41000000-0000-4000-8000-000000000003',
    'authenticated', 'authenticated', 'business-member@example.test',
    crypt('test-password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '41000000-0000-4000-8000-000000000004',
    'authenticated', 'authenticated', 'inactive-reviewer@example.test',
    crypt('test-password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  );

insert into public.profiles (id, display_name, role)
values
  ('41000000-0000-4000-8000-000000000001', 'BUILD Reviewer', 'student'),
  ('41000000-0000-4000-8000-000000000002', 'Ordinary User', 'student'),
  ('41000000-0000-4000-8000-000000000003', 'Business Member', 'local_resident'),
  ('41000000-0000-4000-8000-000000000004', 'Inactive Reviewer', 'student');

insert into public.categories (id, name, slug)
values ('42000000-0000-4000-8000-000000000001', 'Food & Drink', 'food-drink');

insert into public.businesses (id, name, contact_email)
values (
  '43000000-0000-4000-8000-000000000001',
  'Example Business',
  'owner@example.test'
);

insert into public.business_memberships (business_id, profile_id, role)
values (
  '43000000-0000-4000-8000-000000000001',
  '41000000-0000-4000-8000-000000000003',
  'manager'
);

insert into public.content_reviewer_memberships (profile_id, role, active)
values
  ('41000000-0000-4000-8000-000000000001', 'reviewer', true),
  ('41000000-0000-4000-8000-000000000004', 'reviewer', false);

select ok(
  has_function_privilege(
    'service_role',
    'public.create_listing_submission(uuid,text,text,text,uuid,text,text,timestamptz,timestamptz,boolean,timestamptz,timestamptz,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.create_listing_submission(uuid,text,text,text,uuid,text,text,timestamptz,timestamptz,boolean,timestamptz,timestamptz,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.create_listing_submission(uuid,text,text,text,uuid,text,text,timestamptz,timestamptz,boolean,timestamptz,timestamptz,text,text)',
    'EXECUTE'
  ),
  'only the protected server-side gateway can create submissions'
);

select ok(
  not has_table_privilege('authenticated', 'public.listing_submissions', 'INSERT')
  and not has_table_privilege('authenticated', 'public.listing_submissions', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.listing_submissions', 'DELETE')
  and not has_table_privilege('authenticated', 'public.content_reviewer_memberships', 'INSERT')
  and not has_table_privilege('authenticated', 'public.content_reviewer_memberships', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.content_reviewer_memberships', 'DELETE'),
  'mobile users cannot write submissions or assign reviewer privileges'
);

create temporary table submission_ids (
  listing_type text primary key,
  submission_id uuid not null
);
grant select on submission_ids to authenticated;
grant select, insert on submission_ids to service_role;

set local role service_role;

insert into submission_ids values
  (
    'event',
    public.create_listing_submission(
      '43000000-0000-4000-8000-000000000001',
      'event',
      'Business tasting event',
      'A clearly fake event for permission testing.',
      '42000000-0000-4000-8000-000000000001',
      'Example Business, Amherst',
      'https://example.test/events/tasting',
      now() + interval '2 days',
      now() + interval '2 days 2 hours'
    )
  ),
  (
    'deal',
    public.create_listing_submission(
      '43000000-0000-4000-8000-000000000001',
      'deal',
      'Example discount',
      'A clearly fake deal for permission testing.',
      '42000000-0000-4000-8000-000000000001',
      'Example Business, Amherst',
      'https://example.test/deals/discount',
      null,
      null,
      false,
      now(),
      now() + interval '30 days',
      'Ten percent off one example item.',
      'Student ID requested by the business.'
    )
  );

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '41000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (select count(*) from public.listing_submissions),
  0::bigint,
  'reviewer cannot read a submission before email confirmation'
);
select is(
  (select count(*) from public.businesses),
  0::bigint,
  'reviewer cannot read business contact data before email confirmation'
);
select ok(
  pg_temp.statement_rejected(format(
    'select public.review_listing_submission(%L, %L)',
    (select submission_id from submission_ids where listing_type = 'event'),
    'publish'
  )),
  'reviewer cannot approve a submission before email confirmation'
);
reset role;

set local role service_role;
select public.confirm_listing_submission(submission_id)
from submission_ids;
reset role;

select is(
  (select count(*) from public.listing_submissions where status = 'pending_review'),
  2::bigint,
  'confirmed event and deal submissions enter the private review queue'
);

set local role anon;
select ok(
  pg_temp.statement_denied('select * from public.listing_submissions')
  and pg_temp.statement_denied('select * from public.businesses'),
  'anonymous users cannot read private business or submission data'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '41000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is((select count(*) from public.businesses), 0::bigint, 'ordinary user cannot read businesses');
select is((select count(*) from public.listing_submissions), 0::bigint, 'ordinary user cannot read submissions');
select is((select count(*) from public.content_reviewer_memberships), 0::bigint, 'ordinary user cannot read reviewer assignments');
select ok(
  pg_temp.statement_denied($sql$
    insert into public.content_reviewer_memberships (profile_id)
    values ('41000000-0000-4000-8000-000000000002')
  $sql$),
  'ordinary user cannot grant reviewer privileges'
);
select ok(
  pg_temp.statement_denied($sql$
    select public.review_listing_submission(
      (select id from public.listing_submissions limit 1),
      'publish'
    )
  $sql$),
  'ordinary user cannot invoke reviewer decisions'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '41000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is((select count(*) from public.businesses), 1::bigint, 'business member can read only their business');
select is((select count(*) from public.business_memberships), 1::bigint, 'business member can read only their membership');
select is((select count(*) from public.listing_submissions), 0::bigint, 'beta business membership does not expose the review queue');
select ok(
  pg_temp.statement_denied($sql$
    insert into public.listing_submissions (
      business_id, listing_type, title, description, category_id,
      location_name, starts_at
    ) values (
      '43000000-0000-4000-8000-000000000001', 'event', 'Blocked',
      'Blocked direct client submission',
      '42000000-0000-4000-8000-000000000001', 'Blocked', now() + interval '1 day'
    )
  $sql$),
  'business members cannot bypass the protected form gateway'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '41000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is((select count(*) from public.businesses), 1::bigint, 'active reviewer can read business details');
select is((select count(*) from public.listing_submissions), 2::bigint, 'active reviewer can read the review queue');
select is((select count(*) from public.content_reviewer_memberships), 1::bigint, 'reviewer can read only their own assignment');
select is((select count(*) from public.business_memberships), 0::bigint, 'reviewer cannot read private business membership records');
select ok(
  pg_temp.statement_denied($sql$
    update public.listing_submissions set status = 'published'
  $sql$),
  'reviewer cannot bypass controlled transition functions with direct updates'
);
select ok(
  pg_temp.statement_denied($sql$
    update public.listing_submissions
    set title = 'Reviewer-edited title', description = 'Reviewer-edited content'
  $sql$),
  'reviewer cannot edit submitted business content'
);
select ok(
  pg_temp.statement_denied($sql$
    insert into public.content_reviewer_memberships (profile_id)
    values ('41000000-0000-4000-8000-000000000002')
  $sql$),
  'reviewer cannot assign another reviewer'
);

select is(
  (
    public.review_listing_submission(
      (select submission_id from submission_ids where listing_type = 'event'),
      'publish'
    )
  ).status,
  'published',
  'reviewer can publish a confirmed event submission'
);

select is(
  (
    public.review_listing_submission(
      (select submission_id from submission_ids where listing_type = 'deal'),
      'reject',
      'The terms need clarification.'
    )
  ).status,
  'rejected',
  'reviewer can reject a confirmed deal submission'
);

select is(
  (
    select rejection_reason
    from public.listing_submissions
    where id = (select submission_id from submission_ids where listing_type = 'deal')
  ),
  'The terms need clarification.',
  'rejection reason is stored for the business notification flow'
);

select ok(
  exists (
    select 1
    from public.listing_submissions
    where id = (select submission_id from submission_ids where listing_type = 'event')
      and reviewed_by = '41000000-0000-4000-8000-000000000001'
      and published_by = '41000000-0000-4000-8000-000000000001'
      and expires_at = ends_at
  ),
  'publication records the reviewer and event expiry'
);

select is(
  (
    public.expire_published_listing(
      (select submission_id from submission_ids where listing_type = 'event')
    )
  ).status,
  'expired',
  'reviewer can remove a published listing from active content'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '41000000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is((select count(*) from public.listing_submissions), 0::bigint, 'inactive reviewer cannot read submissions');
select is((select count(*) from public.businesses), 0::bigint, 'inactive reviewer cannot read business contact data');
select ok(
  pg_temp.statement_denied(format(
    'select public.review_listing_submission(%L, %L)',
    (select submission_id from submission_ids where listing_type = 'deal'),
    'publish'
  )),
  'inactive reviewer cannot approve or reject submissions'
);
reset role;

select ok(
  (select relrowsecurity from pg_class where oid = 'public.businesses'::regclass)
  and (select relrowsecurity from pg_class where oid = 'public.business_memberships'::regclass)
  and (select relrowsecurity from pg_class where oid = 'public.content_reviewer_memberships'::regclass)
  and (select relrowsecurity from pg_class where oid = 'public.listing_submissions'::regclass),
  'RLS is enabled on every content-management table'
);

select * from finish();
rollback;
