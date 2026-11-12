// E02: the one place the app reads events from. Screens (Home, Search, Event
// Details, and later Map/bookmarks) use the EventRepository interface, not the
// database, so the backend can change without touching them.
//
// Every ID here is a canonical Supabase ID. Times are UTC ISO strings plus the
// event's IANA timezone; formatting for display happens in eventFeed.ts.

import type { EventStatus, LocationType, OccurrenceStatus } from '../../../../shared/contracts/event';

/**
 * Different filters combine with AND; the values in one list combine with OR.
 * Empty or missing filters are ignored.
 */
export interface FeedFilters {
  /** Category slugs, e.g. ['food-drink']. Empty means all categories. */
  categorySlugs?: string[] | null;
  /** Organization IDs from listOrganizations. Empty means all organizations. */
  organizationIds?: string[] | null;
  /** True for free events, false for paid events, null for either. */
  isFree?: boolean | null;
  /** Matches title, location and organizer. Empty means no search. */
  search?: string | null;
  /** Show events that are not over at this time. Missing means now. */
  from?: Date | null;
  /** Only events starting before this time. Missing means no end. */
  until?: Date | null;
}

/** Points at the last row received; pass it back to get the next page. */
export interface FeedCursor {
  startsAt: string;
  eventId: string;
}

/** One Home/Search row: an event at its next available time. */
export interface FeedItem {
  eventId: string;
  occurrenceId: string;
  title: string;
  categoryName: string;
  categorySlug: string;
  organizerName: string | null;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  timezone: string;
  locationType: LocationType;
  locationName: string | null;
  latitude: number | null;
  longitude: number | null;
  isFree: boolean;
  imageUrl: string | null;
}

export interface FeedPage {
  items: FeedItem[];
  /** Null when there are no more pages. */
  nextCursor: FeedCursor | null;
}

export interface EventDetailOccurrence {
  id: string;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  status: OccurrenceStatus;
  locationType: LocationType;
  locationName: string | null;
  venueName: string | null;
  room: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  virtualUrl: string | null;
}

export interface EventDetail {
  eventId: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  /** 'published', 'cancelled' or 'postponed'. Others are never returned. */
  status: EventStatus;
  timezone: string;
  isFree: boolean;
  /** The official event page: the source listing, else the registration page. */
  officialUrl: string | null;
  registrationUrl: string | null;
  categoryName: string;
  categorySlug: string;
  organizerName: string | null;
  organizerUrl: string | null;
  /** Upcoming times (up to 20), or the latest past one if none are left. */
  occurrences: EventDetailOccurrence[];
}

/** A choice for the organization filter. */
export interface OrganizationOption {
  id: string;
  name: string;
}

export interface EventRepository {
  listFeed(filters?: FeedFilters, cursor?: FeedCursor | null, limit?: number): Promise<FeedPage>;
  /** Organizations with upcoming events, sorted by name. */
  listOrganizations(): Promise<OrganizationOption[]>;
  /** Null when the event doesn't exist or the user can't see it. */
  getEventById(eventId: string, occurrenceId?: string | null): Promise<EventDetail | null>;
}

/** Thrown when the backend fails, so screens can show an error state. */
export class EventQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EventQueryError';
  }
}

type RpcResult = { data: unknown; error: { message: string } | null };
export type RpcCaller = (fn: string, args: Record<string, unknown>) => PromiseLike<RpcResult>;

export const DEFAULT_FEED_LIMIT = 20;
const MAX_FEED_LIMIT = 100;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EVENT_STATUSES = new Set(['published', 'cancelled', 'postponed', 'draft', 'archived']);
const OCCURRENCE_STATUSES = new Set(['scheduled', 'cancelled', 'postponed']);
const LOCATION_TYPES = new Set(['physical', 'virtual', 'hybrid']);

