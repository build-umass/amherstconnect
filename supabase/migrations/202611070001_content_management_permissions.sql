begin;

-- Businesses submit through a server-side form gateway during the beta. The
-- mobile client never receives direct write access to these records.
create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_email text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint businesses_name_not_blank check (length(btrim(name)) between 1 and 200),
  constraint businesses_contact_email_not_blank check (
    length(btrim(contact_email)) between 3 and 320
    and position('@' in contact_email) > 1
  )
);

-- Business logins are not part of the beta. This table records explicit
-- future ownership without granting members content-management writes now.
create table public.business_memberships (
  business_id uuid not null references public.businesses (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (business_id, profile_id),
  constraint business_memberships_role_valid check (role in ('editor', 'manager'))
);

-- Reviewer status is separate from the community role on profiles. Only a
-- trusted backend administrator can grant or revoke this membership.
create table public.content_reviewer_memberships (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  role text not null default 'reviewer',
  active boolean not null default true,
  granted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_reviewer_memberships_role_valid check (
    role = 'reviewer'
  )
);

-- The private review queue stores the submitted form fields. Published
-- events and deals are materialized by E01/R02/R05 after review integration.
create table public.listing_submissions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete restrict,
  listing_type text not null,
  title text not null,
  description text not null,
  category_id uuid not null references public.categories (id) on delete restrict,
  location_name text not null,
  coordinates extensions.geography(Point, 4326),
  official_url text,
  starts_at timestamptz,
  ends_at timestamptz,
  all_day boolean not null default false,
  valid_from timestamptz,
  valid_until timestamptz,
  terms text,
  eligibility_note text,
  status text not null default 'awaiting_confirmation',
  confirmed_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles (id) on delete set null,
  rejection_reason text,
  published_at timestamptz,
  published_by uuid references public.profiles (id) on delete set null,
  expires_at timestamptz,
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint listing_submissions_type_valid check (listing_type in ('event', 'deal')),
  constraint listing_submissions_title_not_blank check (length(btrim(title)) between 1 and 120),
  constraint listing_submissions_description_not_blank check (length(btrim(description)) between 1 and 1000),
  constraint listing_submissions_location_not_blank check (length(btrim(location_name)) between 1 and 300),
  constraint listing_submissions_official_url_https check (
    official_url is null or official_url ~ '^https://[^[:space:]]+$'
  ),
  constraint listing_submissions_event_fields_valid check (
    (
      listing_type = 'event'
      and starts_at is not null
      and (ends_at is null or ends_at > starts_at)
      and valid_from is null
      and valid_until is null
      and terms is null
      and eligibility_note is null
    )
    or (
      listing_type = 'deal'
      and starts_at is null
      and ends_at is null
      and all_day = false
      and valid_from is not null
      and valid_until is not null
      and valid_until > valid_from
      and length(btrim(terms)) between 1 and 1000
    )
  ),
  constraint listing_submissions_status_valid check (
    status in (
      'awaiting_confirmation',
      'pending_review',
      'published',
      'rejected',
      'withdrawn',
      'expired'
    )
  ),
  constraint listing_submissions_review_state_valid check (
    (
      status = 'awaiting_confirmation'
      and confirmed_at is null
      and reviewed_at is null
      and reviewed_by is null
      and rejection_reason is null
      and published_at is null
      and published_by is null
      and withdrawn_at is null
    )
    or (
      status = 'pending_review'
      and confirmed_at is not null
      and reviewed_at is null
      and reviewed_by is null
      and rejection_reason is null
      and published_at is null
      and published_by is null
      and withdrawn_at is null
    )
    or (
      status = 'published'
      and confirmed_at is not null
      and reviewed_at is not null
      and reviewed_by is not null
      and rejection_reason is null
      and published_at is not null
      and published_by is not null
      and expires_at is not null
      and withdrawn_at is null
    )
    or (
      status = 'rejected'
      and confirmed_at is not null
      and reviewed_at is not null
      and reviewed_by is not null
      and length(btrim(rejection_reason)) between 1 and 1000
      and published_at is null
      and published_by is null
      and withdrawn_at is null
    )
    or (
      status = 'withdrawn'
      and withdrawn_at is not null
    )
    or (
      status = 'expired'
      and published_at is not null
      and published_by is not null
      and expires_at is not null
    )
  )
);

create index businesses_name_idx on public.businesses (lower(name));
create index business_memberships_profile_idx
  on public.business_memberships (profile_id, active);
create index listing_submissions_business_idx
  on public.listing_submissions (business_id, created_at desc);
