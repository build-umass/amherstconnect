-- E02: production event queries for Home, Search and Event Details.
-- Both functions run as the calling user (security invoker), so the existing
-- RLS policies still hide draft, archived and private events.

-- Home and Search: one row per event, using its next available occurrence.
-- Filters run in the database and results come back a page at a time.
-- Pagination is keyset based: pass the starts_at and event_id of the last row
-- you received to get the next page. Both cursor values go together.
create or replace function public.event_feed(
  p_from timestamptz,
  p_until timestamptz default null,
  p_category_slug text default null,
  p_search text default null,
  p_after_starts_at timestamptz default null,
  p_after_event_id uuid default null,
  p_limit integer default 20
)
returns table (
  event_id uuid,
  occurrence_id uuid,
  title text,
  category_name text,
  category_slug text,
  organizer_name text,
  starts_at timestamptz,
  ends_at timestamptz,
  all_day boolean,
  timezone text,
  location_type text,
  location_name text,
  latitude double precision,
  longitude double precision,
  is_free boolean,
  image_url text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with params as (
    select
      nullif(btrim(p_category_slug), '') as category_slug,
      -- Escape LIKE wildcards so a search for "100%" means the literal text.
      '%' || replace(replace(replace(
        left(btrim(p_search), 100), '\', '\\'), '%', '\%'), '_', '\_') || '%' as search_pattern,
      nullif(btrim(p_search), '') is not null as has_search
    where p_from is not null
      and (p_until is null or p_until > p_from)
  ),
  next_occurrence as (
    select distinct on (e.id)
      e.id as event_id,
      o.id as occurrence_id,
      e.title,
      c.name as category_name,
      c.slug as category_slug,
      org.name as organizer_name,
      o.starts_at,
      o.ends_at,
      o.all_day,
      e.timezone,
      o.location_type,
      coalesce(o.location_name, v.name) as location_name,
      extensions.st_y(pt.geom) as latitude,
      extensions.st_x(pt.geom) as longitude,
      e.is_free,
      e.image_url
    from public.events e
    join public.event_occurrences o on o.event_id = e.id
    join public.categories c on c.id = e.primary_category_id
    left join public.organizations org on org.id = e.organization_id
    left join public.venues v on v.id = o.venue_id
    cross join lateral (
      select coalesce(o.coordinates, v.coordinates)::extensions.geometry as geom
    ) pt
    cross join params p
    -- Only available occurrences. Cancelled and postponed events leave the feed;
    -- people who saved them still see them, labeled, on Event Details.
    where e.status = 'published'
      and o.status = 'scheduled'
      -- Not over yet: still running, or (with no end time) not started yet.
      and (
        (o.ends_at is not null and o.ends_at > p_from)
        or (o.ends_at is null and o.starts_at >= p_from)
      )
      and (p_until is null or o.starts_at < p_until)
      -- Category matches the primary category or any secondary one.
      and (
        p.category_slug is null
        or c.slug = p.category_slug
        or exists (
          select 1
          from public.event_categories ec
          join public.categories c2 on c2.id = ec.category_id
          where ec.event_id = e.id
            and c2.slug = p.category_slug
        )
      )
      and (
        not p.has_search
        or e.title ilike p.search_pattern
        or coalesce(o.location_name, v.name, '') ilike p.search_pattern
        or coalesce(org.name, '') ilike p.search_pattern
      )
    order by e.id, o.starts_at, o.id
  )
  select
    n.event_id,
    n.occurrence_id,
    n.title,
    n.category_name,
    n.category_slug,
    n.organizer_name,
    n.starts_at,
    n.ends_at,
    n.all_day,
    n.timezone,
    n.location_type,
    n.location_name,
    n.latitude,
    n.longitude,
    n.is_free,
    n.image_url
  from next_occurrence n
  where
    -- First page: no cursor. Later pages: rows after the cursor.
    -- Passing only one cursor value matches nothing, on purpose.
    (p_after_starts_at is null and p_after_event_id is null)
    or (
      p_after_starts_at is not null
      and p_after_event_id is not null
      and (n.starts_at, n.event_id) > (p_after_starts_at, p_after_event_id)
    )
  order by n.starts_at, n.event_id
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
$$;

-- Event Details: one event by its canonical ID, with everything the screen
-- shows. Cancelled and postponed events are still returned (with their status)
-- so people who saved them see a label instead of a missing event.
-- `occurrences` lists upcoming times (any status, up to 20). When none are
-- left, it holds the most recent past one so old saved events still render.
create or replace function public.event_details(
  p_event_id uuid,
  p_from timestamptz default now()
)
returns table (
  event_id uuid,
  title text,
  description text,
  image_url text,
  status text,
  timezone text,
  is_free boolean,
  registration_type text,
  registration_url text,
  source_url text,
  category_name text,
  category_slug text,
  organizer_name text,
  organizer_url text,
  occurrences jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    e.id,
    e.title,
    e.description,
    e.image_url,
    e.status,
    e.timezone,
    e.is_free,
    e.registration_type,
    e.registration_url,
    e.source_url,
    c.name,
    c.slug,
    org.name,
    org.website_url,
    coalesce(occ.items, '[]'::jsonb)
  from public.events e
  join public.categories c on c.id = e.primary_category_id
  left join public.organizations org on org.id = e.organization_id
  cross join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id', x.id,
        'starts_at', x.starts_at,
        'ends_at', x.ends_at,
        'all_day', x.all_day,
        'status', x.status,
        'location_type', x.location_type,
        'location_name', x.location_name,
        'venue_name', x.venue_name,
        'room', x.room,
        'address', x.address,
        'latitude', x.latitude,
        'longitude', x.longitude,
        'virtual_url', x.virtual_url
      )
      order by x.starts_at, x.id
    ) as items
    from (
      select
        b.*,
        -- Does this event have any upcoming time at all?
        bool_or(b.upcoming) over () as has_upcoming,
        -- Upcoming: soonest first. Past: most recent first.
        row_number() over (
          partition by b.upcoming
          order by
            case when b.upcoming then b.starts_at end asc,
            b.starts_at desc,
            b.id
        ) as rank_in_group
      from (
        select
          o.id,
          o.starts_at,
          o.ends_at,
          o.all_day,
          o.status,
          o.location_type,
          coalesce(o.location_name, v.name) as location_name,
          v.name as venue_name,
          v.room,
          nullif(concat_ws(', ',
            nullif(btrim(v.address_line_1), ''),
            nullif(btrim(v.address_line_2), ''),
            nullif(btrim(v.city), ''),
            nullif(btrim(concat_ws(' ', nullif(btrim(v.region), ''), nullif(btrim(v.postal_code), ''))), '')
          ), '') as address,
          extensions.st_y(pt.geom) as latitude,
          extensions.st_x(pt.geom) as longitude,
          o.virtual_url,
          -- Same "not over yet" rule as the feed.
          (o.ends_at is not null and o.ends_at > p_from)
            or (o.ends_at is null and o.starts_at >= p_from) as upcoming
        from public.event_occurrences o
        left join public.venues v on v.id = o.venue_id
        cross join lateral (
          select coalesce(o.coordinates, v.coordinates)::extensions.geometry as geom
        ) pt
        where o.event_id = e.id
      ) b
    ) x
    where (x.upcoming and x.rank_in_group <= 20)
       or (not x.has_upcoming and x.rank_in_group = 1)
  ) occ
  where e.id = p_event_id
    and p_from is not null;
$$;

revoke all on function public.event_feed(timestamptz, timestamptz, text, text, timestamptz, uuid, integer) from public, anon;
grant execute on function public.event_feed(timestamptz, timestamptz, text, text, timestamptz, uuid, integer) to authenticated;

revoke all on function public.event_details(uuid, timestamptz) from public, anon;
grant execute on function public.event_details(uuid, timestamptz) to authenticated;
