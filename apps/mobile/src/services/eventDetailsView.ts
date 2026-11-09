// E06: decides what Event Details shows and where "View on Map" goes.
// E03: also turns the rest of the E02 event (end time, address, join link,
// registration link, image, other dates) into what the screen shows.
// Plain TypeScript (type-only imports) so it can be tested with node --test.

import type { Event, EventCategory } from '../types/event';
import type { EventDetail, EventDetailOccurrence } from './eventRepository';

/** Another time the same event happens, for the "More dates" list. */
export interface DetailDate {
  id: string;
  /** e.g. "Tue, Nov 17 · 7:30 PM", with " · Cancelled" when it isn't happening. */
  label: string;
  status: EventDetailOccurrence['status'];
}

/**
 * Everything the Event Details screen renders. The optional fields come from
 * the full E02 event, so a card shown while loading doesn't have them yet.
 */
export type DetailViewEvent = Event & {
  status: 'published' | 'cancelled' | 'postponed';
  officialUrl: string | null;
  /** Sign-up or ticket page. */
  registrationUrl?: string | null;
  imageUrl?: string | null;
  locationType?: EventDetailOccurrence['locationType'];
  /** Venue street address, when known. */
  address?: string | null;
  /** What "Get directions" searches for: the place name and address. Null when there is no place. */
  directionsQuery?: string | null;
  /** Join link for online and hybrid events. */
  virtualUrl?: string | null;
  /** The event's other times, soonest first, without the one shown. */
  moreDates?: DetailDate[];
  /** The time shown is over, e.g. an old saved event with no upcoming times. */
  ended?: boolean;
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

const DATE_FORMAT: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' };
const TIME_FORMAT: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
const CALENDAR_DAY: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'numeric', day: 'numeric' };

/**
 * The time row: "6:00 PM – 7:30 PM", "7:00 PM – Sat, Dec 6, 1:00 AM" when it
 * ends on a later day, the start alone when there's no usable end, or "All day".
 */
export function formatTimeRange(
  o: Pick<EventDetailOccurrence, 'startsAt' | 'endsAt' | 'allDay'>,
  timeZone: string,
): string {
  if (o.allDay) return 'All day';
  const start = formatInZone(o.startsAt, timeZone, TIME_FORMAT);
  if (!o.endsAt || !(Date.parse(o.endsAt) > Date.parse(o.startsAt))) return start;
  const sameDay = formatInZone(o.startsAt, timeZone, CALENDAR_DAY) === formatInZone(o.endsAt, timeZone, CALENDAR_DAY);
  const end = formatInZone(o.endsAt, timeZone, sameDay ? TIME_FORMAT : { ...DATE_FORMAT, ...TIME_FORMAT });
  return `${start} – ${end}`;
}

/** "Room 101" for a bare room number; names like "Auditorium" stay as they are. */
function roomLabel(room: string): string {
  return /^\d/.test(room) ? `Room ${room}` : room;
}

function locationLabel(o: EventDetailOccurrence | null): string {
  if (!o) return 'Location TBA';
  if (o.locationType === 'virtual') return 'Online';
  const name = o.locationName ?? o.venueName;
  if (!name) return 'Location TBA';
  return o.room && !name.includes(o.room) ? `${name}, ${roomLabel(o.room)}` : name;
}

/** The place name and address, for the maps app. Null for online-only or unknown places. */
function directionsQueryFor(o: EventDetailOccurrence | null): string | null {
  if (!o || o.locationType === 'virtual') return null;
  const parts = [o.locationName ?? o.venueName, o.address].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(', ') : null;
}

const STATUS_NOTE: Partial<Record<EventDetailOccurrence['status'], string>> = {
  cancelled: 'Cancelled',
  postponed: 'Postponed',
};

/** The event's other times for "More dates", soonest first. */
function moreDatesFor(detail: EventDetail, shown: EventDetailOccurrence | null): DetailDate[] {
  return detail.occurrences
    .filter(o => o.id !== shown?.id)
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
    .map(o => {
      const when = `${formatInZone(o.startsAt, detail.timezone, DATE_FORMAT)} · ${
        o.allDay ? 'All day' : formatInZone(o.startsAt, detail.timezone, TIME_FORMAT)
      }`;
      const note = STATUS_NOTE[o.status];
      return { id: o.id, label: note ? `${when} · ${note}` : when, status: o.status };
    });
}

/** E02's "not over yet" rule, reversed: ended at its end time, or at its start when it has none. */
function isOver(o: EventDetailOccurrence, now: Date): boolean {
  return o.endsAt ? Date.parse(o.endsAt) <= now.getTime() : Date.parse(o.startsAt) < now.getTime();
}

