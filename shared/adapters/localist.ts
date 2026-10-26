import {
  validateAdapterEventDraft,
  type AdapterEventDraft,
  type AdapterIssue,
  type AdapterResult,
  type EventSourceAdapter,
  type ProviderRecordInput,
} from '../contracts/event.ts';

export interface LocalistRawRecord {
  id?: string | number;
  title?: string;
  updated_at?: string | null;
  first_date?: string | null;
  last_date?: string | null;
  url?: string | null;
  localist_url?: string | null;
  photo_url?: string | null;
  description?: string | null;
  description_text?: string | null;
  status?: string | null;
  publish_status?: string | null;
  private?: boolean;
  free?: boolean;
  ticket_url?: string | null;
  has_register?: boolean;
  experience?: string | null;
  stream_url?: string | null;
  location?: string | null;
  location_name?: string | null;
  room_number?: string | null;
  address?: string | null;
  venue_id?: string | number | null;
  venue_url?: string | null;
  geo?: { latitude?: number | string | null; longitude?: number | string | null; street?: string | null; city?: string | null; state?: string | null; zip?: string | null; country?: string | null } | null;
  groups?: Array<{ id?: string | number; name?: string }>;
  filters?: unknown;
  event_instances?: Array<{ event_instance?: LocalistRawOccurrence }>;
  [key: string]: unknown;
}

export interface LocalistRawOccurrence {
  id?: string | number;
  event_id?: string | number;
  start?: string;
  end?: string | null;
  all_day?: boolean;
  num_attending?: number | null;
  status?: string | null;
  cancelled?: boolean;
  postponed?: boolean;
  [key: string]: unknown;
}

export interface LocalistApiResponse {
  events?: Array<{ event?: LocalistRawRecord }>;
  page?: { current?: number; size?: number; total?: number };
}

export interface LocalistDateRange {
  /** Inclusive calendar date, YYYY-MM-DD. */
  start: string;
  /** Exclusive calendar date, YYYY-MM-DD. */
  end: string;
}

export interface LocalistAdapterOptions {
  timezone?: string;
}

const DEFAULT_TIMEZONE = 'America/New_York';
const DAY_MS = 86_400_000;

function issue(code: AdapterIssue['code'], path: string, message: string): AdapterIssue {
  return { code, path, message };
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function idText(value: unknown): string | null {
  return (typeof value === 'string' && value.trim()) || (typeof value === 'number' && Number.isSafeInteger(value))
    ? String(value)
    : null;
}

function utc(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

function validHttpUrl(value: unknown): string | null {
  const candidate = text(value);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

const ENTITIES: Record<string, string> = {
  amp: '&', apos: "'", quot: '"', lt: '<', gt: '>', nbsp: ' ', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘',
  rdquo: '”', ldquo: '“', hellip: '…', copy: '©', reg: '®',
};

function plainText(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const normalized = value
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*\/(?:p|div|li|h[1-6]|ul|ol|blockquote)\s*>/gi, '\n')
    .replace(/<\s*li\b[^>]*>/gi, '• ')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (whole, entity: string) => {
      if (entity[0] === '#') {
        const code = entity[1]?.toLowerCase() === 'x'
          ? Number.parseInt(entity.slice(2), 16)
          : Number.parseInt(entity.slice(1), 10);
        try { return Number.isFinite(code) ? String.fromCodePoint(code) : whole; } catch { return whole; }
      }
      return ENTITIES[entity.toLowerCase()] ?? whole;
    })
    .replace(/[\t\r\f\v ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return normalized || null;
}

function zonedDateToUtc(date: string, timezone: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const [year, month, day] = date.split('-').map(Number);
  const target = Date.UTC(year, month - 1, day);
  if (new Date(target).toISOString().slice(0, 10) !== date) return null;
  let instant = target;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map(({ type, value }) => [type, value]));
    const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    const adjustment = target - represented;
    instant += adjustment;
    if (adjustment === 0) break;
  }
  return new Date(instant).toISOString();
}

function addCalendarDays(date: string, count: number): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + count)).toISOString().slice(0, 10);
}

