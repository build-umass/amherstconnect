begin;

-- Task 1.2: reviewer decisions and posting access.
--
-- Reviewers (is_content_reviewer(), from R04) read the application queue and
-- detail, then approve or reject a pending application. Each decision runs in
-- one transaction with the application row locked, so two reviewers can't
-- decide the same application twice.
--
-- Approval atomically:
--   1. creates the organizer (approved, not revoked);
--   2. grants the applicant a current membership (posting eligibility);
--   3. copies the private contact email into organization_contacts;
--   4. creates the organizer's publishing settings (weekly cap, 3 by default);
--   5. marks the application approved and links it to the organizer.
-- Rejection stores a reason the applicant can see.

-- Publishing settings: one row per approved organizer. Task 2.2 reads
-- weekly_cap when enforcing the shared weekly publication limit; Task 2.3/5.3
-- add the reviewer operation that changes it. Created here because approval
-- must initialize it.
create table public.organizer_publishing_settings (
  organizer_id uuid primary key references public.organizers (id) on delete cascade,
  weekly_cap integer not null default 3,
  updated_by uuid not null references public.profiles (id),
  updated_at timestamptz not null default now(),
  constraint organizer_publishing_settings_cap_range check (weekly_cap between 0 and 50)
);

create trigger organizer_publishing_settings_set_updated_at
before update on public.organizer_publishing_settings
for each row execute function public.set_updated_at();

alter table public.organizer_publishing_settings enable row level security;
revoke all on public.organizer_publishing_settings from public, anon, authenticated;
grant select, insert, update on public.organizer_publishing_settings to service_role;
grant select on public.organizer_publishing_settings to authenticated;

-- Members can see their own organizer's cap (to show "2 of 3 posts left");
-- reviewers can see all.
create policy organizer_publishing_settings_read on public.organizer_publishing_settings
for select to authenticated
using (
  (select public.is_content_reviewer())
  or exists (
    select 1 from public.organizer_memberships m
    where m.organizer_id = organizer_publishing_settings.organizer_id
      and m.profile_id = (select auth.uid())
      and m.revoked_at is null
  )
);

