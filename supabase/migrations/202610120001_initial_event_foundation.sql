begin;

create extension if not exists postgis with schema extensions;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  avatar_url text,
  role text not null,
  onboarding_complete boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_not_blank check (length(btrim(display_name)) between 1 and 100),
  constraint profiles_role_valid check (
    role in ('student', 'faculty_staff', 'alumni', 'local_resident')
  )
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  website_url text,
  logo_url text,
  source_type text not null default 'amherst_connect',
  external_id text,
  source_url text,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizations_name_not_blank check (length(btrim(name)) between 1 and 200),
  constraint organizations_slug_valid check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint organizations_source_type_valid check (
    source_type in ('localist', 'campus_pulse', 'amherst_connect')
  ),
  constraint organizations_external_source_has_id check (
    source_type = 'amherst_connect' or external_id is not null
  )
);

create unique index organizations_source_external_id_key
  on public.organizations (source_type, external_id)
  where external_id is not null;

create table public.venues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  room text,
  address_line_1 text,
  address_line_2 text,
  city text,
  region text,
  postal_code text,
  country_code char(2) not null default 'US',
  coordinates extensions.geography(Point, 4326),
  source_type text not null default 'amherst_connect',
  external_id text,
  source_url text,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint venues_name_not_blank check (length(btrim(name)) between 1 and 200),
  constraint venues_country_code_uppercase check (country_code = upper(country_code)),
  constraint venues_source_type_valid check (
    source_type in ('localist', 'campus_pulse', 'amherst_connect')
  ),
  constraint venues_external_source_has_id check (
    source_type = 'amherst_connect' or external_id is not null
  )
);

create unique index venues_source_external_id_key
  on public.venues (source_type, external_id)
  where external_id is not null;

create index venues_coordinates_gix on public.venues using gist (coordinates);
create index venues_name_idx on public.venues (name);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_name_not_blank check (length(btrim(name)) between 1 and 100),
  constraint categories_slug_valid check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create unique index categories_name_lower_key on public.categories (lower(name));

create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  image_url text,
  organization_id uuid references public.organizations (id) on delete set null,
  primary_category_id uuid not null references public.categories (id) on delete restrict,
  status text not null default 'draft',
  visibility text not null default 'public',
  timezone text not null default 'America/New_York',
  registration_type text not null default 'none',
  registration_url text,
  is_free boolean not null default true,
  featured_rank smallint,
  source_type text not null default 'amherst_connect',
  external_id text,
  source_url text,
  source_updated_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_title_not_blank check (length(btrim(title)) between 1 and 300),
  constraint events_status_valid check (
    status in ('draft', 'published', 'cancelled', 'postponed', 'archived')
  ),
  constraint events_visibility_valid check (
    visibility in ('public', 'authenticated', 'private')
  ),
  constraint events_timezone_not_blank check (length(btrim(timezone)) > 0),
  constraint events_registration_type_valid check (
    registration_type in ('none', 'internal', 'external')
  ),
  constraint events_source_type_valid check (
    source_type in ('localist', 'campus_pulse', 'amherst_connect')
  ),
  constraint events_external_source_has_id check (
    source_type = 'amherst_connect' or external_id is not null
  ),
  constraint events_featured_rank_positive check (
    featured_rank is null or featured_rank > 0
  ),
  constraint events_registration_fields_valid check (
    (registration_type = 'external' and registration_url is not null)
    or (registration_type in ('none', 'internal') and registration_url is null)
  )
);

create unique index events_source_external_id_key
  on public.events (source_type, external_id)
  where external_id is not null;

create index events_organization_id_idx on public.events (organization_id);
create index events_primary_category_id_idx on public.events (primary_category_id);
create index events_status_idx on public.events (status);
create unique index events_published_featured_rank_key
  on public.events (featured_rank)
  where featured_rank is not null and status = 'published';

create table public.event_categories (
  event_id uuid not null references public.events (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, category_id)
);

