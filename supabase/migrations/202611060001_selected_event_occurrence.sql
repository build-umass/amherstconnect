-- E06: retrieve an explicitly selected occurrence even outside the details' 20-row window.
create function public.event_detail_occurrence(p_event_id uuid,p_occurrence_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
  'id',o.id,'occurrence_id',o.id,'event_id',e.id,'title',e.title,
  'category_name',c.name,'category_slug',c.slug,'timezone',e.timezone,
  'event_status',e.status,'occurrence_status',o.status,'status',o.status,
  'starts_at',o.starts_at,'ends_at',o.ends_at,'all_day',o.all_day,
  'location_type',o.location_type,'location_name',coalesce(o.location_name,v.name),
  'venue_name',v.name,'room',v.room,'address',null,'virtual_url',o.virtual_url,
  'latitude',extensions.st_y(coalesce(o.coordinates,v.coordinates)::extensions.geometry),
  'longitude',extensions.st_x(coalesce(o.coordinates,v.coordinates)::extensions.geometry))
 from public.event_occurrences o join public.events e on e.id=o.event_id
 join public.categories c on c.id=e.primary_category_id
 left join public.venues v on v.id=o.venue_id
 where e.id=p_event_id and o.id=p_occurrence_id;
$$;
revoke all on function public.event_detail_occurrence(uuid,uuid) from public,anon;
grant execute on function public.event_detail_occurrence(uuid,uuid) to authenticated;
