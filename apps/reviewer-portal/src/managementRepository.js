export function createManagementRepository(client, { getSessionUserId } = {}) {
  async function checked(request) {
    const actor = getSessionUserId?.();
    const access = await client.rpc('is_content_reviewer');
    if (access.error || access.data !== true) throw new Error('Reviewer access required.');
    if (getSessionUserId && (!actor || actor !== getSessionUserId())) throw new Error('Your session changed. Sign in again.');
    const { data, error } = await request();
    if (error) {
      if (error.code === '42501') throw new Error('This action is not allowed for your account.');
      if (error.code === 'P0002') throw new Error('The published event is no longer available. Refresh the list.');
      throw new Error('The request could not be completed. Check your connection and try again.');
    }
    return data;
  }

  return {
    organizers: () => checked(() => client.from('organizers')
      .select('id,name,active,approved_at,posting_revoked_at,posting_revocation_reason,organizer_publishing_settings(weekly_cap)')
      .not('approved_at', 'is', null).order('created_at', { ascending: false }).order('id').limit(500)),
    contact: id => checked(() => client.from('organization_contacts').select('contact_email').eq('organizer_id', id).maybeSingle()),
    events: () => checked(() => client.from('events').select('id,title,organizer_id,organizers(name),status,updated_at')
      .eq('source_type', 'amherst_connect').not('organizer_id', 'is', null).eq('status', 'published')
      .order('updated_at', { ascending: false }).order('id').limit(500)),
    audit: organizerId => checked(() => {
      let query = client.from('audit_log').select('id,actor_profile_id,action,organizer_id,organizer_application_id,event_id,created_at');
      if (organizerId) query = query.eq('organizer_id', organizerId);
      return query.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(500);
    }),
    removeEvent: id => checked(() => client.rpc('remove_organizer_event', { p_event_id: id })),
  };
}