function statusOf(value: unknown): 'draft' | 'published' | 'cancelled' | 'postponed' | 'archived' {
  const status = String(value ?? '').toLowerCase();
  if (/(cancel|canceled)/.test(status)) return 'cancelled';
  if (/postpon/.test(status)) return 'postponed';
  if (/(archiv|expired)/.test(status)) return 'archived';
  if (/(draft|pending|unpublished|rejected)/.test(status)) return 'draft';
  return 'published';
}

function locationTypeOf(experience: unknown, hasStream: boolean): 'physical' | 'virtual' | 'hybrid' {
  const value = String(experience ?? '').toLowerCase();
  if (/hybrid|both/.test(value)) return 'hybrid';
  if (/online|virtual|remote/.test(value)) return 'virtual';
  if (hasStream && !/in.?person|physical/.test(value)) return 'virtual';
  return 'physical';
}

function categoriesOf(record: LocalistRawRecord): { categories: string[]; invalid: boolean } {
  const labels: string[] = [];
  if (record.filters === null || record.filters === undefined) return { categories: labels, invalid: false };
  if (typeof record.filters !== 'object' || Array.isArray(record.filters)) return { categories: labels, invalid: true };
  for (const list of Object.values(record.filters as Record<string, unknown>)) {
    if (!Array.isArray(list)) return { categories: labels, invalid: true };
    for (const item of list) {
      if (item === null || typeof item !== 'object' || Array.isArray(item)) return { categories: labels, invalid: true };
      const name = text((item as { name?: unknown }).name);
      if (name && !labels.some((label) => label.toLocaleLowerCase('en-US') === name.toLocaleLowerCase('en-US'))) {
        labels.push(name);
      }
    }
  }
  return { categories: labels, invalid: false };
}

function candidateUrl(...values: unknown[]): string | null {
  for (const value of values) {
    const url = validHttpUrl(value);
    if (url) return url;
  }
  return null;
}

export class LocalistAdapter implements EventSourceAdapter<LocalistRawRecord> {
  readonly sourceType = 'localist' as const;
  readonly timezone: string;

  constructor(options: LocalistAdapterOptions = {}) {
    this.timezone = options.timezone ?? DEFAULT_TIMEZONE;
  }

