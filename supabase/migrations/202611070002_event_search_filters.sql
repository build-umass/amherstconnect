-- E04: combined search filters for the Home/Search feed.
-- Replaces event_feed's single category with a list (AC-93) and adds
-- organization and "free only" filters. Different filters combine with AND;
-- the values inside one list combine with OR.

-- Keep the existing RPC for installed clients.
create index events_feed_search_document_idx on public.events using gin (
  to_tsvector('english'::regconfig, coalesce(title, '') || ' ' || coalesce(description, ''))
);

create function public.event_feed_filtered(
  p_from timestamptz,
  p_until timestamptz default null,
  p_category_slugs text[] default null,
  p_search text default null,
  p_organization_ids uuid[] default null,
  p_is_free boolean default null,
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
      -- Blank slugs are dropped; an empty list means all categories.
      (
        select array_agg(btrim(slug))
        from unnest(p_category_slugs) as slug
        where nullif(btrim(slug), '') is not null
      ) as category_slugs,
      nullif(p_organization_ids, '{}'::uuid[]) as organization_ids,
      p_is_free as is_free,
      -- Escape LIKE wildcards so a search for "100%" means the literal text.
      '%' || replace(replace(replace(
        left(btrim(p_search), 100), '\', '\\'), '%', '\%'), '_', '\_') || '%' as search_pattern,
      plainto_tsquery('english'::regconfig, left(btrim(p_search), 100)) as search_terms,
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
      -- Any listed category, as the primary category or a secondary one.
      and (
        p.category_slugs is null
        or c.slug = any(p.category_slugs)
        or exists (
          select 1
          from public.event_categories ec
          join public.categories c2 on c2.id = ec.category_id
          where ec.event_id = e.id
            and c2.slug = any(p.category_slugs)
        )
      )
      and (p.organization_ids is null or e.organization_id = any(p.organization_ids))
      and (p.is_free is null or e.is_free = p.is_free)
      and (
        not p.has_search
        or e.title ilike p.search_pattern
        or coalesce(o.location_name, v.name, '') ilike p.search_pattern
        or coalesce(org.name, '') ilike p.search_pattern
        or e.id in (
          select indexed_event.id from public.events indexed_event
          where to_tsvector('english'::regconfig, coalesce(indexed_event.title, '') || ' ' || coalesce(indexed_event.description, '')) @@ p.search_terms
        )
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

revoke all on function public.event_feed_filtered(timestamptz, timestamptz, text[], text, uuid[], boolean, timestamptz, uuid, integer) from public, anon;
grant execute on function public.event_feed_filtered(timestamptz, timestamptz, text[], text, uuid[], boolean, timestamptz, uuid, integer) to authenticated;
