begin;

-- Keep historical migrations replayable and preserve any existing submissions.
create schema private_r04_archive;
revoke all on schema private_r04_archive from public, anon, authenticated;

drop function public.create_listing_submission(uuid, text, text, text, uuid, text, text,
  timestamptz, timestamptz, boolean, timestamptz, timestamptz, text, text);
drop function public.confirm_listing_submission(uuid);
drop function public.withdraw_listing_submission(uuid);
drop function public.review_listing_submission(uuid, text, text);
drop function public.expire_published_listing(uuid);
drop function public.expire_listing_submissions();

drop policy businesses_member_or_reviewer_read on public.businesses;
drop policy listing_submissions_reviewer_read on public.listing_submissions;
revoke all on public.listing_submissions from public, anon, authenticated, service_role;
alter table public.listing_submissions set schema private_r04_archive;

-- One organizer catalog for both imports and approved app publishers.
alter table public.organizations rename to organizers;
alter table public.organizers add column active boolean not null default true;
insert into public.organizers(id, name, slug, active, created_at, updated_at)
select id, name, 'legacy-' || id::text, active, created_at, updated_at from public.businesses;
alter table public.businesses set schema private_r04_archive;
alter table public.organizers alter column slug set default ('organizer-' || gen_random_uuid()::text);
create view public.organizations with (security_invoker = true) as
select id, name, slug, description, website_url, logo_url, source_type, external_id,
  source_url, source_updated_at, created_at, updated_at from public.organizers;
revoke all on public.organizations from public, anon, authenticated;
grant select on public.organizations to authenticated;
grant select, insert, update, delete on public.organizations to service_role;
-- Preserve the established catalog transport for old seed/importer configurations.
-- This view contains no memberships, approvals, or private contact information.
alter table public.business_memberships rename to organizer_memberships;
alter table public.organizer_memberships rename column business_id to organizer_id;
alter table public.organizer_memberships drop constraint business_memberships_business_id_fkey;
alter table public.organizer_memberships add foreign key (organizer_id) references public.organizers(id) on delete cascade;
alter table public.organizer_memberships add column granted_by uuid references public.profiles(id);
alter table public.organizer_memberships rename column created_at to granted_at;
alter table public.organizer_memberships add column revoked_at timestamptz;
update public.organizer_memberships set revoked_at = updated_at where not active;
alter table public.organizer_memberships drop column active;
create index organizer_memberships_active_idx on public.organizer_memberships(profile_id) where revoked_at is null;

alter table public.organizers add column approved_at timestamptz;
alter table public.organizers add column posting_revoked_at timestamptz;
alter table public.organizers add column posting_revoked_by uuid references public.profiles(id);
alter table public.organizers add column posting_revocation_reason text;
alter table public.organizers add constraint organizer_revocation_complete check (
  (posting_revoked_at is null and posting_revoked_by is null and posting_revocation_reason is null)
  or (approved_at is not null and posting_revoked_at is not null and posting_revoked_by is not null
    and posting_revocation_reason is not null and length(btrim(posting_revocation_reason)) > 0)
);

create table public.organization_contacts (
  organizer_id uuid primary key references public.organizers(id) on delete cascade,
  contact_email text not null,
  updated_at timestamptz not null default now()
);
insert into public.organization_contacts (organizer_id, contact_email)
select id, contact_email from private_r04_archive.businesses;

