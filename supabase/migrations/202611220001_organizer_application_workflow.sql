begin;

-- Task 1.1: the applicant side of organizer applications.
--
-- Builds on 202611170001_organizer_permissions (AC-101), which created
-- organizer_applications, its RLS and the server-side email/terms snapshot.
-- This migration adds:
--   * one pending application per account;
--   * my_organizer_applications, the applicant-safe read model;
--   * submit / edit-and-resubmit / withdraw operations that validate fields and
--     only ever touch the caller's own pending record.
-- Applicants never get UPDATE on the table, so reviewer fields (status,
-- decided_by, decided_at, rejection_reason, approved_organizer_id) can only be
-- written by the reviewer decision operations in Task 1.2.

-- One open application at a time. Rejected and withdrawn records stay as
-- history; reapplying after a rejection creates a new record.
create unique index organizer_applications_one_pending_idx
  on public.organizer_applications (applicant_profile_id)
  where status = 'pending';

-- Applications are created only through submit_organizer_application, so every
-- submission gets the same validation. Remove AC-101's direct insert grant.
revoke insert on public.organizer_applications from authenticated;
drop policy application_insert on public.organizer_applications;

-- Proposed answer to the "posting frequency input format" open decision.
-- Kept out of the table constraint so the team can change the list in one place.
create function public.organizer_posting_frequency_values()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['less_than_monthly', 'monthly', 'weekly', 'several_per_week']::text[]
$$;

grant execute on function public.organizer_posting_frequency_values() to authenticated;

-- Applicant-safe read model. Excludes the private contact email and reviewer
-- identity. `security_invoker` keeps the table's RLS and column grants in force.
create view public.my_organizer_applications
with (security_invoker = true) as
select
  a.id,
  a.organizer_name,
  a.organizer_kind,
  a.contact_name,
  a.contact_role,
  a.affiliation_url,
  a.amherst_street_address,
  a.about,
  a.plans_events,
  a.plans_deals,
  a.estimated_posting_frequency,
  a.organizer_terms_accepted_at,
  a.status,
  a.approved_organizer_id,
  a.decided_at,
  a.rejection_reason,
  a.created_at,
  a.updated_at
from public.organizer_applications a
where a.applicant_profile_id = (select auth.uid());

revoke all on public.my_organizer_applications from public, anon;
grant select on public.my_organizer_applications to authenticated;

-- Shared validation for submit and edit. Raises 22023 with the offending
-- field name in HINT so the app can show the message next to the right input.
create function public.validate_organizer_application(
  p_organizer_name text,
  p_organizer_kind text,
  p_contact_name text,
  p_contact_role text,
  p_affiliation_url text,
  p_amherst_street_address text,
  p_about text,
  p_plans_events boolean,
  p_plans_deals boolean,
  p_estimated_posting_frequency text,
  p_accept_terms boolean
)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_organizer_name, ''));
  v_contact_name text := btrim(coalesce(p_contact_name, ''));
  v_contact_role text := btrim(coalesce(p_contact_role, ''));
  v_url text := btrim(coalesce(p_affiliation_url, ''));
  v_address text := btrim(coalesce(p_amherst_street_address, ''));
  v_about text := btrim(coalesce(p_about, ''));