  adapt(input: ProviderRecordInput<LocalistRawRecord>): AdapterResult {
    const record = input.raw;
    const externalId = idText(record?.id);
    if (!externalId) return { ok: false, issues: [issue('invalid_source_identity', 'raw.id', 'Localist event id is required for stable imports.')] };
    if (input.sourceType !== this.sourceType) {
      return { ok: false, issues: [issue('source_type_mismatch', 'sourceType', 'Localist adapter requires sourceType "localist".')] };
    }

    const sourceUpdatedAt = utc(record.updated_at);
    const sourceStatus = statusOf(record.status);
    const eventStatus = sourceStatus === 'published' ? statusOf(record.publish_status ?? record.status) : sourceStatus;
    const group = record.groups?.find((item) => text(item?.name));
    const organization = group ? {
      name: text(group.name)!, externalId: idText(group.id), sourceUrl: null,
    } : null;
    const categoryResult = categoriesOf(record);
    if (categoryResult.invalid) {
      return { ok: false, issues: [issue('invalid_category', 'raw.filters', 'Localist filters must be an object containing arrays of category records.')] };
    }
    const categories = categoryResult.categories;
    if (!categories.length) {
      return { ok: false, issues: [issue('missing_required_field', 'categoryLabels', 'Localist event has no category candidate in its filters.')] };
    }
    const filters = record.filters as Record<string, Array<{ name?: unknown }>> | undefined;
    const primaryCategoryLabel = (filters?.event_types ?? []).map((item) => text(item.name)).find(Boolean) ?? categories[0];
    const description = plainText(record.description_text) ?? plainText(record.description);
    const registrationUrl = candidateUrl(record.ticket_url);
    const registrationType = registrationUrl ? 'external' : 'none';
    const sourceUrl = candidateUrl(record.localist_url, input.sourceUrl);
    const imageUrl = candidateUrl(record.photo_url);
    const rawOccurrences = (record.event_instances ?? []).map((entry) => entry?.event_instance).filter((value): value is LocalistRawOccurrence => Boolean(value));
    if (!rawOccurrences.length) return { ok: false, issues: [issue('missing_required_field', 'raw.event_instances', 'Localist event must include at least one occurrence.')] };
    const missingOccurrenceId = rawOccurrences.findIndex((instance) => !idText(instance.id));
    if (missingOccurrenceId !== -1) {
      return { ok: false, issues: [issue('invalid_source_identity', `occurrences[${missingOccurrenceId}].externalId`, 'Localist occurrence id is required for stable reruns.')] };
    }

    const occurrences = rawOccurrences.map((instance, index) => {
      const occurrenceId = idText(instance.id)!;
      const allDay = instance.all_day === true;
      let startsAt = utc(instance.start);
      let endsAt = utc(instance.end);
      if (allDay) {
        const localStartDate = instance.start?.slice(0, 10);
        startsAt = localStartDate ? zonedDateToUtc(localStartDate, this.timezone) : null;
        if (instance.end) {
          endsAt = utc(instance.end);
        } else {
          const localEndDate = rawOccurrences.length === 1 && record.last_date && record.last_date >= (localStartDate ?? '')
            ? addCalendarDays(record.last_date, 1)
            : localStartDate ? addCalendarDays(localStartDate, 1) : null;
          endsAt = localEndDate ? zonedDateToUtc(localEndDate, this.timezone) : null;
        }
      }

      const venueName = text(record.location_name) ?? text(record.location);
      const room = text(record.room_number);
      const geo = record.geo ?? {};
      const latitude = geo.latitude === null || geo.latitude === undefined || geo.latitude === '' ? null : Number(geo.latitude);
      const longitude = geo.longitude === null || geo.longitude === undefined || geo.longitude === '' ? null : Number(geo.longitude);
      const coordinates = latitude !== null && longitude !== null && Number.isFinite(latitude) && Number.isFinite(longitude)
        ? { latitude, longitude }
        : null;
      const streamUrl = candidateUrl(record.stream_url);
      const locationType = locationTypeOf(record.experience, Boolean(streamUrl));
      const isVirtual = locationType === 'virtual';
      const venue = isVirtual || !venueName ? null : {
        name: room ? `${venueName}, ${room}` : venueName,
        externalId: idText(record.venue_id),
        sourceUrl: candidateUrl(record.venue_url),
        room,
        addressLine1: text(geo.street) ?? text(record.address),
        addressLine2: null,
        city: text(geo.city),
        region: text(geo.state),
        postalCode: text(geo.zip),
        countryCode: /^[a-z]{2}$/i.test(text(geo.country) ?? '') ? text(geo.country)!.toUpperCase() : null,
        coordinates,
      };
      const canceled = instance.cancelled === true || statusOf(instance.status) === 'cancelled';
      const postponed = instance.postponed === true || statusOf(instance.status) === 'postponed';
      return {
        sourceType: this.sourceType,
        externalId: occurrenceId,
        startsAt: startsAt ?? '',
        endsAt,
        allDay,
        status: canceled ? 'cancelled' as const : postponed ? 'postponed' as const : 'scheduled' as const,
        locationType,
        locationName: isVirtual ? null : venueName,
        venue,
        coordinates: isVirtual ? null : coordinates,
        virtualUrl: isVirtual || locationType === 'hybrid' ? streamUrl : null,
        sourceAttendanceCount: Number.isInteger(instance.num_attending) && Number(instance.num_attending) >= 0 ? Number(instance.num_attending) : null,
        sourceUpdatedAt,
      };
    });

    const draft: AdapterEventDraft = {
      sourceType: this.sourceType,
      externalId,
      sourceUrl,
      sourceUpdatedAt,
      title: text(record.title) ?? '',
      description,
      imageUrl,
      organization,
      categoryLabels: categories,
      primaryCategoryLabel,
      status: eventStatus,
      visibility: record.private === true ? 'private' : 'public',
      timezone: this.timezone,
      registrationType,
      registrationUrl: registrationType === 'external' ? registrationUrl : null,
      isFree: record.free === true,
      featuredRank: null,
      occurrences,
    };
    const validated = validateAdapterEventDraft(draft);
    if (!validated.ok) return validated;
    const warnings: AdapterIssue[] = [];
    const warnInvalidUrl = (path: string, value: unknown) => {
      if (text(value) && !validHttpUrl(value)) warnings.push(issue('invalid_url', path, 'Optional Localist URL was ignored because it is not HTTP(S).'));
    };
    warnInvalidUrl('raw.localist_url', record.localist_url);
    warnInvalidUrl('raw.url', input.sourceUrl);
    warnInvalidUrl('raw.photo_url', record.photo_url);
    warnInvalidUrl('raw.ticket_url', record.ticket_url);
    warnInvalidUrl('raw.stream_url', record.stream_url);
    warnInvalidUrl('raw.venue_url', record.venue_url);
    if (record.updated_at && !sourceUpdatedAt) {
      warnings.push(issue('invalid_timestamp', 'raw.updated_at', 'Optional Localist update timestamp was ignored because it is invalid.'));
    }
    const geo = record.geo;
    const hasAnyCoordinate = geo?.latitude !== null && geo?.latitude !== undefined || geo?.longitude !== null && geo?.longitude !== undefined;
    if (hasAnyCoordinate) {
      const latitude = Number(geo?.latitude);
      const longitude = Number(geo?.longitude);
      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
        warnings.push(issue('invalid_coordinates', 'raw.geo', 'Optional Localist coordinates were ignored because they are out of range or incomplete.'));
      }
    }
    return { ok: true, value: validated.value, warnings };
  }
}