create index listing_submissions_review_queue_idx
  on public.listing_submissions (status, created_at)
  where status in ('awaiting_confirmation', 'pending_review');
create index listing_submissions_expiry_idx
  on public.listing_submissions (expires_at)
  where status = 'published';
create index listing_submissions_coordinates_gix
  on public.listing_submissions using gist (coordinates);

create trigger businesses_set_updated_at
before update on public.businesses
for each row execute function public.set_updated_at();

create trigger business_memberships_set_updated_at
before update on public.business_memberships
for each row execute function public.set_updated_at();

create trigger content_reviewer_memberships_set_updated_at
before update on public.content_reviewer_memberships
for each row execute function public.set_updated_at();

create trigger listing_submissions_set_updated_at
before update on public.listing_submissions
for each row execute function public.set_updated_at();

alter table public.businesses enable row level security;
alter table public.business_memberships enable row level security;
alter table public.content_reviewer_memberships enable row level security;
alter table public.listing_submissions enable row level security;

revoke all on table public.businesses from public, anon, authenticated;
revoke all on table public.business_memberships from public, anon, authenticated;
revoke all on table public.content_reviewer_memberships from public, anon, authenticated;
revoke all on table public.listing_submissions from public, anon, authenticated;

grant select, insert, update, delete on table
  public.businesses,
  public.business_memberships,
  public.content_reviewer_memberships,
  public.listing_submissions
to service_role;

grant select on table public.businesses to authenticated;
grant select on table public.business_memberships to authenticated;
grant select on table public.content_reviewer_memberships to authenticated;
grant select on table public.listing_submissions to authenticated;

create function public.is_content_reviewer()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.content_reviewer_memberships membership
    where membership.profile_id = (select auth.uid())
      and membership.active
  )
$$;

revoke all on function public.is_content_reviewer()
from public, anon, authenticated, service_role;
grant execute on function public.is_content_reviewer() to authenticated;

create policy content_reviewer_memberships_select_own
on public.content_reviewer_memberships
for select
to authenticated
using (profile_id = (select auth.uid()));

create policy business_memberships_select_own
on public.business_memberships
for select
to authenticated
using (profile_id = (select auth.uid()));

create policy businesses_member_or_reviewer_read
on public.businesses
for select
to authenticated
using (
  (
    (select public.is_content_reviewer())
    and exists (
      select 1
      from public.listing_submissions submission
      where submission.business_id = businesses.id
        and submission.confirmed_at is not null
    )
  )
  or exists (
    select 1
    from public.business_memberships membership
    where membership.business_id = businesses.id
      and membership.profile_id = (select auth.uid())
      and membership.active
  )
);

create policy listing_submissions_reviewer_read
on public.listing_submissions
for select
to authenticated
using (
  confirmed_at is not null
  and (select public.is_content_reviewer())
);

