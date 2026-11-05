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

/** A map pin in the shape the existing map components expect, plus map-only fields. */
export type MapPinEvent = Event & { eventId: string; pinColor: string };

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

/**
 * For "View on Map": keep the current time filter if it includes the event's
 * start, otherwise switch to "This Week" so the pin can load.
 */
export function filterIncludingStart<F extends string>(
  current: F,
  startsAt: string,
  now: Date = new Date(),
): F | 'This Week' {
  const start = Date.parse(startsAt);
  if (Number.isNaN(start)) return current;
  const window = timeWindowFor(current, now);
  return start < window.end.getTime() ? current : 'This Week';
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

// ── Categories (agreed list: Kushagra + Camila) ──────────────────────────────

export interface CategoryStyle {
  category: EventCategory;
  emoji: string;
  color: string;
}

const CATEGORY_BY_SLUG: Record<string, CategoryStyle> = {
  'talks-lectures':    { category: 'Talks & Lectures',    emoji: '🎤', color: '#2E61C7' },
  'workshops-classes': { category: 'Workshops & Classes', emoji: '🛠️', color: '#0F7B6C' },
  'arts-culture':      { category: 'Arts & Culture',      emoji: '🎨', color: '#BD1479' },
  'sports-recreation': { category: 'Sports & Recreation', emoji: '🏃', color: '#2E8B3D' },
  'career-networking': { category: 'Career & Networking', emoji: '💼', color: '#5B2A8A' },
  'health-wellness':   { category: 'Health & Wellness',   emoji: '🧘', color: '#0E8FA8' },
  'social-community':  { category: 'Social & Community',  emoji: '🤝', color: '#98190B' },
  'food-drink':        { category: 'Food & Drink',        emoji: '🍽️', color: '#C45C00' },
};

export const MAP_CATEGORY_SLUGS = Object.keys(CATEGORY_BY_SLUG);

/** Used only if the importer ever produces a slug outside the agreed list. */
const DEFAULT_CATEGORY: CategoryStyle = {
  category: 'Social & Community',
  emoji: '📍',
  color: '#8B1A1A',
};

export function categoryForSlug(slug: string): CategoryStyle {
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
  const { category, emoji, color } = categoryForSlug(occurrence.categorySlug);
  return {
    id: occurrence.occurrenceId,
    eventId: occurrence.eventId,
    pinColor: color,
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

// ── Selection and highlight rules (fixes 3 and 4) ────────────────────────────

/**
 * After pins reload: close the open card if its pin disappeared, otherwise
 * return the fresh pin so the card shows updated details.
 */
export function reconcileSelection<T extends { id: string }>(selected: T | null, pins: T[]): T | null {
  if (!selected) return null;
  return pins.find(pin => pin.id === selected.id) ?? null;
}

/**
 * Returns the pin to center on for a highlighted event, or null if there is
 * nothing to do. A highlight is centered only once, so reloads after the user
 * pans away don't pull the map back.
 */
export function findHighlightToCenter<T extends { eventId: string; latitude?: number; longitude?: number }>(
  highlightedEventId: string | null | undefined,
  alreadyCenteredEventId: string | null,
  pins: T[],
): T | null {
  if (!highlightedEventId || highlightedEventId === alreadyCenteredEventId) return null;
  return (
    pins.find(
      pin =>
        pin.eventId === highlightedEventId
        && typeof pin.latitude === 'number'
        && typeof pin.longitude === 'number',
    ) ?? null
  );
}