begin;

-- Clients write profiles.interests directly (RLS limits them to their own
-- row), so the database enforces the vocabulary instead of trusting the app.
-- The labels match apps/mobile/src/constants/interests.ts, which a mobile test
-- keeps in sync with this list; changing them requires a new migration.

create function public.text_array_is_distinct(items text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select cardinality(items) = (select count(distinct item) from unnest(items) as item);
$$;

-- CHECK constraints run with the writer's privileges.
revoke execute on function public.text_array_is_distinct(text[]) from public, anon;
grant execute on function public.text_array_is_distinct(text[]) to authenticated, service_role;

alter table public.profiles
  add constraint profiles_interests_valid check (
    interests <@ array[
      'Dining', 'Sports', 'Music', 'Arts', 'Cultural', 'Academic',
      'RSO Events', 'Fitness', 'Study Groups', 'Theater', 'Nightlife', 'Coffee',
      'RSO', 'Outdoors', 'Study Spots', 'Shopping', 'Community', 'Tech'
    ]::text[]
  ),
  add constraint profiles_interests_distinct check (public.text_array_is_distinct(interests));

commit;
