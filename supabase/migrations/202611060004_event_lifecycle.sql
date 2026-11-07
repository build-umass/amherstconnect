begin;

-- Store when an event should expire.
alter table public.events
  add column expires_at timestamptz;

-- Mark events with manual overrides.
alter table public.events
  add column manual_override boolean not null default false;

-- Store possible duplicate events for review.
create table public.event_duplicate_candidates (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  possible_duplicate_id uuid not null references public.events(id) on delete cascade,
  reason text not null,
  reviewed boolean not null default false,
  created_at timestamptz not null default now(),

  unique (event_id, possible_duplicate_id),
  check (event_id <> possible_duplicate_id)
);

-- Keep duplicate candidates private.
alter table public.event_duplicate_candidates enable row level security;

revoke all on public.event_duplicate_candidates
  from public, anon, authenticated;

grant select, insert, update
  on public.event_duplicate_candidates to service_role;



-- Find events that might be duplicates.
create function public.check_event_duplicates()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.event_duplicate_candidates (
    event_id,
    possible_duplicate_id,
    reason
  )
  select distinct
    least(new.event_id, other.event_id),
    greatest(new.event_id, other.event_id),
    'Matching title, time, venue, and organizer'
  from public.event_occurrences other
  join public.events first_event
    on first_event.id = new.event_id
  join public.events second_event
    on second_event.id = other.event_id
  where other.event_id <> new.event_id
    and lower(trim(first_event.title)) = lower(trim(second_event.title))
    and first_event.organization_id = second_event.organization_id
    and first_event.organization_id is not null
    and other.starts_at = new.starts_at
    and other.venue_id = new.venue_id
    and new.venue_id is not null
  on conflict (event_id, possible_duplicate_id) do nothing;

  return new;
end;
$$;

-- Check whenever an occurrence is added or updated.
create trigger check_event_duplicates
after insert or update on public.event_occurrences
for each row
execute function public.check_event_duplicates();

revoke all on function public.check_event_duplicates()
  from public, anon, authenticated;


