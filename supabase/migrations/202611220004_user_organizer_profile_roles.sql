begin;

-- Accept the current account types for new profiles. Keep the historical
-- values during rollout so this schema change does not rewrite existing users.
alter table public.profiles
  drop constraint profiles_role_valid;

alter table public.profiles
  add constraint profiles_role_valid
  check (role in ('student', 'faculty_staff', 'alumni', 'local_resident', 'user', 'organizer'));

commit;