/** Converts a Supabase event into what the screen shows. */
export function detailToViewEvent(
  detail: EventDetail,
  look: CategoryLook,
  selectedId?: string | null,
  now: Date = new Date(),
): DetailViewEvent {
  const occurrence = pickDisplayOccurrence(detail.occurrences, selectedId);
  const status = detail.status === 'cancelled' || detail.status === 'postponed' ? detail.status : 'published';
  return {
    id: detail.eventId,
    title: detail.title,
    category: look.category,
    emoji: look.emoji,
    date: occurrence ? formatInZone(occurrence.startsAt, detail.timezone, DATE_FORMAT) : 'Date TBA',
    time: occurrence ? formatTimeRange(occurrence, detail.timezone) : 'Time TBA',
    location: locationLabel(occurrence),
    description: detail.description ?? undefined,
    organizer: detail.organizerName ?? undefined,
    isFree: detail.isFree,
    latitude: occurrence?.latitude ?? undefined,
    longitude: occurrence?.longitude ?? undefined,
    status,
    officialUrl: detail.officialUrl,
    registrationUrl: detail.registrationUrl,
    imageUrl: detail.imageUrl,
    locationType: occurrence?.locationType,
    address: occurrence?.locationType === 'virtual' ? null : (occurrence?.address ?? null),
    directionsQuery: directionsQueryFor(occurrence),
    virtualUrl: occurrence?.virtualUrl ?? null,
    moreDates: moreDatesFor(detail, occurrence),
    ended: occurrence ? isOver(occurrence, now) : false,
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
  now?: Date;
}): DetailScreenState {
  const { status, detail, card, error, look } = input;
  if (status === 'ready' && detail) {
    if (input.selectedOccurrenceId && !detail.occurrences.some(o => o.id === input.selectedOccurrenceId)) return { kind: 'not-found' };
    return {
      kind: 'show',
      event: detailToViewEvent(detail, look(detail.categorySlug), input.selectedOccurrenceId, input.now),
      refreshing: false,
    };
  }
  if (card && status === 'loading') {
    return { kind: 'show', event: cardToViewEvent(card), refreshing: status === 'loading' };
  }
  if (status === 'loading') return { kind: 'loading' };
  if (status === 'error') return { kind: 'error', message: error ?? 'Something went wrong loading this event.' };
  return { kind: 'not-found' };
}

/**
 * Banner text when the event, or just the date shown, is cancelled, postponed
 * or over; null otherwise.
 */
export function statusBanner(event: DetailViewEvent): string | null {
  if (event.status === 'cancelled') return 'This event has been cancelled.';
  if (event.status === 'postponed') return 'This event has been postponed.';
  if (event.occurrenceStatus === 'cancelled') return 'This date has been cancelled.';
  if (event.occurrenceStatus === 'postponed') return 'This date has been postponed.';
  // E02 only lists upcoming times, plus the last past one when none are left.
  if (event.ended) return event.moreDates?.length ? 'This date has passed.' : 'This event has ended.';
  return null;
}

/** True unless the event or the date shown is cancelled or postponed. */
export function isHappening(event: Pick<DetailViewEvent, 'status' | 'occurrenceStatus'>): boolean {
  return event.status === 'published' && (!event.occurrenceStatus || event.occurrenceStatus === 'scheduled');
}

/** True while people can still sign up for or join the time shown: it's on and not over. */
export function canAttend(event: Pick<DetailViewEvent, 'status' | 'occurrenceStatus' | 'ended'>): boolean {
  return isHappening(event) && !event.ended;
}

export interface DetailLink {
  label: 'Register' | 'Get tickets' | 'Event page';
  url: string;
}

/**
 * The footer link. In-app RSVP isn't offered, so people sign up on the event's
 * registration page: "Get tickets" for paid events, "Register" otherwise. Falls
 * back to the official event page, which is also the only link offered once
 * the event or date is cancelled, postponed or over. Null when there is no link.
 */
export function primaryLink(
  event: Pick<DetailViewEvent, 'status' | 'occurrenceStatus' | 'ended' | 'registrationUrl' | 'officialUrl' | 'isFree'>,
): DetailLink | null {
  if (event.registrationUrl && canAttend(event)) {
    return { label: event.isFree === false ? 'Get tickets' : 'Register', url: event.registrationUrl };
  }
  return event.officialUrl ? { label: 'Event page', url: event.officialUrl } : null;
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
  if (!isHappening(event)) return null;
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
