// Organizer listings (Task 4.1): what the New listing form sends and gets back.
//
// The real contract comes from task 2.1; until then these types are our
// assumption, mapped to the Phase 2 schema in the comments. Times are UTC ISO
// instants plus an IANA zone, matching eventRepository.ts.

import type { CanonicalId, IanaTimeZone, UtcIsoTimestamp } from '../../../../shared/contracts/event';

export type ListingType = 'event' | 'deal';

export interface CategoryOption {
  id: CanonicalId;
  name: string;
  slug: string;
}

export interface VenueOption {
  id: CanonicalId;
  name: string;
  addressLine1: string | null;
}

/** Exactly one is set: `venue_id` or `street_address`. */
export type ListingLocation =
  | { venueId: CanonicalId; streetAddress: null }
  | { venueId: null; streetAddress: string };

interface PublishListingBase {
  organizerId: CanonicalId;
  /** Client-made UUID, stored as organizer_publications.request_key so a retry never posts twice. */
  requestKey: string;
  title: string;
  description: string;
  /** Optional https link → listing_url. */
  listingUrl: string | null;
  location: ListingLocation;
}

/** One `events` row, its `event_categories` rows and one `event_occurrences` row. */
export interface PublishEventInput extends PublishListingBase {
  /** At least one. [0] → events.primary_category_id; all → event_categories. */
  categoryIds: CanonicalId[];
  startsAt: UtcIsoTimestamp;
  endsAt: UtcIsoTimestamp | null;
  timezone: IanaTimeZone;
}

/** One `deals` row. */
export interface PublishDealInput extends PublishListingBase {
  categoryId: CanonicalId;
  validFrom: UtcIsoTimestamp;
  validUntil: UtcIsoTimestamp;
  terms: string;
  eligibilityNote: string | null;
}

export const LISTING_ERROR_CODES = [
  'validation',
  'weekly_cap_reached',
  'posting_revoked',
  'organizer_content_disabled',
  'not_member',
  'network',
  'unknown',
] as const;

export type ListingErrorCode = (typeof LISTING_ERROR_CODES)[number];

export type PublishResult =
  | { ok: true; listingId: CanonicalId; remainingThisWeek: number }
  | {
      ok: false;
      code: ListingErrorCode;
      message: string;
      /** Keyed by input field name, e.g. `title` or `startsAt`. */
      fieldErrors?: Partial<Record<string, string>>;
    };

export interface PublishingContext {
  organizerId: CanonicalId;
  organizerName: string;
  weeklyCap: number;
  remainingThisWeek: number;
}
