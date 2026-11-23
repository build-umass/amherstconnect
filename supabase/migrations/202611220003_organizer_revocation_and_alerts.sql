begin;

-- Task 1.3: organizer revocation, reasons for applicants, audit, and the
-- email triggers for reviewer alerts and applicant decisions.
--
-- Revocation reuses AC-101's organizers.posting_revoked_* columns. Once they
-- are set, can_manage_organizer() is false (no publishing or editing) and the
-- restrictive organizer_event_visibility policy hides the organizer's events
-- from students. Task 2.3 applies the same rule to deals.
--
-- Emails are not sent from the database. Each change that needs an email adds
-- a row to email_outbox in the same transaction, so an email exists only if
-- the change committed. A sender (Edge Function on a schedule or a database
-- webhook, once SMTP is set up) claims rows, sends them and marks them done.
-- dedupe_key stops the same email being queued twice, and claim tokens stop
-- two senders from sending the same row.

-- ── Revocation ───────────────────────────────────────────────────────────────

create function public.revoke_organizer(p_organizer_id uuid, p_reason text)
returns table (
  organizer_id uuid,
  posting_revoked_at timestamptz,
  posting_revocation_reason text
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_reviewer uuid := (select auth.uid());
  v_reason text := btrim(coalesce(p_reason, ''));
  v_org public.organizers%rowtype;
  v_now timestamptz := now();
begin
  if not public.is_content_reviewer() then
    raise exception 'Reviewer access required.' using errcode = '42501';
  end if;
  if length(v_reason) not between 1 and 1000 then
    raise exception 'Enter a revocation reason (up to 1,000 characters).'
      using errcode = '22023', hint = 'reason';
  end if;

  select * into v_org from public.organizers o where o.id = p_organizer_id for update;
  if not found or v_org.approved_at is null then
    raise exception 'Approved organizer not found.' using errcode = 'P0002';
  end if;
  if v_org.posting_revoked_at is not null then
    raise exception 'This organizer''s posting access is already revoked.'
      using errcode = '55000', hint = 'already_revoked';
  end if;

  -- All three revocation fields are set together (AC-101 check constraint).
  update public.organizers o
  set posting_revoked_at = v_now,
      posting_revoked_by = v_reviewer,
      posting_revocation_reason = v_reason
  where o.id = p_organizer_id;

  -- Show the revocation on the application that created this organizer.
  update public.organizer_applications a
  set status = 'revoked'
  where a.approved_organizer_id = p_organizer_id
    and a.status = 'approved';

  return query select p_organizer_id, v_now, v_reason;
end;
$$;

revoke all on function public.revoke_organizer(uuid, text) from public, anon, authenticated;
grant execute on function public.revoke_organizer(uuid, text) to authenticated;

-- ── Applicant-visible reasons ────────────────────────────────────────────────

-- Add the revocation reason and time to the applicant's read model (new
-- columns go at the end so existing callers keep working).
create or replace view public.my_organizer_applications
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
  a.updated_at,
  o.posting_revoked_at as revoked_at,
  o.posting_revocation_reason as revocation_reason
from public.organizer_applications a
left join public.organizers o on o.id = a.approved_organizer_id
where a.applicant_profile_id = (select auth.uid());

-- ── Audit ────────────────────────────────────────────────────────────────────

-- AC-101's trigger records that a revocation happened. Keep the reason in the
-- audit details too (no private email or secrets).
create function public.record_organizer_revocation_details()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_log (actor_profile_id, action, organizer_id, details)
  values (
    new.posting_revoked_by,
    'organizer_revocation_reason',
    new.id,
    jsonb_build_object('reason', new.posting_revocation_reason)
  );
  return new;
end;
$$;
revoke all on function public.record_organizer_revocation_details() from public, anon, authenticated;

create trigger audit_organizer_revocation_details
after update of posting_revoked_at on public.organizers
for each row
when (new.posting_revoked_at is not null and old.posting_revoked_at is distinct from new.posting_revoked_at)
execute function public.record_organizer_revocation_details();

-- Reviewer audit reads for the portal (Task 5.3). Reviewers can also select
-- audit_log directly; this adds filtering and a stable order.
create function public.reviewer_list_audit_log(
  p_organizer_id uuid default null,
  p_application_id uuid default null,
  p_limit integer default 200
)
returns setof public.audit_log
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
    select * from public.audit_log l
    where (p_organizer_id is null or l.organizer_id = p_organizer_id)
      and (p_application_id is null or l.organizer_application_id = p_application_id)
    order by l.created_at desc, l.id
    limit least(greatest(coalesce(p_limit, 200), 1), 1000);
end;
$$;
revoke all on function public.reviewer_list_audit_log(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.reviewer_list_audit_log(uuid, uuid, integer) to authenticated;

-- ── Email outbox ─────────────────────────────────────────────────────────────

create table public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  recipient_email text not null,
  organizer_application_id uuid references public.organizer_applications (id) on delete set null,
  organizer_id uuid references public.organizers (id) on delete set null,
  -- Template data only: names, statuses and reasons. Never secrets.
  payload jsonb not null default '{}',
  -- One email per (kind, subject, recipient). Retries reuse the same row.
  dedupe_key text not null unique,
  created_at timestamptz not null default now(),
  attempts integer not null default 0,
  claim_token uuid,
  claimed_at timestamptz,
  retry_after timestamptz not null default now(),
  sent_at timestamptz,
  last_error text,
  constraint email_outbox_kind_valid check (kind in (
    'reviewer_new_application',
    'application_approved',
    'application_rejected',
    'organizer_revoked'
  )),
  constraint email_outbox_recipient_valid check (position('@' in recipient_email) > 1)
);

