begin;

create table public.notification_inbox (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  occurrence_id uuid not null references public.event_occurrences(id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (profile_id, occurrence_id)
);
create index notification_inbox_profile_date_idx on public.notification_inbox(profile_id, created_at desc);

alter table public.notification_inbox enable row level security;
revoke all on public.notification_inbox from public, anon, authenticated;
grant select on public.notification_inbox to authenticated;
grant update (read_at) on public.notification_inbox to authenticated;
grant select, insert on public.notification_inbox to service_role;

create policy notification_inbox_read_own on public.notification_inbox for select to authenticated
  using (profile_id = (select auth.uid()));
create policy notification_inbox_mark_own on public.notification_inbox for update to authenticated
  using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));

create table public.notification_deliveries (
  notification_id uuid not null references public.notification_inbox(id) on delete cascade,
  auth_session_id uuid not null references public.push_devices(auth_session_id) on delete cascade,
  attempts integer not null default 0,
  attempt_token uuid,
  retry_after timestamptz not null default now(),
  completed_at timestamptz,
  primary key (notification_id, auth_session_id)
);
alter table public.notification_deliveries enable row level security;
revoke all on public.notification_deliveries from public, anon, authenticated;
grant select, insert, update on public.notification_deliveries to service_role;

create function public.enqueue_saved_event_reminders()
returns integer language plpgsql security invoker set search_path = '' as $$
declare inserted integer;
begin
  insert into public.notification_inbox(profile_id, occurrence_id)
  select bookmark.profile_id, occurrence.id
  from public.bookmarks bookmark
  join public.profiles profile on profile.id = bookmark.profile_id
  join public.events event on event.id = bookmark.event_id
  join public.event_occurrences occurrence on occurrence.event_id = event.id
  where profile.notify_saved_reminders
    and event.status = 'published' and event.visibility in ('public', 'authenticated')
    and coalesce(to_jsonb(event)->>'duplicate_review_status', 'clear') in ('clear', 'released')
    and occurrence.status = 'scheduled'
    and occurrence.starts_at > now() and occurrence.starts_at <= now() + interval '1 hour'
  on conflict (profile_id, occurrence_id) do nothing;
  get diagnostics inserted = row_count;

  insert into public.notification_deliveries(notification_id, auth_session_id)
  select notice.id, device.auth_session_id
  from public.notification_inbox notice
  join public.push_devices device on device.profile_id = notice.profile_id
  join public.event_occurrences occurrence on occurrence.id = notice.occurrence_id
  where occurrence.starts_at > now()
  on conflict do nothing;
  return inserted;
end;
$$;

create function public.claim_saved_event_deliveries()
returns table (notification_id uuid, auth_session_id uuid, attempt_token uuid, push_token text, event_title text)
language sql volatile security invoker set search_path = '' as $$
  with eligible as (
    select delivery.notification_id, delivery.auth_session_id, device.expo_push_token, event.title
    from public.notification_deliveries delivery
    join public.notification_inbox notice on notice.id = delivery.notification_id
    join public.push_devices device on device.auth_session_id = delivery.auth_session_id and device.profile_id = notice.profile_id
    join auth.sessions session on session.id = device.auth_session_id
    join public.profiles profile on profile.id = notice.profile_id
    join public.event_occurrences occurrence on occurrence.id = notice.occurrence_id
    join public.events event on event.id = occurrence.event_id
    join public.bookmarks bookmark on bookmark.profile_id = notice.profile_id and bookmark.event_id = event.id
    where delivery.completed_at is null and delivery.attempts < 3 and delivery.retry_after <= now()
      and (session.not_after is null or session.not_after > now())
      and profile.notify_saved_reminders
      and event.status = 'published' and event.visibility in ('public', 'authenticated')
      and occurrence.status = 'scheduled' and occurrence.starts_at > now()
      and coalesce(to_jsonb(event)->>'duplicate_review_status', 'clear') in ('clear', 'released')
    order by occurrence.starts_at, delivery.notification_id, delivery.auth_session_id
    limit 25
    for update of delivery skip locked
  )
  update public.notification_deliveries delivery
  set attempts = delivery.attempts + 1, attempt_token = gen_random_uuid(),
    retry_after = now() + interval '5 minutes'
  from eligible
  where delivery.notification_id = eligible.notification_id and delivery.auth_session_id = eligible.auth_session_id
  returning delivery.notification_id, delivery.auth_session_id, delivery.attempt_token, eligible.expo_push_token, eligible.title;
$$;

create function public.finish_saved_event_delivery(p_notification_id uuid, p_session_id uuid, p_attempt_token uuid)
returns void language sql security invoker set search_path = '' as $$
  update public.notification_deliveries set completed_at = now()
  where notification_id = p_notification_id and auth_session_id = p_session_id
    and attempt_token = p_attempt_token and completed_at is null;
$$;

-- Claim reads session expiry only, with no general Auth-session grant.
alter function public.claim_saved_event_deliveries() security definer;
revoke all on function public.enqueue_saved_event_reminders(), public.claim_saved_event_deliveries(),
  public.finish_saved_event_delivery(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.enqueue_saved_event_reminders(), public.claim_saved_event_deliveries(),
  public.finish_saved_event_delivery(uuid, uuid, uuid) to service_role;

create function public.list_saved_event_notifications(p_id uuid default null)
returns table (id uuid, event_id uuid, occurrence_id uuid, event_title text, created_at timestamptz, read_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select notice.id, event.id, occurrence.id, event.title, notice.created_at, notice.read_at
  from public.notification_inbox notice
  join public.event_occurrences occurrence on occurrence.id = notice.occurrence_id
  join public.events event on event.id = occurrence.event_id
  where p_id is null or notice.id = p_id
  order by notice.created_at desc, notice.id
  limit 100;
$$;
revoke all on function public.list_saved_event_notifications(uuid) from public, anon;
grant execute on function public.list_saved_event_notifications(uuid) to authenticated;

commit;