-- Archive imported events after their last occurrence.
create function public.expire_past_events(
  grace_period interval default interval '1 day'
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  archived_count integer;
begin
  if grace_period is null or grace_period < interval '0' then
    raise exception 'Invalid grace period';
  end if;

  -- Calculate expiry using the last occurrence.
  update public.events e
  set expires_at = last_dates.last_date + grace_period
  from (
    select
      event_id,
      max(coalesce(ends_at, starts_at)) as last_date
    from public.event_occurrences
    group by event_id
  ) last_dates
  where e.id = last_dates.event_id
    and e.source_type in ('localist', 'campus_pulse')
    and e.manual_override = false
    and e.expires_at is distinct from last_dates.last_date + grace_period;

  -- Archive only published events past their expiry.
  update public.events
  set status = 'archived'
  where expires_at < now()
    and status = 'published'
    and manual_override = false
    and source_type in ('localist', 'campus_pulse');

  get diagnostics archived_count = row_count;

  return archived_count;
end;
$$;

revoke all on function public.expire_past_events(interval)
  from public, anon, authenticated;

grant execute on function public.expire_past_events(interval)
  to service_role;


-- Finalize expiry in the same transaction as a successful A10 sync.
-- This also covers identical records and events outside the current fetch window.
create function public.expire_events_after_localist_sync()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform public.expire_past_events();
  return new;
end;
$$;

create trigger expire_events_after_localist_sync
after update of status on public.localist_sync_runs
for each row
when (old.status = 'running' and new.status = 'completed')
execute function public.expire_events_after_localist_sync();

revoke all on function public.expire_events_after_localist_sync()
  from public, anon, authenticated;

-- Protect manually edited events during imports.
create function public.protect_manual_event()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.manual_override = true
     and current_setting('app.importing_event', true) = 'on' then
    new.title := old.title;
    new.description := old.description;
    new.image_url := old.image_url;
    new.organization_id := old.organization_id;
    new.primary_category_id := old.primary_category_id;
    new.status := old.status;
    new.visibility := old.visibility;
    new.registration_type := old.registration_type;
    new.registration_url := old.registration_url;
    new.is_free := old.is_free;
    new.featured_rank := old.featured_rank;
  end if;

  return new;
end;
$$;

create trigger protect_manual_event
before update on public.events
for each row
execute function public.protect_manual_event();

-- Extend the existing importer without changing its original migration.
create or replace function public.import_event_record(
  p_run_id uuid, p_record_index integer, p_draft jsonb, p_mapping jsonb,
  p_payload_hash text, p_failure jsonb default null
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_source text;
  v_event public.events%rowtype;
  v_occ public.event_occurrences%rowtype;
  v_id uuid;
  v_outcome text;
  v_issues jsonb := '[]'::jsonb;
  v_item jsonb;
  v_index integer := 0;
  v_new boolean;
  v_updated timestamptz;
  v_category_ids uuid[];
  v_primary uuid;
  v_existing jsonb;
  v_cancelled_occurrences jsonb := '[]'::jsonb;
begin
  select source_type into strict v_source from public.import_runs
    where id = p_run_id and status = 'running' for update;
  select jsonb_build_object('outcome', outcome, 'eventId', event_id, 'issues', issues)
    into v_existing from public.event_import_records
    where run_id = p_run_id and record_index = p_record_index;
  if found then return v_existing; end if;

  if p_failure is not null then
    if p_failure->>'outcome' not in ('invalid', 'unresolved') then
      raise exception 'Invalid preflight outcome';
    end if;
    v_outcome := p_failure->>'outcome';
    v_issues := p_failure->'issues';
  else
    begin
      if p_draft->>'sourceType' is distinct from v_source
        or nullif(btrim(p_draft->>'externalId'), '') is null
        or jsonb_array_length(p_draft->'occurrences') < 1 then
        raise exception 'Invalid imported identity or occurrences';
      end if;
      -- Serialize imports of a source event, including first import races.
      perform pg_advisory_xact_lock(hashtextextended(v_source || ':' || (p_draft->>'externalId'), 0));
      select * into v_event from public.events
        where source_type = v_source and external_id = p_draft->>'externalId' for update;
      v_new := not found;
      v_id := case when v_new then gen_random_uuid() else v_event.id end;
      v_updated := (p_draft->>'sourceUpdatedAt')::timestamptz;
      if not v_new and v_event.source_updated_at is not null
        and (v_updated is null or v_updated < v_event.source_updated_at) then
        v_outcome := 'stale';
      end if;
      -- Refuse identity theft and stale occurrence changes as a whole record.
      for v_item in select value from jsonb_array_elements(p_draft->'occurrences') loop
        if v_item->>'sourceType' is distinct from v_source
          or nullif(btrim(v_item->>'externalId'), '') is null then
          raise exception 'Invalid occurrence source identity';
        end if;
        select * into v_occ from public.event_occurrences
          where source_type = v_source and external_id = v_item->>'externalId' for update;
        if found then
          if v_occ.event_id <> v_id then raise exception 'Occurrence belongs to a different event'; end if;
          if v_occ.source_updated_at is not null and
            ((v_item->>'sourceUpdatedAt') is null or (v_item->>'sourceUpdatedAt')::timestamptz < v_occ.source_updated_at) then
            v_outcome := 'stale';
          end if;
        end if;
        if v_item->>'status' = 'cancelled' and v_occ.status is distinct from 'cancelled' then
          v_cancelled_occurrences := v_cancelled_occurrences || jsonb_build_array(v_item->>'externalId');
        end if;
      end loop;
      if not v_new and v_event.manual_override and v_outcome is null then
        -- Preserve the editor's override, but surface provider cancellations for review.
        if (p_draft->>'status' = 'cancelled' and v_event.status <> 'cancelled')
           or (v_event.status <> 'cancelled' and jsonb_array_length(v_cancelled_occurrences) > 0) then
          v_issues := jsonb_build_array(jsonb_build_object(
            'code', 'manual_override_cancellation_conflict',
            'message', 'Provider cancellation was not applied because of a manual override; review the event.',
            'providerEventCancelled', p_draft->>'status' = 'cancelled',
            'providerCancelledOccurrenceIds', v_cancelled_occurrences));
        end if;
        v_outcome := 'unchanged';
      end if;

      if v_outcome is null and exists (
        select 1 from public.event_import_state where source_type = v_source
          and external_id = p_draft->>'externalId' and payload_hash = p_payload_hash
      ) then v_outcome := 'unchanged'; end if;

      if v_outcome is null then
        select array_agg(value::uuid) into v_category_ids
          from jsonb_array_elements_text(p_mapping->'categoryIds');
        v_primary := (p_mapping->>'primaryCategoryId')::uuid;
        if cardinality(v_category_ids) is null or not (v_primary = any(v_category_ids)) then
          raise exception 'Primary category must be in the mapped category set';
        end if;
        if (select count(*) from public.categories where id = any(v_category_ids)) <> cardinality(v_category_ids) then
          raise exception 'Mapped categories must exist and be unique';
        end if;
        if jsonb_array_length(p_mapping->'venueIds') <> jsonb_array_length(p_draft->'occurrences') then
          raise exception 'Venue mappings must align with occurrences';
        end if;
        insert into public.events(id, title, description, image_url, organization_id, primary_category_id,
          status, visibility, timezone, registration_type, registration_url, is_free, featured_rank,
          source_type, external_id, source_url, source_updated_at)
        values (v_id, p_draft->>'title', p_draft->>'description', p_draft->>'imageUrl',
          (p_mapping->>'organizationId')::uuid, v_primary, p_draft->>'status', p_draft->>'visibility',
          p_draft->>'timezone', p_draft->>'registrationType', p_draft->>'registrationUrl',
          (p_draft->>'isFree')::boolean, (p_draft->>'featuredRank')::smallint,
          v_source, p_draft->>'externalId', p_draft->>'sourceUrl', v_updated)
        on conflict (id) do update set title=excluded.title, description=excluded.description,
          image_url=excluded.image_url, organization_id=excluded.organization_id,
          primary_category_id=excluded.primary_category_id, status=excluded.status,
          visibility=excluded.visibility, timezone=excluded.timezone,
          registration_type=excluded.registration_type, registration_url=excluded.registration_url,
          is_free=excluded.is_free, featured_rank=excluded.featured_rank,
          source_url=excluded.source_url, source_updated_at=excluded.source_updated_at;
        delete from public.event_categories where event_id = v_id and not (category_id = any(v_category_ids));
        insert into public.event_categories(event_id, category_id)
          select v_id, unnest(v_category_ids) on conflict (event_id, category_id) do nothing;
        set constraints public.event_occurrences_event_start_key deferred;
        for v_item in select value from jsonb_array_elements(p_draft->'occurrences') loop
          insert into public.event_occurrences(event_id, venue_id, starts_at, ends_at, all_day, status,
            location_type, location_name, coordinates, virtual_url, source_attendance_count,
            source_type, external_id, source_updated_at)
          values (v_id, (p_mapping->'venueIds'->>v_index)::uuid,
            (v_item->>'startsAt')::timestamptz, (v_item->>'endsAt')::timestamptz,
            (v_item->>'allDay')::boolean, v_item->>'status', v_item->>'locationType', v_item->>'locationName',
            case when v_item->'coordinates' <> 'null'::jsonb then
              extensions.st_setsrid(extensions.st_makepoint(
                (v_item->'coordinates'->>'longitude')::double precision,
                (v_item->'coordinates'->>'latitude')::double precision),4326)::extensions.geography
              else null end,
            v_item->>'virtualUrl', (v_item->>'sourceAttendanceCount')::integer,
            v_source, v_item->>'externalId', (v_item->>'sourceUpdatedAt')::timestamptz)
          on conflict (source_type, external_id) where external_id is not null do update set
            venue_id=excluded.venue_id, starts_at=excluded.starts_at, ends_at=excluded.ends_at,
            all_day=excluded.all_day, status=excluded.status, location_type=excluded.location_type,
            location_name=excluded.location_name, coordinates=excluded.coordinates,
            virtual_url=excluded.virtual_url, source_attendance_count=excluded.source_attendance_count,
            source_updated_at=excluded.source_updated_at
          where public.event_occurrences.event_id = excluded.event_id;
          if not found then raise exception 'Occurrence belongs to a different event'; end if;
          v_index := v_index + 1;
        end loop;
        -- Check here, inside the content subtransaction, not at RPC commit:
        -- invalid final schedules must roll back and record a failed outcome.
        set constraints public.event_occurrences_event_start_key immediate;

        update public.events e
        set expires_at = dates.expiry,
            status = case
              when e.status = 'published' and dates.expiry < now()
              then 'archived'
              else e.status
            end
        from (
          select max(coalesce(ends_at, starts_at))
                 + interval '1 day' as expiry
          from public.event_occurrences
          where event_id = v_id
        ) dates
        where e.id = v_id;

        insert into public.event_import_state(source_type, external_id, event_id, payload_hash)
          values(v_source, p_draft->>'externalId', v_id, p_payload_hash)
          on conflict(source_type, external_id) do update set payload_hash=excluded.payload_hash;
        v_outcome := case when v_new then 'created' else 'updated' end;
      end if;
    exception when others then
      -- Do not persist raw SQL errors or payloads that might include input data.
      v_outcome := 'failed';
      v_issues := jsonb_build_array(jsonb_build_object('code', SQLSTATE, 'message', 'Atomic database write rejected; check constraints and mapping IDs.'));
      v_id := null;
    end;
  end if;
  insert into public.event_import_records(run_id, record_index, external_id, event_id, payload_hash, outcome, issues)
    values(p_run_id, p_record_index, p_draft->>'externalId', v_id, p_payload_hash, v_outcome, v_issues);
  return jsonb_build_object('outcome', v_outcome, 'eventId', v_id, 'issues', v_issues);
end;
$$;

commit;
