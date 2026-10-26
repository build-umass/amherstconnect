begin;

-- Keep final schedule uniqueness, but allow existing identities to move/swap
-- slots within one atomic import. Foundation migrations remain unchanged.
alter table public.event_occurrences drop constraint event_occurrences_event_start_key;
alter table public.event_occurrences add constraint event_occurrences_event_start_key
  unique (event_id, starts_at) deferrable initially immediate;

create table public.import_runs (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('localist', 'campus_pulse')),
  expected_records integer not null default 0 check (expected_records >= 0),
  status text not null default 'running' check (status in ('running', 'completed', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  check ((status = 'running') = (finished_at is null))
);

create table public.event_import_records (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.import_runs(id) on delete restrict,
  record_index integer not null check (record_index >= 0),
  external_id text,
  event_id uuid references public.events(id) on delete set null,
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  outcome text not null check (outcome in ('created', 'updated', 'unchanged', 'stale', 'invalid', 'unresolved', 'failed')),
  issues jsonb not null default '[]'::jsonb check (jsonb_typeof(issues) = 'array'),
  created_at timestamptz not null default now(),
  unique (run_id, record_index)
);

create table public.event_import_state (
  source_type text not null check (source_type in ('localist', 'campus_pulse')),
  external_id text not null check (length(btrim(external_id)) > 0),
  event_id uuid not null unique references public.events(id) on delete cascade,
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  updated_at timestamptz not null default now(),
  primary key (source_type, external_id)
);

create index import_runs_started_at_idx on public.import_runs(started_at desc);
create index event_import_records_event_idx on public.event_import_records(event_id, created_at desc);
alter table public.import_runs enable row level security;
alter table public.event_import_records enable row level security;
alter table public.event_import_state enable row level security;
revoke all on public.import_runs, public.event_import_records, public.event_import_state from public, anon, authenticated;
grant select, insert, update on public.import_runs to service_role;
grant select, insert on public.event_import_records to service_role;
grant select, insert, update on public.event_import_state to service_role;
create trigger event_import_state_updated_at before update on public.event_import_state
  for each row execute function public.set_updated_at();

-- Invoker privileges are intentional: only service_role/postgres may execute.
-- The inner exception block is a subtransaction. A failed event write rolls
-- back all its content changes before the durable outcome is inserted.
create function public.import_event_record(
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
      end loop;
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
revoke all on function public.import_event_record(uuid, integer, jsonb, jsonb, text, jsonb) from public, anon, authenticated;
grant execute on function public.import_event_record(uuid, integer, jsonb, jsonb, text, jsonb) to service_role;
commit;
