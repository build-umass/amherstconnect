import type { SupabaseClient } from '@supabase/supabase-js';
import type { Bookmark, BookmarkRepository } from '../types/bookmark';

type BookmarkClient = Pick<SupabaseClient, 'auth' | 'from'>;

/** Extracts a readable error message. */
function messageOf(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.length > 0) return message;
  }
  return 'Unknown error';
}

/** Extracts a database error code. */
function codeOf(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : null;
  }
  return null;
}

/** Requires an authenticated Supabase user. */
async function requireUserId(client: BookmarkClient): Promise<string> {
  const { data, error } = await client.auth.getUser();
  if (error) throw new Error(`Could not verify bookmark session: ${messageOf(error)}`);
  if (!data.user) throw new Error('Sign in to manage bookmarks.');
  return data.user.id;
}

/** Maps one database bookmark row. */
function toBookmark(row: Record<string, unknown>): Bookmark | null {
  if (
    typeof row.profile_id !== 'string'
    || typeof row.event_id !== 'string'
    || typeof row.created_at !== 'string'
    || typeof row.updated_at !== 'string'
  ) {
    return null;
  }
  return {
    profileId: row.profile_id,
    eventId: row.event_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Creates repository around authenticated Supabase client. */
export function createBookmarkRepository(client: BookmarkClient): BookmarkRepository {
  return {
    /** Saves one event without duplicates. */
    async save(eventId) {
      const profileId = await requireUserId(client);
      const { error } = await client.from('bookmarks').insert({
        profile_id: profileId,
        event_id: eventId,
      });

      // The composite primary key makes an already-saved event a successful no-op.
      if (error && codeOf(error) !== '23505') {
        throw new Error(`Could not save event: ${messageOf(error)}`);
      }
    },

    /** Removes one saved event. */
    async remove(eventId) {
      const profileId = await requireUserId(client);
      const { error } = await client
        .from('bookmarks')
        .delete()
        .eq('profile_id', profileId)
        .eq('event_id', eventId);
      if (error) throw new Error(`Could not remove saved event: ${messageOf(error)}`);
    },

    /** Checks whether one event is saved. */
    async isSaved(eventId) {
      const profileId = await requireUserId(client);
      const { data, error } = await client
        .from('bookmarks')
        .select('event_id')
        .eq('profile_id', profileId)
        .eq('event_id', eventId)
        .maybeSingle();
      if (error) throw new Error(`Could not load bookmark state: ${messageOf(error)}`);
      return data !== null;
    },

    /** Lists saved events newest first. */
    async list() {
      const profileId = await requireUserId(client);
      const { data, error } = await client
        .from('bookmarks')
        .select('profile_id,event_id,created_at,updated_at')
        .eq('profile_id', profileId)
        .order('created_at', { ascending: false });
      if (error) throw new Error(`Could not load saved events: ${messageOf(error)}`);
      if (!Array.isArray(data)) return [];
      return data
        .map((row: unknown) =>
          typeof row === 'object' && row !== null
            ? toBookmark(row as Record<string, unknown>)
            : null)
        .filter((bookmark): bookmark is Bookmark => bookmark !== null);
    },
  };
}
