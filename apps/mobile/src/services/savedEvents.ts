import type { BookmarkRepository } from '../types/bookmark';

/** Contract implemented by E02. */
export interface BookmarkEventRepository<TEvent> {
  getByIds(eventIds: string[]): Promise<TEvent[]>;
  getId(event: TEvent): string;
}

/** Joins bookmarks through E02 repository. */
export async function loadSavedEvents<TEvent>(
  bookmarks: BookmarkRepository,
  events: BookmarkEventRepository<TEvent>,
): Promise<TEvent[]> {
  const saved = await bookmarks.list();
  const eventIds = saved.map(({ eventId }) => eventId);
  if (eventIds.length === 0) return [];

  const resolved = await events.getByIds(eventIds);
  const byId = new Map(resolved.map((event) => [events.getId(event), event]));
  return eventIds
    .map((eventId) => byId.get(eventId))
    .filter((event): event is TEvent => event !== undefined);
}