export function isCanonicalEventId(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

const isString = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const optionalString = (value: unknown): string | null => (isString(value) ? value : null);
const optionalNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
const locationTypeOf = (value: unknown): LocationType =>
  (LOCATION_TYPES.has(String(value)) ? value : 'physical') as LocationType;

function httpUrl(value: unknown): string | null {
  if (!isString(value)) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? value : null;
  } catch {
    return null;
  }
}

/** Validates one event_feed row. Returns null for rows the app can't use. */
export function toFeedItem(row: unknown): FeedItem | null {
  const r = asRecord(row);
  if (!r) return null;
  if (!isCanonicalEventId(r.event_id) || !isString(r.occurrence_id) || !isString(r.title) || !isString(r.starts_at)) {
    return null;
  }
  const latitude = optionalNumber(r.latitude);
  const longitude = optionalNumber(r.longitude);
  const hasPoint = latitude !== null && longitude !== null;

  return {
    eventId: r.event_id,
    occurrenceId: r.occurrence_id,
    title: r.title,
    categoryName: isString(r.category_name) ? r.category_name : '',
    categorySlug: isString(r.category_slug) ? r.category_slug : '',
    organizerName: optionalString(r.organizer_name),
    startsAt: r.starts_at,
    endsAt: optionalString(r.ends_at),
    allDay: r.all_day === true,
    timezone: isString(r.timezone) ? r.timezone : 'America/New_York',
    locationType: locationTypeOf(r.location_type),
    locationName: optionalString(r.location_name),
    // Only keep coordinates as a pair, so "has a location" is one check.
    latitude: hasPoint ? latitude : null,
    longitude: hasPoint ? longitude : null,
    isFree: r.is_free !== false,
    imageUrl: httpUrl(r.image_url),
  };
}

/** Validates one event_feed_organizations row. */
export function toOrganizationOption(row: unknown): OrganizationOption | null {
  const r = asRecord(row);
  if (!r || !isCanonicalEventId(r.organization_id) || !isString(r.name)) return null;
  return { id: r.organization_id, name: r.name };
}

function toDetailOccurrence(value: unknown): EventDetailOccurrence | null {
  const r = asRecord(value);
  if (!r || !isString(r.id) || !isString(r.starts_at)) return null;
  const latitude = optionalNumber(r.latitude);
  const longitude = optionalNumber(r.longitude);
  const hasPoint = latitude !== null && longitude !== null;
  return {
    id: r.id,
    startsAt: r.starts_at,
    endsAt: optionalString(r.ends_at),
    allDay: r.all_day === true,
    status: (OCCURRENCE_STATUSES.has(String(r.status)) ? r.status : 'scheduled') as OccurrenceStatus,
    locationType: locationTypeOf(r.location_type),
    locationName: optionalString(r.location_name),
    venueName: optionalString(r.venue_name),
    room: optionalString(r.room),
    address: optionalString(r.address),
    latitude: hasPoint ? latitude : null,
    longitude: hasPoint ? longitude : null,
    virtualUrl: httpUrl(r.virtual_url),
  };
}

/** Validates one event_details row. Returns null if it can't be used. */
export function toEventDetail(row: unknown): EventDetail | null {
  const r = asRecord(row);
  if (!r || !isCanonicalEventId(r.event_id) || !isString(r.title)) return null;

  const occurrences = (Array.isArray(r.occurrences) ? r.occurrences : [])
    .map(toDetailOccurrence)
    .filter((o): o is EventDetailOccurrence => o !== null);

  const registrationUrl = httpUrl(r.registration_url);
  return {
    eventId: r.event_id,
    title: r.title,
    description: optionalString(r.description),
    imageUrl: httpUrl(r.image_url),
    status: (EVENT_STATUSES.has(String(r.status)) ? r.status : 'published') as EventStatus,
    timezone: isString(r.timezone) ? r.timezone : 'America/New_York',
    isFree: r.is_free !== false,
    officialUrl: httpUrl(r.source_url) ?? registrationUrl,
    registrationUrl,
    categoryName: isString(r.category_name) ? r.category_name : '',
    categorySlug: isString(r.category_slug) ? r.category_slug : '',
    organizerName: optionalString(r.organizer_name),
    organizerUrl: httpUrl(r.organizer_url),
    occurrences,
  };
}

