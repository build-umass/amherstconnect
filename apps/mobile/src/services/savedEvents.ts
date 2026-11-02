import type { CanonicalEvent } from '../../../../shared/contracts/event';
import type { BookmarkRepository } from '../types/bookmark';

/** Contract implemented by E02. */
export interface BookmarkEventRepository {
  getByIds(eventIds: string[]): Promise<CanonicalEvent[]>;
}

/** Joins bookmarks through E02 repository. */
export async function loadSavedEvents(
  bookmarks: BookmarkRepository,
  events: BookmarkEventRepository,
): Promise<CanonicalEvent[]> {
  const saved = await bookmarks.list();
  const eventIds = saved.map(({ eventId }) => eventId);
  if (eventIds.length === 0) return [];

  const resolved = await events.getByIds(eventIds);
  const byId = new Map(resolved.map((event) => [event.event.id, event]));
  return eventIds
    .map((eventId) => byId.get(eventId))
    .filter((event): event is CanonicalEvent => event !== undefined);
}