create index event_categories_category_id_idx
  on public.event_categories (category_id, event_id);

create table public.event_occurrences (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  venue_id uuid references public.venues (id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean not null default false,
  status text not null default 'scheduled',
  location_type text not null default 'physical',
  location_name text,
  coordinates extensions.geography(Point, 4326),
  virtual_url text,
  source_attendance_count integer,
  source_type text not null default 'amherst_connect',
  external_id text,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_occurrences_end_after_start check (
    ends_at is null or ends_at > starts_at
  ),
  constraint event_occurrences_status_valid check (
    status in ('scheduled', 'cancelled', 'postponed')
  ),
  constraint event_occurrences_location_type_valid check (
    location_type in ('physical', 'virtual', 'hybrid')
  ),
  constraint event_occurrences_location_fields_valid check (
    (
      location_type = 'physical'
      and virtual_url is null
      and (venue_id is not null or location_name is not null or coordinates is not null)
    )
    or (
      location_type = 'virtual'
      and virtual_url is not null
      and venue_id is null
      and coordinates is null
    )
    or (
      location_type = 'hybrid'
      and virtual_url is not null
      and (venue_id is not null or location_name is not null or coordinates is not null)
    )
  ),
  constraint event_occurrences_attendance_nonnegative check (
    source_attendance_count is null or source_attendance_count >= 0
  ),
  constraint event_occurrences_source_type_valid check (
    source_type in ('localist', 'campus_pulse', 'amherst_connect')
  ),
  constraint event_occurrences_external_source_has_id check (
    source_type = 'amherst_connect' or external_id is not null
  ),
  constraint event_occurrences_event_start_key unique (event_id, starts_at)
);

create unique index event_occurrences_source_external_id_key
  on public.event_occurrences (source_type, external_id)
  where external_id is not null;

create index event_occurrences_event_starts_at_idx
  on public.event_occurrences (event_id, starts_at);
create index event_occurrences_venue_id_idx
  on public.event_occurrences (venue_id);
create index event_occurrences_coordinates_gix
  on public.event_occurrences using gist (coordinates);
create index event_occurrences_upcoming_idx
  on public.event_occurrences (starts_at)
  where status = 'scheduled';

create table public.bookmarks (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (profile_id, event_id)
);

create index bookmarks_profile_created_at_idx
  on public.bookmarks (profile_id, created_at desc);
create index bookmarks_event_id_idx on public.bookmarks (event_id);

create table public.rsvps (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  occurrence_id uuid not null references public.event_occurrences (id) on delete cascade,
  status text not null default 'going',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rsvps_status_valid check (status in ('going', 'cancelled')),
  constraint rsvps_profile_occurrence_key unique (profile_id, occurrence_id)
);

create index rsvps_profile_status_idx on public.rsvps (profile_id, status);
create index rsvps_occurrence_status_idx on public.rsvps (occurrence_id, status);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger organizations_set_updated_at
before update on public.organizations
for each row execute function public.set_updated_at();

create trigger venues_set_updated_at
before update on public.venues
for each row execute function public.set_updated_at();

create trigger categories_set_updated_at
before update on public.categories
for each row execute function public.set_updated_at();

create trigger events_set_updated_at
before update on public.events
for each row execute function public.set_updated_at();

create trigger event_categories_set_updated_at
before update on public.event_categories
for each row execute function public.set_updated_at();

create trigger event_occurrences_set_updated_at
before update on public.event_occurrences
for each row execute function public.set_updated_at();

create trigger bookmarks_set_updated_at
before update on public.bookmarks
for each row execute function public.set_updated_at();

create trigger rsvps_set_updated_at
before update on public.rsvps
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.venues enable row level security;
alter table public.categories enable row level security;
alter table public.events enable row level security;
alter table public.event_categories enable row level security;
alter table public.event_occurrences enable row level security;
alter table public.bookmarks enable row level security;
alter table public.rsvps enable row level security;

commit;
