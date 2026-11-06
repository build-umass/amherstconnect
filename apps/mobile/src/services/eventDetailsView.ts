// E06: decides what Event Details shows and where "View on Map" goes.
// Plain TypeScript (type-only imports) so it can be tested with node --test.

import type { Event, EventCategory } from '../types/event';
import type { EventDetail, EventDetailOccurrence } from './eventRepository';

/** Everything the Event Details screen renders. */
export type DetailViewEvent = Event & {
  status: 'published' | 'cancelled' | 'postponed';
  officialUrl: string | null;
  /** Start of the time shown, so the map can pick the right pin. */
  startsAt: string | null;
  occurrenceId?: string | null;
  occurrenceStatus?: string;
};

export interface CategoryLook {
  category: EventCategory;
  emoji: string;
}

export type DetailLoadStatus = 'loading' | 'ready' | 'not-found' | 'error';

export type DetailScreenState =
  | { kind: 'show'; event: DetailViewEvent; refreshing: boolean }
  | { kind: 'loading' }
  | { kind: 'not-found' }
  | { kind: 'error'; message: string };

/** Route params: an ID, the card the user tapped, or both. */
export type EventDetailParams =
  | { eventId: string; event?: Event; occurrenceId?: string }
  | { event: Event; eventId?: string; occurrenceId?: string };


export function eventIdFromParams(params: EventDetailParams | undefined): string | null {
  if (!params) return null;
  return params.eventId ?? params.event?.id ?? null;
}

/** The time to show: the next scheduled one, else the first listed (e.g. cancelled or past). */
export function pickDisplayOccurrence(occurrences: EventDetailOccurrence[], selectedId?: string | null): EventDetailOccurrence | null {
  if (selectedId) return occurrences.find(o => o.id === selectedId) ?? null;
  return occurrences.find(o => o.status === 'scheduled') ?? occurrences[0] ?? null;
}

function formatInZone(iso: string, timeZone: string, options: Intl.DateTimeFormatOptions): string {
  const date = new Date(iso);
  try {
    return new Intl.DateTimeFormat('en-US', { ...options, timeZone }).format(date).replace(/ /g, ' ');
  } catch {
    return new Intl.DateTimeFormat('en-US', options).format(date).replace(/ /g, ' ');
  }
}

function locationLabel(o: EventDetailOccurrence | null): string {
  if (!o) return 'Location TBA';
  if (o.locationType === 'virtual') return 'Online';
  const name = o.locationName ?? o.venueName;
  if (!name) return 'Location TBA';
  return o.room && !name.includes(o.room) ? `${name}, Room ${o.room}` : name;
}

/** Converts a Supabase event into what the screen shows. */
export function detailToViewEvent(detail: EventDetail, look: CategoryLook, selectedId?: string | null): DetailViewEvent {
  const occurrence = pickDisplayOccurrence(detail.occurrences, selectedId);
  const status = detail.status === 'cancelled' || detail.status === 'postponed' ? detail.status : 'published';
  return {
    id: detail.eventId,
    title: detail.title,
    category: look.category,
    emoji: look.emoji,
    date: occurrence
      ? formatInZone(occurrence.startsAt, detail.timezone, { weekday: 'short', month: 'short', day: 'numeric' })
      : 'Date TBA',
    time: !occurrence
      ? 'Time TBA'
      : occurrence.allDay
        ? 'All day'
        : formatInZone(occurrence.startsAt, detail.timezone, { hour: 'numeric', minute: '2-digit' }),
    location: locationLabel(occurrence),
    description: detail.description ?? undefined,
    organizer: detail.organizerName ?? undefined,
    isFree: detail.isFree,
    latitude: occurrence?.latitude ?? undefined,
    longitude: occurrence?.longitude ?? undefined,
    status,
    officialUrl: detail.officialUrl,
    startsAt: occurrence?.startsAt ?? null,
    occurrenceId: occurrence?.id ?? null,
    occurrenceStatus: occurrence?.status,
  };
}

