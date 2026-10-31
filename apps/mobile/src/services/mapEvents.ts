import type { Event, EventCategory } from '../types/event';

export interface MapBounds {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

export interface MapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

export interface TimeWindow {
  start: Date;
  end: Date;
}

export type MapAvailability = 'available' | 'cancelled' | 'postponed' | 'unavailable';

export interface MapOccurrence {
  occurrenceId: string;
  eventId: string;
  title: string;
  categoryName: string;
  categorySlug: string;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  timezone: string;
  availability: MapAvailability;
  locationName: string | null;
  latitude: number;
  longitude: number;
}

/** A map pin in the shape the existing map components expect, plus the event ID. */
export type MapPinEvent = Event & { eventId: string };

type RpcResult = { data: unknown; error: { message: string } | null };
export type RpcCaller = (fn: string, args: Record<string, unknown>) => PromiseLike<RpcResult>;

const HOUR_MS = 60 * 60 * 1000;
const DEFAULT_LIMIT = 200;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Converts the visible map region into query bounds. Padding widens the box
 * (0.2 = 20% on each side) so small pans don't trigger a new query.
 */
export function regionToBounds(region: MapRegion, padding = 0.2): MapBounds {
  const halfLat = (region.latitudeDelta / 2) * (1 + padding);
  const halfLng = (region.longitudeDelta / 2) * (1 + padding);
  return {
    minLat: clamp(region.latitude - halfLat, -90, 90),
    maxLat: clamp(region.latitude + halfLat, -90, 90),
    minLng: clamp(region.longitude - halfLng, -180, 180),
    maxLng: clamp(region.longitude + halfLng, -180, 180),
  };
}

/** Turns the map's time filter into a real time window. Unknown filters mean "This Week". */
export function timeWindowFor(filter: string, now: Date = new Date()): TimeWindow {
  const start = new Date(now.getTime());
  if (filter === 'Now') {
    return { start, end: new Date(now.getTime() + HOUR_MS) };
  }
  if (filter === 'Today') {
    const midnight = new Date(now.getTime());
    midnight.setHours(24, 0, 0, 0);
    return { start, end: midnight };
  }
  return { start, end: new Date(now.getTime() + 7 * 24 * HOUR_MS) };
}

function getAvailability(eventStatus: string, occurrenceStatus: string): MapAvailability {
  if (eventStatus === 'cancelled' || occurrenceStatus === 'cancelled') return 'cancelled';
  if (eventStatus === 'postponed' || occurrenceStatus === 'postponed') return 'postponed';
  if (eventStatus !== 'published') return 'unavailable';
  return 'available';
}

const isString = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Validates one row from map_occurrences_in_bounds. Returns null for unusable rows. */
export function toMapOccurrence(row: unknown): MapOccurrence | null {
  if (typeof row !== 'object' || row === null) return null;
  const r = row as Record<string, unknown>;

  if (
    !isString(r.occurrence_id)
    || !isString(r.event_id)
    || !isString(r.title)
    || !isString(r.starts_at)
    || !isFiniteNumber(r.latitude)
    || !isFiniteNumber(r.longitude)
  ) {
    return null;
  }

  return {
    occurrenceId: r.occurrence_id,
    eventId: r.event_id,
    title: r.title,
    categoryName: isString(r.category_name) ? r.category_name : '',
    categorySlug: isString(r.category_slug) ? r.category_slug : '',
    startsAt: r.starts_at,
    endsAt: isString(r.ends_at) ? r.ends_at : null,
    allDay: r.all_day === true,
    timezone: isString(r.timezone) ? r.timezone : 'America/New_York',
    availability: getAvailability(String(r.event_status ?? ''), String(r.occurrence_status ?? '')),
    locationName: isString(r.location_name) ? r.location_name : null,
    latitude: r.latitude,
    longitude: r.longitude,
  };
}

/** Loads map occurrences for the given area and time window. */
export async function fetchMapOccurrences(
  rpc: RpcCaller,
  bounds: MapBounds,
  window: TimeWindow,
  limit: number = DEFAULT_LIMIT,
): Promise<MapOccurrence[]> {
  const { data, error } = await rpc('map_occurrences_in_bounds', {
    p_min_lat: bounds.minLat,
    p_min_lng: bounds.minLng,
    p_max_lat: bounds.maxLat,
    p_max_lng: bounds.maxLng,
    p_window_start: window.start.toISOString(),
    p_window_end: window.end.toISOString(),
    p_limit: limit,
  });

  if (error) {
    throw new Error(`Could not load map events: ${error.message}`);
  }
  if (!Array.isArray(data)) return [];

  return data
    .map(toMapOccurrence)
    .filter((occurrence): occurrence is MapOccurrence => occurrence !== null);
}

const CATEGORY_BY_SLUG: Record<string, { category: EventCategory; emoji: string }> = {
  music: { category: 'Arts & Music', emoji: '🎵' },
  'arts-culture': { category: 'Arts & Music', emoji: '🎨' },
  'sports-recreation': { category: 'Sports', emoji: '🏃' },
  'academic-talks': { category: 'Campus', emoji: '🎓' },
  'food-drink': { category: 'Dining', emoji: '🍽️' },
  community: { category: 'Campus', emoji: '🤝' },
  wellness: { category: 'Campus', emoji: '🧘' },
  career: { category: 'Campus', emoji: '💼' },
};

const DEFAULT_CATEGORY = { category: 'Campus' as EventCategory, emoji: '📍' };

export function categoryForSlug(slug: string): { category: EventCategory; emoji: string } {
  return CATEGORY_BY_SLUG[slug] ?? DEFAULT_CATEGORY;
}

function formatInZone(iso: string, timeZone: string, options: Intl.DateTimeFormatOptions): string {
  const date = new Date(iso);
  try {
    return new Intl.DateTimeFormat('en-US', { ...options, timeZone })
      .format(date)
      .replace(/\u202f/g, ' ');
  } catch {
    return new Intl.DateTimeFormat('en-US', options).format(date).replace(/\u202f/g, ' ');
  }
}

/** Converts an occurrence into the Event shape used by the map pins, sheet and list. */
export function toMapPinEvent(occurrence: MapOccurrence): MapPinEvent {
  const { category, emoji } = categoryForSlug(occurrence.categorySlug);
  return {
    id: occurrence.occurrenceId,
    eventId: occurrence.eventId,
    title: occurrence.title,
    category,
    emoji,
    date: formatInZone(occurrence.startsAt, occurrence.timezone, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }),
    time: occurrence.allDay
      ? 'All day'
      : formatInZone(occurrence.startsAt, occurrence.timezone, {
          hour: 'numeric',
          minute: '2-digit',
        }),
    location: occurrence.locationName ?? 'Location TBA',
    latitude: occurrence.latitude,
    longitude: occurrence.longitude,
  };
}