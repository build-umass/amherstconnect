-- E04: choices for the feed's organization filter. Only organizations with an
-- available upcoming event (same rules as event_feed), so every choice has
-- results. Runs as the calling user, so private and draft events don't count.
create function public.event_feed_organizations(
  p_from timestamptz default now()
)
returns table (
  organization_id uuid,
  name text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select org.id, org.name
  from public.organizations org
  where p_from is not null
    and exists (
      select 1
      from public.events e
      join public.event_occurrences o on o.event_id = e.id
      where e.organization_id = org.id
        and e.status = 'published'
        and o.status = 'scheduled'
        and (
          (o.ends_at is not null and o.ends_at > p_from)
          or (o.ends_at is null and o.starts_at >= p_from)
        )
    )
  order by lower(org.name), org.id;
$$;

revoke all on function public.event_feed_organizations(timestamptz) from public, anon;
grant execute on function public.event_feed_organizations(timestamptz) to authenticated;