export function createLocalistAdapter(options: LocalistAdapterOptions = {}): EventSourceAdapter<LocalistRawRecord> {
  return new LocalistAdapter(options);
}

function parseDate(date: string, label: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new TypeError(`${label} must be a calendar date in YYYY-MM-DD format.`);
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== date) {
    throw new TypeError(`${label} must be a valid calendar date.`);
  }
  return timestamp;
}

/** Fetch a Localist API v2 date window, following every page. `start` is inclusive and `end` exclusive. */
export async function fetchLocalistEvents(options: {
  baseUrl: string;
  range: LocalistDateRange;
  pageSize?: number;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}): Promise<LocalistRawRecord[]> {
  const start = parseDate(options.range.start, 'range.start');
  const end = parseDate(options.range.end, 'range.end');
  const days = (end - start) / DAY_MS;
  if (days <= 0) throw new RangeError('range.end must be after range.start.');
  if (days > 370) throw new RangeError('Localist date windows may not exceed 370 days.');
  const pageSize = options.pageSize ?? 100;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new RangeError('pageSize must be an integer from 1 to 100.');
  const endpoint = new URL('/api/2/events', options.baseUrl);
  const request = options.fetchImpl ?? fetch;
  const all: LocalistRawRecord[] = [];
  let page = 1;
  let total: number | null = null;
  while (total === null || page <= total) {
    const url = new URL(endpoint);
    url.searchParams.set('start', options.range.start);
    url.searchParams.set('end', options.range.end);
    url.searchParams.set('page', String(page));
    url.searchParams.set('pp', String(pageSize));
    const response = await request(url, { signal: options.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Localist request failed (${response.status}) for page ${page}.`);
    const body = await response.json() as LocalistApiResponse;
    if (!Array.isArray(body.events) || !body.page || !Number.isInteger(body.page.current) || !Number.isInteger(body.page.total)) {
      throw new TypeError(`Localist response for page ${page} is missing events or pagination metadata.`);
    }
    if (body.page.total === 0 && body.events.length === 0 && page === 1 && body.page.current === 1) return all;
    if (body.page.current !== page || body.page.total! < page) throw new TypeError(`Unexpected Localist page metadata for requested page ${page}.`);
    total = body.page.total!;
    for (const wrapper of body.events) if (wrapper?.event) all.push(wrapper.event);
    if (body.events.length === 0 && page < total) throw new Error(`Localist returned an empty page ${page} before the final page.`);
    page += 1;
  }
  return all;
}