-- The form backend calls this function only after its spam and rate checks.
-- It intentionally creates a private, unconfirmed record and cannot publish.
create function public.create_listing_submission(
  p_business_id uuid,
  p_listing_type text,
  p_title text,
  p_description text,
  p_category_id uuid,
  p_location_name text,
  p_official_url text default null,
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null,
  p_all_day boolean default false,
  p_valid_from timestamptz default null,
  p_valid_until timestamptz default null,
  p_terms text default null,
  p_eligibility_note text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  submission_id uuid;
begin
  insert into public.listing_submissions (
    business_id,
    listing_type,
    title,
    description,
    category_id,
    location_name,
    official_url,
    starts_at,
    ends_at,
    all_day,
    valid_from,
    valid_until,
    terms,
    eligibility_note
  )
  values (
    p_business_id,
    p_listing_type,
    p_title,
    p_description,
    p_category_id,
    p_location_name,
    p_official_url,
    p_starts_at,
    p_ends_at,
    p_all_day,
    p_valid_from,
    p_valid_until,
    p_terms,
    p_eligibility_note
  )
  returning id into submission_id;

  return submission_id;
end;
$$;

revoke all on function public.create_listing_submission(
  uuid, text, text, text, uuid, text, text,
  timestamptz, timestamptz, boolean, timestamptz, timestamptz, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.create_listing_submission(
  uuid, text, text, text, uuid, text, text,
  timestamptz, timestamptz, boolean, timestamptz, timestamptz, text, text
) to service_role;

create function public.confirm_listing_submission(p_submission_id uuid)
returns public.listing_submissions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  submission public.listing_submissions%rowtype;
begin
  update public.listing_submissions
  set status = 'pending_review',
      confirmed_at = now()
  where id = p_submission_id
    and status = 'awaiting_confirmation'
  returning * into submission;

  if not found then
    raise exception 'Submission is not awaiting confirmation' using errcode = '22023';
  end if;

  return submission;
end;
$$;

revoke all on function public.confirm_listing_submission(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.confirm_listing_submission(uuid) to service_role;

create function public.withdraw_listing_submission(p_submission_id uuid)
returns public.listing_submissions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  submission public.listing_submissions%rowtype;
begin
  update public.listing_submissions
  set status = 'withdrawn',
      withdrawn_at = now()
  where id = p_submission_id
    and status in ('awaiting_confirmation', 'pending_review', 'published', 'rejected')
  returning * into submission;

  if not found then
    raise exception 'Submission cannot be withdrawn' using errcode = '22023';
  end if;

  return submission;
end;
$$;

revoke all on function public.withdraw_listing_submission(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.withdraw_listing_submission(uuid) to service_role;

-- Approval and publication are one action in the current PRD lifecycle.
create function public.review_listing_submission(
  p_submission_id uuid,
  p_decision text,
  p_rejection_reason text default null
)
returns public.listing_submissions
language plpgsql
security definer
set search_path = ''
as $$
declare
  reviewer_id uuid := (select auth.uid());
  submission public.listing_submissions%rowtype;
  calculated_expiry timestamptz;
begin
  if reviewer_id is null or not public.is_content_reviewer() then
    raise insufficient_privilege using message = 'Active content reviewer membership required';
  end if;

  select * into submission
  from public.listing_submissions
  where id = p_submission_id
  for update;

  if not found or submission.status <> 'pending_review' then
    raise exception 'Submission is not pending review' using errcode = '22023';
  end if;

  if p_decision = 'publish' then
    if p_rejection_reason is not null then
      raise exception 'Published submissions cannot include a rejection reason' using errcode = '22023';
    end if;

    calculated_expiry := case
      when submission.listing_type = 'event'
        then coalesce(submission.ends_at, submission.starts_at)
      else submission.valid_until
    end;

    if calculated_expiry is null or calculated_expiry <= now() then
      raise exception 'Cannot publish an expired submission' using errcode = '22023';
    end if;

    update public.listing_submissions
    set status = 'published',
        reviewed_at = now(),
        reviewed_by = reviewer_id,
        published_at = now(),
        published_by = reviewer_id,
        expires_at = calculated_expiry,
        rejection_reason = null
    where id = p_submission_id
    returning * into submission;
  elsif p_decision = 'reject' then
    if p_rejection_reason is null
       or length(btrim(p_rejection_reason)) not between 1 and 1000 then
      raise exception 'A rejection reason is required' using errcode = '22023';
    end if;

    update public.listing_submissions
    set status = 'rejected',
        reviewed_at = now(),
        reviewed_by = reviewer_id,
        rejection_reason = btrim(p_rejection_reason)
    where id = p_submission_id
    returning * into submission;
  else
    raise exception 'Decision must be publish or reject' using errcode = '22023';
  end if;

  return submission;
end;
$$;

revoke all on function public.review_listing_submission(uuid, text, text)
from public, anon, authenticated, service_role;
grant execute on function public.review_listing_submission(uuid, text, text)
to authenticated;

-- Reviewers may remove a published listing immediately. Scheduled automatic
-- expiry uses the service-only function below.
create function public.expire_published_listing(p_submission_id uuid)
returns public.listing_submissions
language plpgsql
security definer
set search_path = ''
as $$
declare
  submission public.listing_submissions%rowtype;
begin
  if (select auth.uid()) is null or not public.is_content_reviewer() then
    raise insufficient_privilege using message = 'Active content reviewer membership required';
  end if;

  update public.listing_submissions
  set status = 'expired',
      expires_at = least(expires_at, now())
  where id = p_submission_id
    and status = 'published'
  returning * into submission;

  if not found then
    raise exception 'Only a published listing can be expired' using errcode = '22023';
  end if;

  return submission;
end;
$$;

revoke all on function public.expire_published_listing(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.expire_published_listing(uuid) to authenticated;

create function public.expire_listing_submissions()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  expired_count integer;
begin
  update public.listing_submissions
  set status = 'expired'
  where status = 'published'
    and expires_at <= now();

  get diagnostics expired_count = row_count;
  return expired_count;
end;
$$;

revoke all on function public.expire_listing_submissions()
from public, anon, authenticated, service_role;
grant execute on function public.expire_listing_submissions() to service_role;

commit;
