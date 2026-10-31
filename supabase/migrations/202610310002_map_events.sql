-- E05: event occurrences inside the visible map area and a time window.
-- Runs as the calling user (security invoker), so the existing RLS policies
-- still hide draft, archived and private events.
create or replace function public.map_occurrences_in_bounds(
  p_min_lat double precision,
  p_min_lng double precision,
  p_max_lat double precision,
  p_max_lng double precision,
  p_window_start timestamptz,
  p_window_end timestamptz,
  p_limit integer default 200
)
returns table (
  occurrence_id uuid,
  event_id uuid,
  title text,
  category_name text,
  category_slug text,
  starts_at timestamptz,
  ends_at timestamptz,
  all_day boolean,
  timezone text,
  event_status text,
  occurrence_status text,
  location_name text,
  latitude double precision,
  longitude double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  with bounds as (
    select extensions.st_makeenvelope(
      p_min_lng, p_min_lat, p_max_lng, p_max_lat, 4326
    ) as box
    where p_min_lat between -90 and 90
      and p_max_lat between -90 and 90
      and p_min_lng between -180 and 180
      and p_max_lng between -180 and 180
      and p_min_lat <= p_max_lat
      and p_min_lng <= p_max_lng
      and p_window_start < p_window_end
  )
  select
    o.id,
    e.id,
    e.title,
    c.name,
    c.slug,
    o.starts_at,
    o.ends_at,
    o.all_day,
    e.timezone,
    e.status,
    o.status,
    coalesce(o.location_name, v.name),
    extensions.st_y(pt.geom),
    extensions.st_x(pt.geom)
  from public.event_occurrences o
  join public.events e on e.id = o.event_id
  join public.categories c on c.id = e.primary_category_id
  left join public.venues v on v.id = o.venue_id
  -- Use the occurrence's own point, falling back to its venue's point.
  -- At campus scale this is fine; if it gets slow, split into two indexed lookups.
  cross join lateral (
    select coalesce(o.coordinates, v.coordinates)::extensions.geometry as geom
  ) pt
  cross join bounds b
  where pt.geom is not null
    and o.location_type <> 'virtual'
    and extensions.st_intersects(pt.geom, b.box)
    and o.starts_at < p_window_end
    and coalesce(o.ends_at, o.starts_at) >= p_window_start
  order by o.starts_at, o.id
  limit least(greatest(coalesce(p_limit, 200), 1), 500);
$$;

revoke all on function public.map_occurrences_in_bounds(
  double precision, double precision, double precision, double precision,
  timestamptz, timestamptz, integer
) from public, anon;

grant execute on function public.map_occurrences_in_bounds(
  double precision, double precision, double precision, double precision,
  timestamptz, timestamptz, integer
) to authenticated;