-- Reviewer read model: everything an application has, including the private
-- contact email. Only reachable through the reviewer functions below.
create function public.reviewer_list_organizer_applications(
  p_status text default 'pending',
  p_limit integer default 100
)
returns table (
  id uuid,
  applicant_profile_id uuid,
  organizer_name text,
  organizer_kind text,
  contact_name text,
  contact_role text,
  contact_email text,
  affiliation_url text,
  amherst_street_address text,
  about text,
  plans_events boolean,
  plans_deals boolean,
  estimated_posting_frequency text,
  organizer_terms_accepted_at timestamptz,
  status text,
  approved_organizer_id uuid,
  decided_by uuid,
  decided_at timestamptz,
  rejection_reason text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_content_reviewer() then
    raise exception 'Reviewer access required.' using errcode = '42501';
  end if;
  if p_status is not null
     and p_status not in ('pending', 'approved', 'rejected', 'withdrawn', 'revoked') then
    raise exception 'Unknown application status.' using errcode = '22023', hint = 'status';
  end if;

  return query
    select a.id, a.applicant_profile_id, a.organizer_name, a.organizer_kind,
           a.contact_name, a.contact_role, a.contact_email, a.affiliation_url,
           a.amherst_street_address, a.about, a.plans_events, a.plans_deals,
           a.estimated_posting_frequency, a.organizer_terms_accepted_at,
           a.status, a.approved_organizer_id, a.decided_by, a.decided_at,
           a.rejection_reason, a.created_at, a.updated_at
    from public.organizer_applications a
    where p_status is null or a.status = p_status
    -- Pending: oldest first (first come, first served). Decided: newest first.
    order by
      case when a.status = 'pending' then a.created_at end asc,
      case when a.status <> 'pending' then coalesce(a.decided_at, a.updated_at) end desc,
      a.id
    limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;

create function public.reviewer_get_organizer_application(p_application_id uuid)
returns table (
  id uuid,
  applicant_profile_id uuid,
  organizer_name text,
  organizer_kind text,
  contact_name text,
  contact_role text,
  contact_email text,
  affiliation_url text,
  amherst_street_address text,
  about text,
  plans_events boolean,
  plans_deals boolean,
  estimated_posting_frequency text,
  organizer_terms_accepted_at timestamptz,
  status text,
  approved_organizer_id uuid,
  decided_by uuid,
  decided_at timestamptz,
  rejection_reason text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_content_reviewer() then
    raise exception 'Reviewer access required.' using errcode = '42501';
  end if;

  return query
    select a.id, a.applicant_profile_id, a.organizer_name, a.organizer_kind,
           a.contact_name, a.contact_role, a.contact_email, a.affiliation_url,
           a.amherst_street_address, a.about, a.plans_events, a.plans_deals,
           a.estimated_posting_frequency, a.organizer_terms_accepted_at,
           a.status, a.approved_organizer_id, a.decided_by, a.decided_at,
           a.rejection_reason, a.created_at, a.updated_at
    from public.organizer_applications a
    where a.id = p_application_id;

  if not found then
    raise exception 'Application not found.' using errcode = 'P0002';
  end if;
end;
$$;

-- Approve a pending application and grant posting access, all or nothing.
create function public.approve_organizer_application(
  p_application_id uuid,
  p_weekly_cap integer default 3
)
returns table (
  application_id uuid,
  organizer_id uuid,
  status text,
  weekly_cap integer,
  decided_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reviewer uuid := (select auth.uid());
  v_app public.organizer_applications%rowtype;
  v_organizer_id uuid;
  v_now timestamptz := now();
begin
  if not public.is_content_reviewer() then
    raise exception 'Reviewer access required.' using errcode = '42501';
  end if;
  if p_weekly_cap is null or p_weekly_cap not between 0 and 50 then
    raise exception 'The weekly cap must be between 0 and 50.'
      using errcode = '22023', hint = 'weekly_cap';
  end if;

  -- Lock first: a second reviewer deciding at the same time waits here, then
  -- sees the application is no longer pending.
  select * into v_app
  from public.organizer_applications a
  where a.id = p_application_id
  for update;

  if not found then
    raise exception 'Application not found.' using errcode = 'P0002';
  end if;
  if v_app.status <> 'pending' then
    raise exception 'This application has already been decided or withdrawn.'
      using errcode = '55000', hint = v_app.status;
  end if;
  if v_app.applicant_profile_id = v_reviewer then
    raise exception 'Reviewers cannot approve their own application.'
      using errcode = '42501', hint = 'self_review';
  end if;

  insert into public.organizers (name, approved_at)
  values (v_app.organizer_name, v_now)
  returning id into v_organizer_id;

  insert into public.organizer_memberships (organizer_id, profile_id, role, granted_by, granted_at)
  values (v_organizer_id, v_app.applicant_profile_id, 'manager', v_reviewer, v_now);

  insert into public.organization_contacts (organizer_id, contact_email, updated_at)
  values (v_organizer_id, v_app.contact_email, v_now);

  insert into public.organizer_publishing_settings (organizer_id, weekly_cap, updated_by, updated_at)
  values (v_organizer_id, p_weekly_cap, v_reviewer, v_now);

  update public.organizer_applications a
  set status = 'approved',
      approved_organizer_id = v_organizer_id,
      decided_by = v_reviewer,
      decided_at = v_now
  where a.id = p_application_id;

  return query select p_application_id, v_organizer_id, 'approved'::text, p_weekly_cap, v_now;
end;
$$;

-- Reject a pending application with a reason the applicant will see.
create function public.reject_organizer_application(
  p_application_id uuid,
  p_reason text
)
returns table (
  application_id uuid,
  status text,
  rejection_reason text,
  decided_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reviewer uuid := (select auth.uid());
  v_reason text := btrim(coalesce(p_reason, ''));
  v_app public.organizer_applications%rowtype;
  v_now timestamptz := now();
begin
  if not public.is_content_reviewer() then
    raise exception 'Reviewer access required.' using errcode = '42501';
  end if;
  if length(v_reason) not between 1 and 1000 then
    raise exception 'Enter a rejection reason (up to 1,000 characters).'
      using errcode = '22023', hint = 'reason';
  end if;

  select * into v_app
  from public.organizer_applications a
  where a.id = p_application_id
  for update;

  if not found then
    raise exception 'Application not found.' using errcode = 'P0002';
  end if;
  if v_app.status <> 'pending' then
    raise exception 'This application has already been decided or withdrawn.'
      using errcode = '55000', hint = v_app.status;
  end if;
  if v_app.applicant_profile_id = v_reviewer then
    raise exception 'Reviewers cannot decide their own application.'
      using errcode = '42501', hint = 'self_review';
  end if;

  update public.organizer_applications a
  set status = 'rejected',
      rejection_reason = v_reason,
      decided_by = v_reviewer,
      decided_at = v_now
  where a.id = p_application_id;

  return query select p_application_id, 'rejected'::text, v_reason, v_now;
end;
$$;

-- For the mobile app (Task 3.2/4.x): is the signed-in user allowed to post,
-- and for which organizer? Uses the same rule as can_manage_organizer().
create function public.my_organizer_access()
returns table (
  organizer_id uuid,
  organizer_name text,
  can_post boolean,
  weekly_cap integer,
  posting_revoked_at timestamptz,
  posting_revocation_reason text
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id,
         o.name,
         (m.revoked_at is null and o.active and o.approved_at is not null
           and o.posting_revoked_at is null) as can_post,
         s.weekly_cap,
         o.posting_revoked_at,
         o.posting_revocation_reason
  from public.organizer_memberships m
  join public.organizers o on o.id = m.organizer_id
  left join public.organizer_publishing_settings s on s.organizer_id = o.id
  where m.profile_id = (select auth.uid())
    and o.approved_at is not null
  order by m.granted_at desc
$$;

revoke all on function public.reviewer_list_organizer_applications(text, integer) from public, anon, authenticated;
grant execute on function public.reviewer_list_organizer_applications(text, integer) to authenticated;
revoke all on function public.reviewer_get_organizer_application(uuid) from public, anon, authenticated;
grant execute on function public.reviewer_get_organizer_application(uuid) to authenticated;
revoke all on function public.approve_organizer_application(uuid, integer) from public, anon, authenticated;
grant execute on function public.approve_organizer_application(uuid, integer) to authenticated;
revoke all on function public.reject_organizer_application(uuid, text) from public, anon, authenticated;
grant execute on function public.reject_organizer_application(uuid, text) to authenticated;
revoke all on function public.my_organizer_access() from public, anon, authenticated;
grant execute on function public.my_organizer_access() to authenticated;

commit;