/** A card passed from Home/Profile, shown while loading or for old non-Supabase events. */
export function cardToViewEvent(event: Event): DetailViewEvent {
  const startsAt = (event as Event & { startsAt?: unknown }).startsAt;
  return {
    ...event,
    status: 'published',
    officialUrl: null,
    startsAt: typeof startsAt === 'string' ? startsAt : null,
  };
}

/**
 * What the screen should show.
 * - Loaded from Supabase: the real event.
 * - Still loading but a card was passed: show the card right away.
 * - Canonical not-found and error results always replace the preview.
 * - Nothing to show: loading, not found or error.
 */
export function resolveDetailScreen(input: {
  selectedOccurrenceId?: string | null;
  status: DetailLoadStatus;
  detail: EventDetail | null;
  card: Event | undefined;
  error: string | null;
  look: (categorySlug: string) => CategoryLook;
}): DetailScreenState {
  const { status, detail, card, error, look } = input;
  if (status === 'ready' && detail) {
    if (input.selectedOccurrenceId && !detail.occurrences.some(o => o.id === input.selectedOccurrenceId)) return { kind: 'not-found' };
    return { kind: 'show', event: detailToViewEvent(detail, look(detail.categorySlug), input.selectedOccurrenceId), refreshing: false };
  }
  if (card && status === 'loading') {
    return { kind: 'show', event: cardToViewEvent(card), refreshing: status === 'loading' };
  }
  if (status === 'loading') return { kind: 'loading' };
  if (status === 'error') return { kind: 'error', message: error ?? 'Something went wrong loading this event.' };
  return { kind: 'not-found' };
}

/** Banner text for cancelled or postponed events; null otherwise. */
export function statusBanner(event: DetailViewEvent): string | null {
  if (event.status === 'cancelled') return 'This event has been cancelled.';
  if (event.status === 'postponed') return 'This event has been postponed.';
  return null;
}

export interface MapHighlight {
  highlightedEventId: string;
  highlightedOccurrenceId?: string;
  latitude: number;
  longitude: number;
  startsAt?: string;
  /** Changes on every tap, so tapping View on Map again re-centers the map. */
  highlightRequestId: string | number;
}

/**
 * Where "View on Map" goes, or null to hide the button. Hidden for events
 * with no location (the PRD says those are feed-only) and for cancelled or
 * postponed events, which have no pin.
 */
export function mapHighlightFor(event: DetailViewEvent, requestId: string | number): MapHighlight | null {
  if (event.status !== 'published' || (event.occurrenceStatus && event.occurrenceStatus !== 'scheduled')) return null;
  if (typeof event.latitude !== 'number' || typeof event.longitude !== 'number') return null;
  if (!Number.isFinite(event.latitude) || !Number.isFinite(event.longitude)) return null;
  return {
    highlightedEventId: event.id,
    ...(event.occurrenceId ? { highlightedOccurrenceId: event.occurrenceId } : {}),
    latitude: event.latitude,
    longitude: event.longitude,
    ...(event.startsAt ? { startsAt: event.startsAt } : {}),
    highlightRequestId: requestId,
  };
}

/** Map pins use the occurrence ID as `id`; Event Details needs the event ID. */
export function eventIdForPin<T extends { id: string; eventId: string }>(pins: T[], pinId: string): string | null {
  return pins.find(pin => pin.id === pinId)?.eventId ?? null;
}

let highlightSequence = 0;
/** Module lifetime spans screen mounts; each user action gets a distinct identity. */
export function newHighlightRequestId(): string {
  return `${Date.now().toString(36)}:${++highlightSequence}`;
}
export function occurrenceIdFromParams(params: EventDetailParams | undefined): string | null {
  return params?.occurrenceId ?? (params?.event as (Event & { occurrenceId?: string }) | undefined)?.occurrenceId ?? null;
}

export function detailsParamsForPin<T extends Event & { eventId: string }>(pins: T[], pinId: string): EventDetailParams | null {
  const pin = pins.find(p => p.id === pinId);
  return pin ? { eventId: pin.eventId, occurrenceId: pin.id, event: { ...pin, id: pin.eventId } } : null;
}
