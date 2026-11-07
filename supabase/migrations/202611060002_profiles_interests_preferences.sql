begin;

-- Persist onboarding interests and the two Settings notification toggles on
-- the existing user-owned profile row.
alter table public.profiles
  add column interests text[] not null default '{}',
  add column notify_new_events boolean not null default true,
  add column notify_saved_reminders boolean not null default true;

-- The existing profiles_*_own row-level policies still require
-- profiles.id = auth.uid(). Extend column privileges for these new fields.
grant insert (interests, notify_new_events, notify_saved_reminders)
  on table public.profiles to authenticated;
grant update (interests, notify_new_events, notify_saved_reminders)
  on table public.profiles to authenticated;

commit;
