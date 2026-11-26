// Organizer listings: the one place the Organizer tab reads and writes them.
//
// Task 4.1 ships only the fixture version below. The real version comes with
// task 2.1/2.2 and must re-check every form rule on the server.

import type {
  CategoryOption,
  ListingErrorCode,
  PublishDealInput,
  PublishEventInput,
  PublishResult,
  PublishingContext,
  VenueOption,
} from '../types/listing';

export interface ListingRepository {
  listCategories(): Promise<CategoryOption[]>;
  searchVenues(query: string): Promise<VenueOption[]>;
  getPublishingContext(organizerId: string): Promise<PublishingContext>;
  publishEvent(input: PublishEventInput): Promise<PublishResult>;
  publishDeal(input: PublishDealInput): Promise<PublishResult>;
}

// ---------------------------------------------------------------------------
// Fixtures (IDs match supabase/seed.sql)

export const FIXTURE_ORGANIZER_ID = 'b0000000-0000-4000-8000-000000000099';

export const FIXTURE_CATEGORIES: CategoryOption[] = [
  { id: 'd0000000-0000-4000-8000-000000000001', name: 'Music', slug: 'music' },
  { id: 'd0000000-0000-4000-8000-000000000002', name: 'Arts & Culture', slug: 'arts-culture' },
  { id: 'd0000000-0000-4000-8000-000000000003', name: 'Sports & Recreation', slug: 'sports-recreation' },
  { id: 'd0000000-0000-4000-8000-000000000004', name: 'Academic & Talks', slug: 'academic-talks' },
  { id: 'd0000000-0000-4000-8000-000000000005', name: 'Food & Drink', slug: 'food-drink' },
  { id: 'd0000000-0000-4000-8000-000000000006', name: 'Community', slug: 'community' },
  { id: 'd0000000-0000-4000-8000-000000000007', name: 'Wellness', slug: 'wellness' },
  { id: 'd0000000-0000-4000-8000-000000000008', name: 'Career', slug: 'career' },
];

export const FIXTURE_VENUES: VenueOption[] = [
  { id: 'c0000000-0000-4000-8000-000000000001', name: 'Student Union', addressLine1: null },
  { id: 'c0000000-0000-4000-8000-000000000002', name: 'Campus Center', addressLine1: null },
  { id: 'c0000000-0000-4000-8000-000000000003', name: 'Mullins Center', addressLine1: null },
  { id: 'c0000000-0000-4000-8000-000000000004', name: 'Fine Arts Center', addressLine1: null },
  { id: 'c0000000-0000-4000-8000-000000000005', name: 'Amherst Town Common', addressLine1: null },
  { id: 'c0000000-0000-4000-8000-000000000006', name: 'Jones Library', addressLine1: '43 Amity St' },
  { id: 'c0000000-0000-4000-8000-000000000007', name: 'Kestrel Cafe', addressLine1: null },
];

/** Sample server messages; the form shows its own wording per code. */
const FIXTURE_ERRORS: Record<ListingErrorCode, Extract<PublishResult, { ok: false }>> = {
  validation: {
    ok: false,
    code: 'validation',
    message: 'Validation failed',
    fieldErrors: { title: 'The server rejected this title.' },
  },
  weekly_cap_reached: { ok: false, code: 'weekly_cap_reached', message: 'Weekly cap reached' },
  posting_revoked: { ok: false, code: 'posting_revoked', message: 'Posting access revoked' },
  organizer_content_disabled: { ok: false, code: 'organizer_content_disabled', message: 'Organizer content is off' },
  not_member: { ok: false, code: 'not_member', message: 'Not a member of this organizer' },
  network: { ok: false, code: 'network', message: 'Network request failed' },
  unknown: { ok: false, code: 'unknown', message: 'Unexpected error' },
};

export interface FixtureListingRepository extends ListingRepository {
  /** Make every publish fail with this code until cleared (dev testing). */
  simulateError(code: ListingErrorCode | null): void;
  readonly simulatedError: ListingErrorCode | null;
  /** What has been "published", newest last. */
  readonly published: ReadonlyArray<{ type: 'event' | 'deal'; listingId: string; input: PublishEventInput | PublishDealInput }>;
}

export interface FixtureOptions {
  organizerName?: string;
  weeklyCap?: number;
  remainingThisWeek?: number;
  /** Fake network delay. Tests pass 0. */
  delayMs?: number;
}

export function createFixtureListingRepository(options: FixtureOptions = {}): FixtureListingRepository {
  const delayMs = options.delayMs ?? 400;
  const weeklyCap = options.weeklyCap ?? 3;
  let remaining = options.remainingThisWeek ?? Math.min(2, weeklyCap);
  let simulated: ListingErrorCode | null = null;
  let nextId = 1;
  const published: { type: 'event' | 'deal'; listingId: string; input: PublishEventInput | PublishDealInput }[] = [];
  const byRequestKey = new Map<string, PublishResult>();

  const wait = () => (delayMs > 0 ? new Promise<void>((resolve) => setTimeout(resolve, delayMs)) : Promise.resolve());

  async function publish(type: 'event' | 'deal', input: PublishEventInput | PublishDealInput): Promise<PublishResult> {
    await wait();
    // Same request key → same answer, so a retry never posts twice.
    const earlier = byRequestKey.get(input.requestKey);
    if (earlier?.ok) return earlier;
    if (simulated) return FIXTURE_ERRORS[simulated];
    if (input.organizerId !== FIXTURE_ORGANIZER_ID) return FIXTURE_ERRORS.not_member;
    if (remaining <= 0) return FIXTURE_ERRORS.weekly_cap_reached;
    remaining -= 1;
    const listingId = `f1000000-0000-4000-8000-${String(nextId++).padStart(12, '0')}`;
    published.push({ type, listingId, input });
    const result: PublishResult = { ok: true, listingId, remainingThisWeek: remaining };
    byRequestKey.set(input.requestKey, result);
    return result;
  }

  return {
    async listCategories() {
      await wait();
      return FIXTURE_CATEGORIES.map((c) => ({ ...c }));
    },
    async searchVenues(query) {
      const q = query.trim().toLowerCase();
      if (!q) return [];
      return FIXTURE_VENUES.filter(
        (v) => v.name.toLowerCase().includes(q) || (v.addressLine1 ?? '').toLowerCase().includes(q),
      );
    },
    async getPublishingContext(organizerId) {
      await wait();
      return {
        organizerId,
        organizerName: options.organizerName ?? 'Sample Bookshop',
        weeklyCap,
        remainingThisWeek: remaining,
      };
    },
    publishEvent: (input) => publish('event', input),
    publishDeal: (input) => publish('deal', input),
    simulateError(code) {
      simulated = code;
    },
    get simulatedError() {
      return simulated;
    },
    get published() {
      return published;
    },
  };
}
