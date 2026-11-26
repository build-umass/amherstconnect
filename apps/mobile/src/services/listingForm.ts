// New listing form (Task 4.1): draft state, validation and the publish input.
//
// Pure, with type-only imports, so node --test can load it directly.
//
// The form keeps what the organizer picked as plain strings ('2026-11-14',
// '18:00') in America/New_York, whatever zone the phone is in, and turns them
// into UTC instants with Intl (no time-zone library).

import type {
  ListingErrorCode,
  ListingLocation,
  ListingType,
  PublishDealInput,
  PublishEventInput,
  PublishResult,
  PublishingContext,
} from '../types/listing';

/** Organizer forms always read local times in this zone. */
export const LISTING_TIME_ZONE = 'America/New_York';

// ---------------------------------------------------------------------------
// Wall-clock dates and times

/** 'YYYY-MM-DD' */
export type LocalDate = string;
/** 'HH:mm', 24-hour */
export type LocalTime = string;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})$/;

const pad = (n: number) => String(n).padStart(2, '0');

export function parseLocalDate(date: LocalDate): { year: number; month: number; day: number } | null {
  const m = DATE_RE.exec(date);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    return null;
  }
  return { year, month, day };
}

export function parseLocalTime(time: LocalTime): { hour: number; minute: number } | null {
  const m = TIME_RE.exec(time);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** The wall clock in `timeZone` at instant `ms`. */
export function wallClockAt(ms: number, timeZone: string): { date: LocalDate; time: LocalTime; second: number } {
  const parts: Record<string, string> = {};
  for (const p of formatterFor(timeZone).formatToParts(new Date(ms))) parts[p.type] = p.value;
  // Some engines print midnight as hour 24.
  const hour = Number(parts.hour) % 24;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${pad(hour)}:${parts.minute}`,
    second: Number(parts.second),
  };
}

/** How far `timeZone` is ahead of UTC at instant `ms`, in ms (negative in New York). */
function offsetAt(ms: number, timeZone: string): number {
  const { date, time, second } = wallClockAt(ms, timeZone);
  const d = parseLocalDate(date)!;
  const t = parseLocalTime(time)!;
  const asUtc = Date.UTC(d.year, d.month - 1, d.day, t.hour, t.minute, second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/**
 * The instant when the wall clock in `timeZone` reads `date` `time`.
 * Returns null for bad input and for times skipped by a DST change
 * (2:30 AM on the spring-forward day). A repeated fall-back time
 * resolves to the first (daylight) one.
 */
export function zonedToUtc(date: LocalDate, time: LocalTime, timeZone: string): Date | null {
  const d = parseLocalDate(date);
  const t = parseLocalTime(time);
  if (!d || !t) return null;
  const local = Date.UTC(d.year, d.month - 1, d.day, t.hour, t.minute);
  const firstGuess = offsetAt(local, timeZone);
  let utc = local - firstGuess;
  const secondGuess = offsetAt(utc, timeZone);
  if (secondGuess !== firstGuess) utc = local - secondGuess;
  const check = wallClockAt(utc, timeZone);
  if (check.date !== date || check.time !== time) return null;
  return new Date(utc);
}

/** Today's date in `timeZone`. */
export function todayIn(timeZone: string, now: Date): LocalDate {
  return wallClockAt(now.getTime(), timeZone).date;
}

/** Display a picked date, e.g. 'Nov 14, 2026'. */
export function formatLocalDate(date: LocalDate): string {
  const d = parseLocalDate(date);
  if (!d) return date;
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })
    .format(new Date(Date.UTC(d.year, d.month - 1, d.day)));
}

/** Display a picked time, e.g. '6:00 PM'. */
export function formatLocalTime(time: LocalTime): string {
  const t = parseLocalTime(time);
  if (!t) return time;
  const h12 = t.hour % 12 === 0 ? 12 : t.hour % 12;
  return `${h12}:${pad(t.minute)} ${t.hour < 12 ? 'AM' : 'PM'}`;
}

/**
 * Pickers work in the phone's zone. These treat a JS Date as a plain wall
 * clock (its device-local fields), so a picked '6:00 PM' stays 6:00 PM
 * New York time even on a phone set to another zone.
 */
export function deviceDateToLocal(value: Date): { date: LocalDate; time: LocalTime } {
  return {
    date: `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`,
    time: `${pad(value.getHours())}:${pad(value.getMinutes())}`,
  };
}

export function localToDeviceDate(date: LocalDate | null, time: LocalTime | null, fallback: Date): Date {
  const d = date ? parseLocalDate(date) : null;
  const t = time ? parseLocalTime(time) : null;
  const result = new Date(fallback.getTime());
  if (d) result.setFullYear(d.year, d.month - 1, d.day);
  if (t) result.setHours(t.hour, t.minute, 0, 0);
  return result;
}

// ---------------------------------------------------------------------------
// Draft

export interface ListingDraft {
  type: ListingType;
  title: string;
  description: string;
  listingUrl: string;
  /** What the organizer typed in "Venue or address". */
  locationText: string;
  /** Set only while the text is a picked venue suggestion. */
  venueId: string | null;
  /** Events: one or more. Deals: at most one. */
  categoryIds: string[];
  // Event
  startDate: LocalDate | null;
  startTime: LocalTime | null;
  endDate: LocalDate | null;
  endTime: LocalTime | null;
  // Deal
  validFromDate: LocalDate | null;
  validFromTime: LocalTime | null;
  validUntilDate: LocalDate | null;
  validUntilTime: LocalTime | null;
  terms: string;
  eligibilityNote: string;
}

export function emptyDraft(type: ListingType = 'event'): ListingDraft {
  return {
    type,
    title: '',
    description: '',
    listingUrl: '',
    locationText: '',
    venueId: null,
    categoryIds: [],
    startDate: null,
    startTime: null,
    endDate: null,
    endTime: null,
    validFromDate: null,
    validFromTime: null,
    validUntilDate: null,
    validUntilTime: null,
    terms: '',
    eligibilityNote: '',
  };
}

/** Switch Event/Deal and keep shared fields. A deal keeps only the first category. */
export function switchListingType(draft: ListingDraft, type: ListingType): ListingDraft {
  if (draft.type === type) return draft;
  return { ...draft, type, categoryIds: type === 'deal' ? draft.categoryIds.slice(0, 1) : draft.categoryIds };
}

/** Typing in the venue field drops a picked venue, so the text becomes the address. */
export function setLocationText(draft: ListingDraft, text: string): ListingDraft {
  return { ...draft, locationText: text, venueId: null };
}

export function pickVenue(draft: ListingDraft, venue: { id: string; name: string }): ListingDraft {
  return { ...draft, locationText: venue.name, venueId: venue.id };
}

/** Events toggle a category in or out; deals replace it. */
export function toggleCategory(draft: ListingDraft, categoryId: string): ListingDraft {
  if (draft.type === 'deal') return { ...draft, categoryIds: [categoryId] };
  const has = draft.categoryIds.includes(categoryId);
  return {
    ...draft,
    categoryIds: has ? draft.categoryIds.filter((id) => id !== categoryId) : [...draft.categoryIds, categoryId],
  };
}

/** Venue suggestions show while typing, and hide once one is picked. */
export function venueQuery(draft: Pick<ListingDraft, 'locationText' | 'venueId'>): string | null {
  const q = draft.locationText.trim();
  return q && !draft.venueId ? q : null;
}

// ---------------------------------------------------------------------------
// Validation

export const TITLE_MAX = 120;
export const DESCRIPTION_MAX = 1000;
const URL_MAX = 2048;
/** No end time on a deal means it lasts to the end of that day. */
export const DEFAULT_DEAL_END_TIME: LocalTime = '23:59';
/** No start time on a deal means it starts when the day starts (assumed; ask Camila/Adya). */
export const DEFAULT_DEAL_START_TIME: LocalTime = '00:00';

/** Characters as the database counts them (code points, not UTF-16 units). */
export function charCount(text: string): number {
  return Array.from(text).length;
}

export type ListingField =
  | 'title'
  | 'description'
  | 'listingUrl'
  | 'location'
  | 'categoryIds'
  | 'startsAt'
  | 'endsAt'
  | 'validFrom'
  | 'validUntil'
  | 'terms'
  | 'eligibilityNote';

export type FieldErrors = Partial<Record<ListingField, string>>;

const HTTPS_URL = /^https:\/\/[^\s/?#@]+\.[^\s/?#@]+(?::\d+)?(?:[/?#]\S*)?$/i;

export function isHttpsUrl(text: string): boolean {
  return text.length <= URL_MAX && HTTPS_URL.test(text);
}

export type ListingSubmission =
  | { type: 'event'; input: PublishEventInput }
  | { type: 'deal'; input: PublishDealInput };

export type PreparedListing = { ok: true; submission: ListingSubmission } | { ok: false; errors: FieldErrors };

const SKIPPED_TIME = "That time doesn't exist on this date because the clocks change. Choose another time.";

/**
 * Check the draft and, if it's valid, build what gets sent to publishEvent or
 * publishDeal. `now` is passed in so the rules can be tested.
 */
export function prepareListing(
  draft: ListingDraft,
  ids: { organizerId: string; requestKey: string },
  now: Date,
): PreparedListing {
  const errors: FieldErrors = {};
  const zone = LISTING_TIME_ZONE;

  const title = draft.title.trim();
  if (!title) errors.title = 'Add a title.';
  else if (charCount(title) > TITLE_MAX) errors.title = `Keep the title to ${TITLE_MAX} characters or fewer.`;

  const description = draft.description.trim();
  if (!description) errors.description = 'Add a description.';
  else if (charCount(description) > DESCRIPTION_MAX) {
    errors.description = 'Keep the description to 1,000 characters or fewer.';
  }

  const url = draft.listingUrl.trim();
  if (url && !isHttpsUrl(url)) errors.listingUrl = 'Use a full link that starts with https://';

  const address = draft.locationText.trim();
  let location: ListingLocation | null = null;
  if (draft.venueId) location = { venueId: draft.venueId, streetAddress: null };
  else if (address) location = { venueId: null, streetAddress: address };
  else errors.location = 'Add a venue or address.';

  if (draft.categoryIds.length === 0) {
    errors.categoryIds = draft.type === 'event' ? 'Choose at least one category.' : 'Choose a category.';
  }

  const base = {
    organizerId: ids.organizerId,
    requestKey: ids.requestKey,
    title,
    description,
    listingUrl: url || null,
  };

  if (draft.type === 'event') {
    let startsAt: Date | null = null;
    if (!draft.startDate || !draft.startTime) {
      errors.startsAt = 'Choose a start date and time.';
    } else {
      startsAt = zonedToUtc(draft.startDate, draft.startTime, zone);
      if (!startsAt) errors.startsAt = SKIPPED_TIME;
      else if (startsAt.getTime() <= now.getTime()) {
        errors.startsAt = 'That start time has passed. Choose a time in the future.';
      }
    }

    let endsAt: Date | null = null;
    if (draft.endDate || draft.endTime) {
      if (!draft.endDate || !draft.endTime) {
        errors.endsAt = 'Choose both an end date and time, or leave both empty.';
      } else {
        endsAt = zonedToUtc(draft.endDate, draft.endTime, zone);
        if (!endsAt) errors.endsAt = SKIPPED_TIME;
        else if (startsAt && endsAt.getTime() <= startsAt.getTime()) errors.endsAt = 'The end must be after the start.';
      }
    }

    if (Object.keys(errors).length > 0 || !startsAt || !location) return { ok: false, errors };
    return {
      ok: true,
      submission: {
        type: 'event',
        input: {
          ...base,
          location,
          categoryIds: [...draft.categoryIds],
          startsAt: startsAt.toISOString(),
          endsAt: endsAt ? endsAt.toISOString() : null,
          timezone: zone,
        },
      },
    };
  }

  // Deal
  let validFrom: Date | null = null;
  if (!draft.validFromDate) {
    errors.validFrom = 'Choose a start date.';
  } else if (draft.validFromDate < todayIn(zone, now)) {
    errors.validFrom = "The deal can't start before today.";
  } else {
    validFrom = zonedToUtc(draft.validFromDate, draft.validFromTime ?? DEFAULT_DEAL_START_TIME, zone);
    if (!validFrom) errors.validFrom = SKIPPED_TIME;
  }

  let validUntil: Date | null = null;
  if (!draft.validUntilDate) {
    errors.validUntil = 'Choose an end date.';
  } else {
    validUntil = zonedToUtc(draft.validUntilDate, draft.validUntilTime ?? DEFAULT_DEAL_END_TIME, zone);
    if (!validUntil) errors.validUntil = SKIPPED_TIME;
    else if (validFrom && validUntil.getTime() <= validFrom.getTime()) {
      errors.validUntil = 'The end must be after the start.';
    } else if (validUntil.getTime() <= now.getTime()) {
      errors.validUntil = 'That end time has passed. Choose a time in the future.';
    }
  }

  const terms = draft.terms.trim();
  if (!terms) errors.terms = 'Add the deal terms.';
  const eligibilityNote = draft.eligibilityNote.trim();

  if (Object.keys(errors).length > 0 || !validFrom || !validUntil || !location) return { ok: false, errors };
  return {
    ok: true,
    submission: {
      type: 'deal',
      input: {
        ...base,
        location,
        categoryId: draft.categoryIds[0],
        validFrom: validFrom.toISOString(),
        validUntil: validUntil.toISOString(),
        terms,
        eligibilityNote: eligibilityNote || null,
      },
    },
  };
}

export function validateListing(draft: ListingDraft, now: Date): FieldErrors {
  const result = prepareListing(draft, { organizerId: '', requestKey: '' }, now);
  return result.ok ? {} : result.errors;
}

// ---------------------------------------------------------------------------
// Publishing

/** UUID v4 from 16 random bytes (crypto.getRandomValues in the app). */
export function requestKeyFromBytes(bytes: Uint8Array): string {
  if (bytes.length < 16) throw new Error('Need 16 random bytes');
  const b = Array.from(bytes.slice(0, 16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = b.map((n) => n.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Server field names → the form field that shows the error. */
const SERVER_FIELDS: Record<string, ListingField> = {
  title: 'title',
  description: 'description',
  listingUrl: 'listingUrl',
  location: 'location',
  venueId: 'location',
  streetAddress: 'location',
  categoryIds: 'categoryIds',
  categoryId: 'categoryIds',
  startsAt: 'startsAt',
  endsAt: 'endsAt',
  validFrom: 'validFrom',
  validUntil: 'validUntil',
  terms: 'terms',
  eligibilityNote: 'eligibilityNote',
};

export function fieldErrorsFromServer(fieldErrors: Partial<Record<string, string>> | undefined): FieldErrors {
  const out: FieldErrors = {};
  for (const [key, message] of Object.entries(fieldErrors ?? {})) {
    const field = SERVER_FIELDS[key];
    if (field && message && !out[field]) out[field] = message;
  }
  return out;
}

export const SUPPORT_EMAIL = 'amherstconnect@gmail.com';

/** What the organizer sees above the form when a publish fails. */
export function publishErrorMessage(
  code: ListingErrorCode,
  context: Pick<PublishingContext, 'weeklyCap'> | null,
): string {
  switch (code) {
    case 'validation':
      return 'Some fields need changes. Check the highlighted fields.';
    case 'weekly_cap_reached':
      return context && context.weeklyCap === 0
        ? 'Posting is paused for your organization right now.'
        : "You've used all your listings for this week. You can post again next week.";
    case 'posting_revoked':
      return `Your organizer access was removed, so you can't post. Email ${SUPPORT_EMAIL} if you think this is a mistake.`;
    case 'organizer_content_disabled':
      return 'Posting is paused for everyone right now. Please try again later.';
    case 'not_member':
      return "Your account isn't a member of this organizer, so you can't post for it.";
    case 'network':
      return "Couldn't reach Amherst Connect. Check your connection and try again.";
    default:
      return 'Something went wrong. Please try again.';
  }
}

/** Failures worth retrying with the same request key. */
export function isRetryable(result: PublishResult): boolean {
  return !result.ok && (result.code === 'network' || result.code === 'unknown');
}

/** "2 of 3 listings left this week." */
export function remainingText(context: Pick<PublishingContext, 'weeklyCap' | 'remainingThisWeek'>): string {
  if (context.weeklyCap === 0) return 'Posting is paused for your organization.';
  const n = Math.max(0, context.remainingThisWeek);
  return `${n} of ${context.weeklyCap} listing${context.weeklyCap === 1 ? '' : 's'} left this week.`;
}
