begin;

-- Start from an explicit deny-by-default privilege baseline. Row-level security
-- further limits the rows available through the granted client operations.
revoke all on table public.profiles from public, anon, authenticated;
revoke all on table public.organizations from public, anon, authenticated;
revoke all on table public.venues from public, anon, authenticated;
revoke all on table public.categories from public, anon, authenticated;
revoke all on table public.events from public, anon, authenticated;
revoke all on table public.event_categories from public, anon, authenticated;
revoke all on table public.event_occurrences from public, anon, authenticated;
revoke all on table public.bookmarks from public, anon, authenticated;
revoke all on table public.rsvps from public, anon, authenticated;

revoke usage on schema public from public, anon;
grant usage on schema public to authenticated;

revoke execute on function public.set_updated_at() from public, anon, authenticated;

grant select on table public.profiles to authenticated;
grant insert (id, display_name, avatar_url, role, onboarding_complete)
  on table public.profiles to authenticated;
grant update (display_name, avatar_url, role, onboarding_complete)
  on table public.profiles to authenticated;

grant select on table public.organizations to authenticated;
grant select on table public.venues to authenticated;
grant select on table public.categories to authenticated;
grant select on table public.events to authenticated;
grant select on table public.event_categories to authenticated;
grant select on table public.event_occurrences to authenticated;

grant select, delete on table public.bookmarks to authenticated;
grant insert (profile_id, event_id) on table public.bookmarks to authenticated;

grant select, delete on table public.rsvps to authenticated;
grant insert (id, profile_id, occurrence_id, status)
  on table public.rsvps to authenticated;
grant update (status) on table public.rsvps to authenticated;

create policy profiles_select_own
on public.profiles
for select
to authenticated
using (id = (select auth.uid()));

create policy profiles_insert_own
on public.profiles
for insert
to authenticated
with check (id = (select auth.uid()));

create policy profiles_update_own
on public.profiles
for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy organizations_authenticated_read
on public.organizations
for select
to authenticated
using (true);

create policy venues_authenticated_read
on public.venues
for select
to authenticated
using (true);

create policy categories_authenticated_read
on public.categories
for select
to authenticated
using (true);

create policy events_authenticated_read
on public.events
for select
to authenticated
using (
  status in ('published', 'cancelled', 'postponed')
  and visibility in ('public', 'authenticated')
);

create policy event_categories_readable_parent
on public.event_categories
for select
to authenticated
using (
  exists (
    select 1
    from public.events
    where events.id = event_categories.event_id
      and events.status in ('published', 'cancelled', 'postponed')
      and events.visibility in ('public', 'authenticated')
  )
);

create policy event_occurrences_readable_parent
on public.event_occurrences
for select
to authenticated
using (
  exists (
    select 1
    from public.events
    where events.id = event_occurrences.event_id
      and events.status in ('published', 'cancelled', 'postponed')
      and events.visibility in ('public', 'authenticated')
  )
);

create policy bookmarks_select_own
on public.bookmarks
for select
to authenticated
using (profile_id = (select auth.uid()));

create policy bookmarks_insert_own_readable_event
on public.bookmarks
for insert
to authenticated
with check (
  profile_id = (select auth.uid())
  and exists (
    select 1
    from public.events
    where events.id = bookmarks.event_id
      and events.status in ('published', 'cancelled', 'postponed')
      and events.visibility in ('public', 'authenticated')
  )
);

create policy bookmarks_delete_own
on public.bookmarks
for delete
to authenticated
using (profile_id = (select auth.uid()));

create policy rsvps_select_own
on public.rsvps
for select
to authenticated
using (profile_id = (select auth.uid()));

create policy rsvps_insert_own_internal_readable_occurrence
on public.rsvps
for insert
to authenticated
with check (
  profile_id = (select auth.uid())
  and status = 'going'
  and exists (
    select 1
    from public.event_occurrences
    join public.events on events.id = event_occurrences.event_id
    where event_occurrences.id = rsvps.occurrence_id
      and event_occurrences.status = 'scheduled'
      and events.status = 'published'
      and events.visibility in ('public', 'authenticated')
      and events.registration_type = 'internal'
  )
);

create policy rsvps_update_own_internal_readable_occurrence
on public.rsvps
for update
to authenticated
using (profile_id = (select auth.uid()))
with check (
  profile_id = (select auth.uid())
  and (
    status = 'cancelled'
    or (
      status = 'going'
      and exists (
        select 1
        from public.event_occurrences
        join public.events on events.id = event_occurrences.event_id
        where event_occurrences.id = rsvps.occurrence_id
          and event_occurrences.status = 'scheduled'
          and events.status = 'published'
          and events.visibility in ('public', 'authenticated')
          and events.registration_type = 'internal'
      )
    )
  )
);

create policy rsvps_delete_own
on public.rsvps
for delete
to authenticated
using (profile_id = (select auth.uid()));

commit;