begin
  if length(v_name) not between 1 and 200 then
    raise exception 'Enter an organization name (up to 200 characters).'
      using errcode = '22023', hint = 'organizer_name';
  end if;
  if coalesce(p_organizer_kind, '') not in (
    'individual', 'informal_group', 'local_business', 'student_organization',
    'nonprofit', 'umass_department', 'other'
  ) then
    raise exception 'Choose an organization type.'
      using errcode = '22023', hint = 'organizer_kind';
  end if;
  if length(v_contact_name) not between 1 and 120 then
    raise exception 'Enter a contact name (up to 120 characters).'
      using errcode = '22023', hint = 'contact_name';
  end if;
  if length(v_contact_role) not between 1 and 120 then
    raise exception 'Enter your role in the organization (up to 120 characters).'
      using errcode = '22023', hint = 'contact_role';
  end if;
  if length(v_url) > 2048 or v_url !~ '^https://[^[:space:]/?#]+\.[^[:space:]/?#]+([/?#][^[:space:]]*)?$' then
    raise exception 'Enter a valid https:// link that shows your affiliation.'
      using errcode = '22023', hint = 'affiliation_url';
  end if;
  if length(v_address) > 300 then
    raise exception 'Keep the street address under 300 characters.'
      using errcode = '22023', hint = 'amherst_street_address';
  end if;
  if length(v_about) not between 1 and 500 then
    raise exception 'Tell reviewers about your organization (up to 500 characters).'
      using errcode = '22023', hint = 'about';
  end if;
  -- Plain text only: no control characters other than line breaks and tabs.
  if v_about ~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]' then
    raise exception 'About can only contain plain text.'
      using errcode = '22023', hint = 'about';
  end if;
  if not (coalesce(p_plans_events, false) or coalesce(p_plans_deals, false)) then
    raise exception 'Choose at least one thing you plan to post: events or deals.'
      using errcode = '22023', hint = 'plans';
  end if;
  if coalesce(p_estimated_posting_frequency, '') <> all (public.organizer_posting_frequency_values()) then
    raise exception 'Choose how often you expect to post.'
      using errcode = '22023', hint = 'estimated_posting_frequency';
  end if;
  if p_accept_terms is not true then
    raise exception 'Accept the organizer terms to continue.'
      using errcode = '22023', hint = 'terms';
  end if;
end;
$$;

revoke all on function public.validate_organizer_application(
  text, text, text, text, text, text, text, boolean, boolean, text, boolean
) from public, anon, authenticated;

-- Submit a new application for the signed-in account.
-- The email and terms timestamp are set by the AC-101 trigger, never the client.
create function public.submit_organizer_application(
  p_organizer_name text,
  p_organizer_kind text,
  p_contact_name text,
  p_contact_role text,
  p_affiliation_url text,
  p_amherst_street_address text,
  p_about text,
  p_plans_events boolean,
  p_plans_deals boolean,
  p_estimated_posting_frequency text,
  p_accept_terms boolean
)
returns setof public.my_organizer_applications
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Sign in to apply as an organizer.' using errcode = '42501';
  end if;

  perform public.validate_organizer_application(
    p_organizer_name, p_organizer_kind, p_contact_name, p_contact_role,
    p_affiliation_url, p_amherst_street_address, p_about,
    p_plans_events, p_plans_deals, p_estimated_posting_frequency, p_accept_terms
  );

  -- Serialize submissions per account so double taps can't race.
  perform pg_advisory_xact_lock(hashtextextended('organizer_application:' || v_uid::text, 0));

  if exists (
    select 1 from public.organizer_applications
    where applicant_profile_id = v_uid and status = 'pending'
  ) then
    raise exception 'You already have an application under review. Edit it instead.'
      using errcode = '23505', hint = 'pending_exists';
  end if;
  if exists (
    select 1 from public.organizer_applications
    where applicant_profile_id = v_uid and status = 'approved'
  ) then
    raise exception 'Your organizer application is already approved.'
      using errcode = '23505', hint = 'already_approved';
  end if;

  insert into public.organizer_applications (
    applicant_profile_id, organizer_name, organizer_kind, contact_name,
    contact_role, affiliation_url, amherst_street_address, about,
    plans_events, plans_deals, estimated_posting_frequency,
    organizer_terms_accepted_at
  ) values (
    v_uid,
    btrim(p_organizer_name),
    p_organizer_kind,
    btrim(p_contact_name),
    btrim(p_contact_role),
    btrim(p_affiliation_url),
    nullif(btrim(coalesce(p_amherst_street_address, '')), ''),
    btrim(p_about),
    coalesce(p_plans_events, false),
    coalesce(p_plans_deals, false),
    p_estimated_posting_frequency,
    now()
  )
  returning id into v_id;

  return query
    select * from public.my_organizer_applications where id = v_id;
