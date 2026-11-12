// E02: turns repository results into what the screens show, and holds the
// Home feed's state rules (loading, error, empty, load more). Plain TypeScript
// so it can be tested with node --test.

import type { Event, EventCategory } from '../types/event';
import type { FeedCursor, FeedFilters, FeedItem, FeedPage } from './eventRepository';

function formatInZone(iso: string, timeZone: string, options: Intl.DateTimeFormatOptions): string {
  const date = new Date(iso);
  try {
    return new Intl.DateTimeFormat('en-US', { ...options, timeZone }).format(date).replace(/ /g, ' ');
  } catch {
    return new Intl.DateTimeFormat('en-US', options).format(date).replace(/ /g, ' ');
  }
}

export function formatEventDate(startsAt: string, timeZone: string): string {
  return formatInZone(startsAt, timeZone, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function formatEventTime(startsAt: string, timeZone: string, allDay: boolean): string {
  return allDay ? 'All day' : formatInZone(startsAt, timeZone, { hour: 'numeric', minute: '2-digit' });
}

/** A feed row in the Event shape EventCard and Event Details already use. */
export type FeedCardEvent = Event & {
  occurrenceId: string;
  startsAt: string;
  endsAt: string | null;
  timezone: string;
};

/** How a category looks on a card. Pass `categoryForSlug(item.categorySlug)` from mapEvents. */
export interface CardCategoryStyle {
  category: EventCategory;
  emoji: string;
}

/**
 * `id` is the canonical event ID, so Event Details, Map highlight and
 * bookmarks all point at the same event.
 */
export function toFeedCardEvent(item: FeedItem, style: CardCategoryStyle): FeedCardEvent {
  const { category, emoji } = style;
  return {
    id: item.eventId,
    occurrenceId: item.occurrenceId,
    title: item.title,
    category,
    emoji,
    date: formatEventDate(item.startsAt, item.timezone),
    time: formatEventTime(item.startsAt, item.timezone, item.allDay),
    location: item.locationName ?? (item.locationType === 'virtual' ? 'Online' : 'Location TBA'),
    organizer: item.organizerName ?? undefined,
    isFree: item.isFree,
    latitude: item.latitude ?? undefined,
    longitude: item.longitude ?? undefined,
    startsAt: item.startsAt,
    endsAt: item.endsAt,
    timezone: item.timezone,
  };
}

// ── Feed state ───────────────────────────────────────────────────────────────

export type FeedStatus = 'loading' | 'ready' | 'empty' | 'error';

export interface FeedState {
  status: FeedStatus;
  items: FeedItem[];
  nextCursor: FeedCursor | null;
  /** First-page error. While set, status is 'error' and items are empty. */
  error: string | null;
  loadingMore: boolean;
  /** A failed "load more" keeps the items already shown. */
  loadMoreError: string | null;
  /** Increases on every new query, so late answers to old queries are ignored. */
  requestId: number;
}

export type FeedAction =
  | { type: 'start'; requestId: number }
  | { type: 'loaded'; requestId: number; page: FeedPage }
  | { type: 'failed'; requestId: number; error: string }
  | { type: 'moreStart'; requestId: number }
  | { type: 'moreLoaded'; requestId: number; page: FeedPage }
  | { type: 'moreFailed'; requestId: number; error: string };

export const initialFeedState: FeedState = {
  status: 'loading',
  items: [],
  nextCursor: null,
  error: null,
  loadingMore: false,
  loadMoreError: null,
  requestId: 0,
};

export function feedReducer(state: FeedState, action: FeedAction): FeedState {
  if (action.type === 'start') {
    return { ...initialFeedState, requestId: action.requestId };
  }
  // Ignore answers to a query the user has already replaced (new filter, search, refresh).
  if (action.requestId !== state.requestId) return state;

  switch (action.type) {
    case 'loaded':
      return {
        ...state,
        status: action.page.items.length > 0 ? 'ready' : 'empty',
        items: action.page.items,
        nextCursor: action.page.nextCursor,
        error: null,
      };
    case 'failed':
      // No fallback data: the screen shows the error and a retry.
      return { ...state, status: 'error', items: [], nextCursor: null, error: action.error };
    case 'moreStart':
      return { ...state, loadingMore: true, loadMoreError: null };
    case 'moreLoaded': {
      const seen = new Set(state.items.map(item => item.eventId));
      const added = action.page.items.filter(item => !seen.has(item.eventId));
      const items = [...state.items, ...added];
      return {
        ...state,
        status: items.length > 0 ? 'ready' : 'empty',
        items,
        nextCursor: action.page.nextCursor,
        loadingMore: false,
      };
    }
    case 'moreFailed':
      return { ...state, loadingMore: false, loadMoreError: action.error };
    default:
      return state;
  }
}

/** True when "load more" should run: a next page exists and nothing is loading. */
export function canLoadMore(state: FeedState): boolean {
  return state.status === 'ready' && state.nextCursor !== null && !state.loadingMore;
}

// ── Filters (E04) ────────────────────────────────────────────────────────────
// Screens build new filter arrays and dates on every render. useEventFeed
// compares filters by this key instead, so the feed only reloads when a value
// really changes.

/** The feed filters as one comparable string. Search is trimmed. */
export function feedFiltersKey(filters: FeedFilters): string {
  return JSON.stringify({
    categorySlugs: filters.categorySlugs ?? [],
    organizationIds: filters.organizationIds ?? [],
    isFree: filters.isFree ?? null,
    search: (filters.search ?? '').trim(),
    from: filters.from ? filters.from.getTime() : null,
    until: filters.until ? filters.until.getTime() : null,
  });
}

/** Turns a feedFiltersKey string back into filters. */
export function feedFiltersFromKey(key: string): FeedFilters {
  const parsed = JSON.parse(key);
  return {
    categorySlugs: parsed.categorySlugs,
    organizationIds: parsed.organizationIds,
    isFree: parsed.isFree,
    search: parsed.search,
    from: parsed.from === null ? null : new Date(parsed.from),
    until: parsed.until === null ? null : new Date(parsed.until),
  };
}