create table public.organizer_applications (
  id uuid primary key default gen_random_uuid(),
  applicant_profile_id uuid not null references public.profiles(id),
  organizer_name text not null check (length(btrim(organizer_name)) between 1 and 200),
  organizer_kind text not null check (organizer_kind in
    ('individual','informal_group','local_business','student_organization','nonprofit','umass_department','other')),
  contact_name text not null check (length(btrim(contact_name)) > 0),
  contact_role text not null check (length(btrim(contact_role)) > 0),
  contact_email text not null,
  affiliation_url text not null check (affiliation_url ~ '^https://[^[:space:]]+$'),
  amherst_street_address text,
  about text not null check (length(btrim(about)) between 1 and 500),
  plans_events boolean not null,
  plans_deals boolean not null,
  estimated_posting_frequency text not null check (length(btrim(estimated_posting_frequency)) > 0),
  organizer_terms_accepted_at timestamptz not null,
  status text not null default 'pending',
  approved_organizer_id uuid references public.organizers(id),
  decided_by uuid references public.profiles(id),
  decided_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (plans_events or plans_deals),
  check (
    (status in ('pending','withdrawn') and approved_organizer_id is null
      and decided_by is null and decided_at is null and rejection_reason is null)
    or (status in ('approved','revoked') and approved_organizer_id is not null
      and decided_by is not null and decided_at is not null and rejection_reason is null)
    or (status = 'rejected' and approved_organizer_id is null and decided_by is not null
      and decided_at is not null and rejection_reason is not null and length(btrim(rejection_reason)) > 0)
  )
);
create index organizer_applications_applicant_idx on public.organizer_applications(applicant_profile_id);
create index organizer_applications_queue_idx on public.organizer_applications(status, created_at);
create trigger organizer_applications_updated before update on public.organizer_applications
for each row execute function public.set_updated_at();

alter table public.events rename column organization_id to organizer_id;
alter index public.events_organization_id_idx rename to events_organizer_id_idx;

-- Refresh existing function bodies after the physical rename. Keep RPC filter
-- argument names, result columns and importer JSON mapping keys compatible.
do $migration$
declare f record; definition text;
begin
  for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prokind='f' and p.prosrc ~ '(organization_id|public.organizations)'
  loop
    definition := pg_get_functiondef(f.oid);
    definition := regexp_replace(definition, '\morganization_id\M', 'organizer_id', 'g');
    definition := replace(definition, 'TABLE(organizer_id uuid', 'TABLE(organization_id uuid');
    definition := replace(definition, 'public.organizations', 'public.organizers');
    execute definition;
  end loop;
end;
$migration$;

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid,
  action text not null,
  organizer_id uuid,
  organizer_application_id uuid,
  event_id uuid,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.organization_contacts enable row level security;
alter table public.organizer_applications enable row level security;
alter table public.audit_log enable row level security;
revoke all on public.organization_contacts, public.organizer_applications, public.audit_log
from public, anon, authenticated, service_role;
grant select, insert, update on public.organization_contacts, public.organizer_applications to service_role;
grant select on public.audit_log to service_role;
grant select on public.organization_contacts, public.audit_log to authenticated;
grant select (id, applicant_profile_id, organizer_name, organizer_kind, contact_name, contact_role,
  affiliation_url, amherst_street_address, about, plans_events, plans_deals, estimated_posting_frequency,
  organizer_terms_accepted_at, status, approved_organizer_id, decided_by, decided_at, rejection_reason,
  created_at, updated_at) on public.organizer_applications to authenticated;
grant insert (applicant_profile_id, organizer_name, organizer_kind, contact_name, contact_role,
  affiliation_url, amherst_street_address, about, plans_events, plans_deals, estimated_posting_frequency,
  organizer_terms_accepted_at) on public.organizer_applications to authenticated;

create policy application_read on public.organizer_applications for select to authenticated
using (applicant_profile_id = (select auth.uid()) or (select public.is_content_reviewer()));
create policy application_insert on public.organizer_applications for insert to authenticated
with check (applicant_profile_id = (select auth.uid()) and status = 'pending');
create policy private_contact_reviewer on public.organization_contacts for select to authenticated
using ((select public.is_content_reviewer()));
create policy audit_reviewer on public.audit_log for select to authenticated
using ((select public.is_content_reviewer()));

create function public.set_application_contact() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null then
    if new.organizer_terms_accepted_at is null then
      raise exception 'Explicit organizer terms acceptance required' using errcode = '23502';
    end if;
    new.organizer_terms_accepted_at := now();
    select email into new.contact_email from auth.users where id = new.applicant_profile_id;
  end if;
  return new;
end;
$$;
revoke all on function public.set_application_contact() from public, anon, authenticated;
create trigger application_contact before insert on public.organizer_applications
for each row execute function public.set_application_contact();

create policy organizer_read on public.organizers for select to authenticated
using ((select public.is_content_reviewer()) or exists (
  select 1 from public.organizer_memberships m
  where m.organizer_id = organizers.id and m.profile_id = (select auth.uid())
));

