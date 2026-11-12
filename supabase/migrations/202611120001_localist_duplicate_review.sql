begin;

alter table public.events
  add column duplicate_review_status text not null default 'clear',
  add constraint events_duplicate_review_status_check
    check (duplicate_review_status in ('clear', 'pending', 'released', 'suppressed'));

alter table public.event_duplicate_candidates
  add column reviewed_by uuid references public.profiles(id) on delete set null,
  add column reviewed_at timestamptz;

-- Student reads through feed, Details, Map, and occurrence policies all start
-- from public.events. Apply the same restriction at that shared boundary.
create policy events_hide_held_duplicates on public.events
  as restrictive for select to authenticated
  using (duplicate_review_status in ('clear', 'released'));

create function public.mark_new_localist_event_for_duplicate_check()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.source_type = 'localist' then
    perform set_config('app.new_localist_event_for_duplicate_check', new.id::text, true);
  end if;
  return new;
end;
$$;

create trigger mark_new_localist_event_for_duplicate_check
after insert on public.events
for each row execute function public.mark_new_localist_event_for_duplicate_check();
revoke all on function public.mark_new_localist_event_for_duplicate_check() from public, anon, authenticated;

create or replace function public.check_event_duplicates()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  incoming public.events%rowtype;
  published_match boolean;
begin
  select * into incoming from public.events where id = new.event_id;
  if incoming.organization_id is null or new.venue_id is null then return new; end if;

  -- Serialize contenders with the same detection key, so simultaneous imports
  -- cannot both become the first visible listing.
  perform pg_advisory_xact_lock(hashtextextended(
    jsonb_build_array(lower(trim(incoming.title)), incoming.organization_id,
      extract(epoch from new.starts_at), new.venue_id)::text, 0));

  with matches as materialized (
    select distinct e.id, e.status, e.visibility, e.duplicate_review_status, o.status as occurrence_status
    from public.event_occurrences o
    join public.events e on e.id = o.event_id
    where e.id <> incoming.id
      and lower(trim(e.title)) = lower(trim(incoming.title))
      and e.organization_id = incoming.organization_id
      and o.starts_at = new.starts_at
      and o.venue_id = new.venue_id
  ), recorded as (
    insert into public.event_duplicate_candidates (event_id, possible_duplicate_id, reason)
    select least(incoming.id, id), greatest(incoming.id, id), 'Matching title, time, venue, and organizer'
    from matches on conflict (event_id, possible_duplicate_id) do nothing
  )
  select exists (
    select 1 from matches where status = 'published'
      and occurrence_status = 'scheduled'
      and visibility in ('public', 'authenticated')
      and duplicate_review_status in ('clear', 'released')
  ) into published_match;

  if published_match and new.status = 'scheduled' and incoming.status = 'published'
    and incoming.source_type = 'localist' and incoming.duplicate_review_status = 'clear'
    and current_setting('app.new_localist_event_for_duplicate_check', true) = incoming.id::text
  then
    update public.events set duplicate_review_status = 'pending' where id = incoming.id;
  end if;
  return new;
end;
$$;

create function public.list_held_localist_duplicates()
returns table (
  held_event_id uuid, held_title text, held_external_id text, other_event_id uuid,
  other_title text, other_source_type text, other_external_id text, reason text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_content_reviewer() then raise insufficient_privilege; end if;
  return query
    select held.id, held.title, held.external_id, other.id, other.title, other.source_type,
      other.external_id, candidate.reason
    from public.event_duplicate_candidates candidate
    join public.events held on held.id in (candidate.event_id, candidate.possible_duplicate_id)
    join public.events other on other.id = case when held.id = candidate.event_id
      then candidate.possible_duplicate_id else candidate.event_id end
    where held.source_type = 'localist' and held.duplicate_review_status = 'pending'
    order by candidate.created_at, held.id, other.id;
end;
$$;

create function public.resolve_held_localist_duplicate(p_event_id uuid, p_decision text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_content_reviewer() then raise insufficient_privilege; end if;
  if p_decision is null or p_decision not in ('release', 'suppress') then
    raise exception 'Duplicate review requires release or suppress' using errcode = '22023';
  end if;
  update public.events
  set duplicate_review_status = case when p_decision = 'release' then 'released' else 'suppressed' end
  where id = p_event_id and source_type = 'localist' and duplicate_review_status = 'pending';
  if not found then raise exception 'No pending Localist duplicate' using errcode = '22023'; end if;
  update public.event_duplicate_candidates
  set reviewed = true, reviewed_by = auth.uid(), reviewed_at = now()
  where event_id = p_event_id or possible_duplicate_id = p_event_id;
end;
$$;

revoke all on function public.list_held_localist_duplicates() from public, anon, authenticated;
revoke all on function public.resolve_held_localist_duplicate(uuid, text) from public, anon, authenticated;
grant execute on function public.list_held_localist_duplicates() to authenticated;
grant execute on function public.resolve_held_localist_duplicate(uuid, text) to authenticated;

commit;