function clampLimit(limit: number | undefined): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) return DEFAULT_FEED_LIMIT;
  return Math.min(MAX_FEED_LIMIT, Math.max(1, Math.floor(limit)));
}

function cleanText(value: string | null | undefined): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed.length > 0 ? trimmed : null;
}

/** Trimmed, unique, non-blank values, or null when none are left. */
function cleanList(values: string[] | null | undefined): string[] | null {
  const cleaned = [...new Set((values ?? []).map(cleanText).filter((v): v is string => v !== null))];
  return cleaned.length > 0 ? cleaned : null;
}

/** Supabase implementation. `rpc` is getSupabase().rpc, passed in so tests can fake it. */
export function createSupabaseEventRepository(
  rpc: RpcCaller,
  now: () => Date = () => new Date(),
): EventRepository {
  return {
    async listFeed(filters = {}, cursor = null, limit) {
      const pageSize = clampLimit(limit);
      const { data, error } = await rpc('event_feed_filtered', {
        p_from: (filters.from ?? now()).toISOString(),
        p_until: filters.until ? filters.until.toISOString() : null,
        p_category_slugs: cleanList(filters.categorySlugs),
        p_search: cleanText(filters.search),
        p_organization_ids: cleanList(filters.organizationIds),
        p_is_free: filters.isFree ?? null,
        p_after_starts_at: cursor?.startsAt ?? null,
        p_after_event_id: cursor?.eventId ?? null,
        p_limit: pageSize,
      });

      if (error) throw new EventQueryError(`Could not load events: ${error.message}`);
      const rows = Array.isArray(data) ? data : [];
      const items = rows.map(toFeedItem).filter((item): item is FeedItem => item !== null);

      // A full page means there may be more. Use the last raw row for the
      // cursor so a skipped bad row can't make us repeat or stop early.
      const last = asRecord(rows[rows.length - 1]);
      const nextCursor =
        rows.length >= pageSize && last && isString(last.starts_at) && isCanonicalEventId(last.event_id)
          ? { startsAt: last.starts_at, eventId: last.event_id }
          : null;

      return { items, nextCursor };
    },

    async listOrganizations() {
      const { data, error } = await rpc('event_feed_organizations', { p_from: now().toISOString() });
      if (error) throw new EventQueryError(`Could not load organizations: ${error.message}`);
      return (Array.isArray(data) ? data : [])
        .map(toOrganizationOption)
        .filter((option): option is OrganizationOption => option !== null);
    },

    async getEventById(eventId, occurrenceId) {
      // Old mock and Firestore IDs aren't UUIDs; treat them as "not found"
      // instead of sending a query the database would reject.
      if (!isCanonicalEventId(eventId)) return null;

      const { data, error } = await rpc('event_details', {
        p_event_id: eventId,
        p_from: now().toISOString(),
      });
      if (error) throw new EventQueryError(`Could not load event: ${error.message}`);
      const rows = Array.isArray(data) ? data : [];
      const detail = rows.length > 0 ? toEventDetail(rows[0]) : null;
      if (!detail || !occurrenceId) return detail;
      if (!isCanonicalEventId(occurrenceId)) return null;
      if (detail.occurrences.some(o => o.id === occurrenceId)) return detail;
      const selected = await rpc('event_detail_occurrence', { p_event_id: eventId, p_occurrence_id: occurrenceId });
      if (selected.error) throw new EventQueryError(`Could not load occurrence: ${selected.error.message}`);
      const occurrence = toDetailOccurrence(selected.data);
      return occurrence ? { ...detail, occurrences: [...detail.occurrences, occurrence] } : null;
    },
  };
}