create function public.can_manage_organizer(p_organizer_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organizers o join public.organizer_memberships m on m.organizer_id = o.id
    where o.id = p_organizer_id and m.profile_id = (select auth.uid())
      and o.source_type = 'amherst_connect' and m.revoked_at is null and o.active and o.approved_at is not null and o.posting_revoked_at is null
  )
$$;
revoke all on function public.can_manage_organizer(uuid) from public, anon, authenticated;
grant execute on function public.can_manage_organizer(uuid) to authenticated;

create function public.organizer_is_publishing(p_organizer_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.organizers o where o.id = p_organizer_id
    and o.active and o.posting_revoked_at is null
    and (o.source_type <> 'amherst_connect' or o.approved_at is not null))
$$;
revoke all on function public.organizer_is_publishing(uuid) from public, anon, authenticated;
grant execute on function public.organizer_is_publishing(uuid) to authenticated;
create policy organizer_event_visibility on public.events as restrictive for select to authenticated
using (organizer_id is null or exists (
  select 1 from public.organizers o where o.id = organizer_id and o.posting_revoked_at is null
));

create function public.reviewer_application_contact(p_application_id uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_content_reviewer() then raise exception 'Reviewer access required' using errcode = '42501'; end if;
  return (select contact_email from public.organizer_applications where id = p_application_id);
end;
$$;
revoke all on function public.reviewer_application_contact(uuid) from public, anon, authenticated;
grant execute on function public.reviewer_application_contact(uuid) to authenticated;

grant insert (organizer_id, title, description, primary_category_id, registration_type, registration_url, is_free)
on public.events to authenticated;
grant update (title, description, primary_category_id, registration_type, registration_url, is_free)
on public.events to authenticated;
create policy organizer_event_read on public.events for select to authenticated
using (source_type = 'amherst_connect' and public.can_manage_organizer(organizer_id));
create policy organizer_event_insert on public.events for insert to authenticated
with check (status = 'draft' and source_type = 'amherst_connect' and public.can_manage_organizer(organizer_id));
create policy organizer_event_update on public.events for update to authenticated
using (source_type = 'amherst_connect' and status in ('draft','published') and public.can_manage_organizer(organizer_id))
with check (source_type = 'amherst_connect' and status in ('draft','published') and public.can_manage_organizer(organizer_id));

create function public.record_organizer_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'events' then
    if new.organizer_id is not null and new.source_type = 'amherst_connect' then
      insert into public.audit_log(actor_profile_id,action,organizer_id,event_id)
      values (auth.uid(),'event_' || lower(tg_op),new.organizer_id,new.id);
    end if;
  elsif tg_table_name = 'organizer_applications' then
    insert into public.audit_log(actor_profile_id,action,organizer_id,organizer_application_id)
    values (auth.uid(),'application_' || new.status,new.approved_organizer_id,new.id);
  else
    insert into public.audit_log(actor_profile_id,action,organizer_id)
    values (auth.uid(),'organizer_revoked',new.id);
  end if;
  return new;
end;
$$;
revoke all on function public.record_organizer_change() from public, anon, authenticated;
create trigger audit_managed_event after insert or update on public.events
for each row execute function public.record_organizer_change();
create trigger audit_application_decision after update of status on public.organizer_applications
for each row when (old.status is distinct from new.status) execute function public.record_organizer_change();
create trigger audit_organizer_revocation after update of posting_revoked_at on public.organizers
for each row when (new.posting_revoked_at is not null and old.posting_revoked_at is distinct from new.posting_revoked_at)
execute function public.record_organizer_change();

create function public.remove_organizer_event(p_event_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_content_reviewer() then raise exception 'Reviewer access required' using errcode = '42501'; end if;
  update public.events set status = 'archived' where id = p_event_id and organizer_id is not null and source_type = 'amherst_connect' and status = 'published';
  if not found then raise exception 'Published organizer event not found' using errcode = 'P0002'; end if;
end;
$$;
revoke all on function public.remove_organizer_event(uuid) from public, anon, authenticated;
grant execute on function public.remove_organizer_event(uuid) to authenticated;

commit;
