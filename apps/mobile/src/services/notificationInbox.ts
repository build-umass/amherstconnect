import { isCanonicalEventId } from './eventRepository';
import { getSupabase } from './supabase';

export interface SavedEventNotice {
  id: string;
  event_id: string;
  occurrence_id: string;
  event_title: string;
  created_at: string;
  read_at: string | null;
}

export async function listNotices(id?: string): Promise<SavedEventNotice[]> {
  if (id !== undefined && !isCanonicalEventId(id)) return [];
  const { data, error } = await getSupabase().rpc('list_saved_event_notifications', { p_id: id ?? null });
  if (error) throw new Error('Could not load notifications.');
  return Array.isArray(data) ? data.filter(row =>
    isCanonicalEventId(row?.id) && isCanonicalEventId(row?.event_id) && isCanonicalEventId(row?.occurrence_id)
    && typeof row?.event_title === 'string' && typeof row?.created_at === 'string',
  ) : [];
}

export async function markNoticeRead(id: string): Promise<void> {
  if (!isCanonicalEventId(id)) return;
  const { error } = await getSupabase().from('notification_inbox')
    .update({ read_at: new Date().toISOString() }).eq('id', id).is('read_at', null);
  if (error) throw new Error('Could not mark the notification read.');
}
