import type { BookmarkRepository } from '../types/bookmark';
import type { EventDetail, EventRepository } from './eventRepository';

/** Loads bookmarked events through E02, newest bookmark first. */
export async function loadSavedEvents<TEvent>(
  bookmarks: Pick<BookmarkRepository, 'list'>,
  events: Pick<EventRepository, 'getEventById'>,
  toEvent: (detail: EventDetail) => TEvent,
): Promise<TEvent[]> {
  const saved = await bookmarks.list();
  const details = await Promise.all(saved.map(({ eventId }) => events.getEventById(eventId)));

  // E02 returns null for deleted or hidden events, so they drop out of the list.
  return details
    .filter((detail): detail is EventDetail => detail !== null)
    .map(toEvent);
}