create index email_outbox_pending_idx on public.email_outbox (retry_after)
  where sent_at is null;

alter table public.email_outbox enable row level security;
revoke all on public.email_outbox from public, anon, authenticated;
grant select, insert, update on public.email_outbox to service_role;

-- New application: alert every active reviewer.
create function public.queue_reviewer_application_alert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.email_outbox
    (kind, recipient_email, organizer_application_id, payload, dedupe_key)
  select 'reviewer_new_application',
         u.email,
         new.id,
         jsonb_build_object(
           'organizer_name', new.organizer_name,
           'organizer_kind', new.organizer_kind,
           'submitted_at', new.created_at
         ),
         'reviewer_new_application:' || new.id || ':' || r.profile_id
  from public.content_reviewer_memberships r
  join auth.users u on u.id = r.profile_id
  where r.active
    and u.email is not null
  on conflict (dedupe_key) do nothing;
  return new;
end;
$$;
revoke all on function public.queue_reviewer_application_alert() from public, anon, authenticated;

create trigger email_reviewers_on_new_application
after insert on public.organizer_applications
for each row
when (new.status = 'pending')
execute function public.queue_reviewer_application_alert();

-- Decision: email the applicant (approved, or rejected with the reason).
create function public.queue_application_decision_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.email_outbox
    (kind, recipient_email, organizer_application_id, organizer_id, payload, dedupe_key)
  values (
    'application_' || new.status,
    new.contact_email,
    new.id,
    new.approved_organizer_id,
    jsonb_build_object(
      'organizer_name', new.organizer_name,
      'status', new.status,
      'rejection_reason', new.rejection_reason,
      'decided_at', new.decided_at
    ),
    'application_' || new.status || ':' || new.id
  )
  on conflict (dedupe_key) do nothing;
  return new;
end;
$$;
revoke all on function public.queue_application_decision_email() from public, anon, authenticated;

create trigger email_applicant_on_decision
after update of status on public.organizer_applications
for each row
when (old.status = 'pending' and new.status in ('approved', 'rejected'))
execute function public.queue_application_decision_email();

-- Revocation: email the organizer's approved private contact.
create function public.queue_organizer_revocation_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.email_outbox
    (kind, recipient_email, organizer_id, payload, dedupe_key)
  select 'organizer_revoked',
         c.contact_email,
         new.id,
         jsonb_build_object(
           'organizer_name', new.name,
           'revocation_reason', new.posting_revocation_reason,
           'revoked_at', new.posting_revoked_at
         ),
         'organizer_revoked:' || new.id || ':' || new.posting_revoked_at
  from public.organization_contacts c
  where c.organizer_id = new.id
  on conflict (dedupe_key) do nothing;
  return new;
end;
$$;
revoke all on function public.queue_organizer_revocation_email() from public, anon, authenticated;

create trigger email_organizer_on_revocation
after update of posting_revoked_at on public.organizers
for each row
when (new.posting_revoked_at is not null and old.posting_revoked_at is distinct from new.posting_revoked_at)
execute function public.queue_organizer_revocation_email();

-- Sender side (service role only). Claim a batch: each row goes to one sender.
-- Rows claimed more than 10 minutes ago without finishing are claimable again.
create function public.claim_email_outbox(p_limit integer default 20)
returns table (
  id uuid,
  kind text,
  recipient_email text,
  payload jsonb,
  claim_token uuid,
  attempts integer
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_token uuid := gen_random_uuid();
begin
  return query
    with picked as (
      select e.id
      from public.email_outbox e
      where e.sent_at is null
        and e.attempts < 5
        and e.retry_after <= now()
        and (e.claim_token is null or e.claimed_at < now() - interval '10 minutes')
      order by e.created_at
      limit least(greatest(coalesce(p_limit, 20), 1), 100)
      for update skip locked
    )
    update public.email_outbox e
    set claim_token = v_token,
        claimed_at = now(),
        attempts = e.attempts + 1
    from picked
    where e.id = picked.id
    returning e.id, e.kind, e.recipient_email, e.payload, e.claim_token, e.attempts;
end;
$$;

-- Report the result. Success marks it sent; failure frees it for a retry later
-- (back-off grows with each attempt; gives up after 5 attempts).
create function public.finish_email_outbox(p_id uuid, p_claim_token uuid, p_error text default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.email_outbox e
  set sent_at = case when p_error is null then now() else null end,
      last_error = left(p_error, 1000),
      claim_token = null,
      claimed_at = null,
      retry_after = case when p_error is null then e.retry_after
                         else now() + (interval '1 minute' * power(2, e.attempts)) end
  where e.id = p_id
    and e.claim_token = p_claim_token
    and e.sent_at is null;
  return found;
end;
$$;

revoke all on function public.claim_email_outbox(integer) from public, anon, authenticated;
revoke all on function public.finish_email_outbox(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.claim_email_outbox(integer) to service_role;
grant execute on function public.finish_email_outbox(uuid, uuid, text) to service_role;

commit;