end;
$$;

-- Edit and resubmit the caller's own PENDING application, in the same record.
-- created_at is kept; updated_at moves; terms must be accepted again.
create function public.update_organizer_application(
  p_application_id uuid,
  p_organizer_name text,
  p_organizer_kind text,
  p_contact_name text,
  p_contact_role text,
  p_affiliation_url text,
  p_amherst_street_address text,
  p_about text,
  p_plans_events boolean,
  p_plans_deals boolean,
  p_estimated_posting_frequency text,
  p_accept_terms boolean
)
returns setof public.my_organizer_applications
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_owner uuid;
  v_status text;
begin
  if v_uid is null then
    raise exception 'Sign in to edit your application.' using errcode = '42501';
  end if;

  -- Lock the row so an edit can't interleave with a reviewer decision.
  select applicant_profile_id, status into v_owner, v_status
  from public.organizer_applications
  where id = p_application_id
  for update;

  -- Someone else's record looks the same as a missing one.
  if v_owner is null or v_owner <> v_uid then
    raise exception 'Application not found.' using errcode = 'P0002';
  end if;
  if v_status <> 'pending' then
    raise exception 'Only an application that is still under review can be edited.'
      using errcode = '55000', hint = v_status;
  end if;

  perform public.validate_organizer_application(
    p_organizer_name, p_organizer_kind, p_contact_name, p_contact_role,
    p_affiliation_url, p_amherst_street_address, p_about,
    p_plans_events, p_plans_deals, p_estimated_posting_frequency, p_accept_terms
  );

  update public.organizer_applications
  set organizer_name = btrim(p_organizer_name),
      organizer_kind = p_organizer_kind,
      contact_name = btrim(p_contact_name),
      contact_role = btrim(p_contact_role),
      affiliation_url = btrim(p_affiliation_url),
      amherst_street_address = nullif(btrim(coalesce(p_amherst_street_address, '')), ''),
      about = btrim(p_about),
      plans_events = coalesce(p_plans_events, false),
      plans_deals = coalesce(p_plans_deals, false),
      estimated_posting_frequency = p_estimated_posting_frequency,
      organizer_terms_accepted_at = now()
  where id = p_application_id;

  return query
    select * from public.my_organizer_applications where id = p_application_id;
end;
$$;

-- Withdraw the caller's own pending application.
create function public.withdraw_organizer_application(p_application_id uuid)
returns setof public.my_organizer_applications
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_owner uuid;
  v_status text;
begin
  if v_uid is null then
    raise exception 'Sign in to withdraw your application.' using errcode = '42501';
  end if;

  select applicant_profile_id, status into v_owner, v_status
  from public.organizer_applications
  where id = p_application_id
  for update;

  if v_owner is null or v_owner <> v_uid then
    raise exception 'Application not found.' using errcode = 'P0002';
  end if;
  if v_status <> 'pending' then
    raise exception 'Only an application that is still under review can be withdrawn.'
      using errcode = '55000', hint = v_status;
  end if;

  update public.organizer_applications
  set status = 'withdrawn'
  where id = p_application_id;

  return query
    select * from public.my_organizer_applications where id = p_application_id;
end;
$$;

revoke all on function public.submit_organizer_application(
  text, text, text, text, text, text, text, boolean, boolean, text, boolean
) from public, anon, authenticated;
grant execute on function public.submit_organizer_application(
  text, text, text, text, text, text, text, boolean, boolean, text, boolean
) to authenticated;

revoke all on function public.update_organizer_application(
  uuid, text, text, text, text, text, text, text, boolean, boolean, text, boolean
) from public, anon, authenticated;
grant execute on function public.update_organizer_application(
  uuid, text, text, text, text, text, text, text, boolean, boolean, text, boolean
) to authenticated;

revoke all on function public.withdraw_organizer_application(uuid)
from public, anon, authenticated;
grant execute on function public.withdraw_organizer_application(uuid) to authenticated;

commit;
