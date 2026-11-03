-- Restores the service-role CRUD contract already asserted by rls.test.sql.
-- No anon/authenticated grants, RLS policies, profile flags, or Auth settings change.
begin;
grant usage on schema public to service_role;
grant select, insert, update, delete on
  public.profiles,
  public.organizations,
  public.venues,
  public.categories,
  public.events,
  public.event_categories,
  public.event_occurrences,
  public.bookmarks,
  public.rsvps
to service_role;
commit;
