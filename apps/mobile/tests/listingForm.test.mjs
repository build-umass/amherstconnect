import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  charCount,
  deviceDateToLocal,
  emptyDraft,
  fieldErrorsFromServer,
  formatLocalDate,
  formatLocalTime,
  isHttpsUrl,
  isRetryable,
  localToDeviceDate,
  parseLocalDate,
  parseLocalTime,
  pickVenue,
  prepareListing,
  publishErrorMessage,
  remainingText,
  requestKeyFromBytes,
  setLocationText,
  switchListingType,
  todayIn,
  toggleCategory,
  validateListing,
  venueQuery,
  wallClockAt,
  zonedToUtc,
} from '../src/services/listingForm.ts';
import { LISTING_ERROR_CODES } from '../src/types/listing.ts';

const NY = 'America/New_York';
// Fri Nov 20 2026, 10:00 AM in New York.
const now = new Date('2026-11-20T15:00:00Z');
const ids = { organizerId: 'org-1', requestKey: 'key-1' };
const MUSIC = 'd0000000-0000-4000-8000-000000000001';
const ARTS = 'd0000000-0000-4000-8000-000000000002';

const eventDraft = (overrides = {}) => ({
  ...emptyDraft('event'),
  title: 'Author reading and book signing',
  description: 'Meet a local author and get your copy signed.',
  locationText: '1 Main St, Amherst',
  categoryIds: [MUSIC],
  startDate: '2026-12-05',
  startTime: '18:00',
  ...overrides,
});

const dealDraft = (overrides = {}) => ({
  ...emptyDraft('deal'),
  title: '10% off all paperbacks',
  description: 'Show your student ID at the register.',
  locationText: '1 Main St, Amherst',
  categoryIds: [ARTS],
  validFromDate: '2026-11-20',
  validUntilDate: '2026-12-15',
  terms: '10% off one purchase per customer.',
  ...overrides,
});

// --- Time zone ------------------------------------------------------------

test('zonedToUtc reads wall-clock input as New York time in winter and summer', () => {
  assert.equal(zonedToUtc('2026-11-14', '18:00', NY).toISOString(), '2026-11-14T23:00:00.000Z');
  assert.equal(zonedToUtc('2026-07-04', '12:00', NY).toISOString(), '2026-07-04T16:00:00.000Z');
  assert.equal(zonedToUtc('2026-11-15', '00:00', NY).toISOString(), '2026-11-15T05:00:00.000Z');
});

test('zonedToUtc rejects a time skipped by spring-forward and bad input', () => {
  assert.equal(zonedToUtc('2026-03-08', '02:30', NY), null);
  assert.equal(zonedToUtc('2026-02-30', '12:00', NY), null);
  assert.equal(zonedToUtc('2026-11-14', '24:00', NY), null);
  assert.equal(zonedToUtc('11/14/2026', '18:00', NY), null);
});

test('zonedToUtc resolves a repeated fall-back time to the first one', () => {
  assert.equal(zonedToUtc('2026-11-01', '01:30', NY).toISOString(), '2026-11-01T05:30:00.000Z');
  assert.equal(zonedToUtc('2026-03-08', '03:00', NY).toISOString(), '2026-03-08T07:00:00.000Z');
});

test('wallClockAt and todayIn use the New York date, not UTC', () => {
  assert.deepEqual(wallClockAt(Date.parse('2026-11-21T03:00:00Z'), NY), { date: '2026-11-20', time: '22:00', second: 0 });
  assert.equal(todayIn(NY, new Date('2026-11-21T04:59:00Z')), '2026-11-20');
  assert.equal(todayIn(NY, new Date('2026-11-21T05:00:00Z')), '2026-11-21');
});

// --- Shared fields --------------------------------------------------------

test('a valid event becomes a publishEvent input', () => {
  const result = prepareListing(eventDraft({ categoryIds: [MUSIC, ARTS], listingUrl: ' https://example.com ' }), ids, now);
  assert.equal(result.ok, true);
  assert.deepEqual(result.submission, {
    type: 'event',
    input: {
      organizerId: 'org-1',
      requestKey: 'key-1',
      title: 'Author reading and book signing',
      description: 'Meet a local author and get your copy signed.',
      listingUrl: 'https://example.com',
      location: { venueId: null, streetAddress: '1 Main St, Amherst' },
      categoryIds: [MUSIC, ARTS],
      startsAt: '2026-12-05T23:00:00.000Z',
      endsAt: null,
      timezone: NY,
    },
  });
});

test('title is required and 1 to 120 characters after trimming', () => {
  assert.equal(validateListing(eventDraft({ title: '   ' }), now).title, 'Add a title.');
  assert.equal(validateListing(eventDraft({ title: 'a'.repeat(120) }), now).title, undefined);
  assert.match(validateListing(eventDraft({ title: 'a'.repeat(121) }), now).title, /120/);
  // Emoji count as one character each, like Postgres char_length.
  assert.equal(charCount('🎉'.repeat(120)), 120);
  assert.equal(validateListing(eventDraft({ title: '🎉'.repeat(120) }), now).title, undefined);
});

test('description is required, up to 1,000 characters', () => {
  assert.equal(validateListing(dealDraft({ description: '' }), now).description, 'Add a description.');
  assert.equal(validateListing(dealDraft({ description: 'x'.repeat(1000) }), now).description, undefined);
  assert.match(validateListing(dealDraft({ description: 'x'.repeat(1001) }), now).description, /1,000/);
});

test('official link is optional and https only', () => {
  assert.equal(validateListing(eventDraft({ listingUrl: '' }), now).listingUrl, undefined);
  for (const ok of ['https://example.com', 'https://www.example.com/events?id=1', 'https://sub.example.org:8443/a#b']) {
    assert.equal(isHttpsUrl(ok), true, ok);
  }
  for (const bad of ['http://example.com', 'example.com', 'https://', 'https://localhost', 'https://exa mple.com', 'javascript:alert(1)']) {
    assert.equal(isHttpsUrl(bad), false, bad);
    assert.ok(validateListing(eventDraft({ listingUrl: bad }), now).listingUrl, bad);
  }
});

test('venue or address is required; a picked venue sends venueId only', () => {
  assert.equal(validateListing(eventDraft({ locationText: '  ' }), now).location, 'Add a venue or address.');
  const picked = pickVenue(eventDraft(), { id: 'venue-1', name: 'Jones Library' });
  const result = prepareListing(picked, ids, now);
  assert.deepEqual(result.submission.input.location, { venueId: 'venue-1', streetAddress: null });
  // Typing again drops the venue, so the text is sent as an address.
  const typed = setLocationText(picked, 'Jones Library side door');
  assert.equal(typed.venueId, null);
  assert.deepEqual(prepareListing(typed, ids, now).submission.input.location, {
    venueId: null,
    streetAddress: 'Jones Library side door',
  });
});

test('venue suggestions show only while typing an unpicked venue', () => {
  assert.equal(venueQuery({ locationText: '  ', venueId: null }), null);
  assert.equal(venueQuery({ locationText: ' jones ', venueId: null }), 'jones');
  assert.equal(venueQuery({ locationText: 'Jones Library', venueId: 'venue-1' }), null);
});

test('events need at least one category; deals need one', () => {
  assert.equal(validateListing(eventDraft({ categoryIds: [] }), now).categoryIds, 'Choose at least one category.');
  assert.equal(validateListing(dealDraft({ categoryIds: [] }), now).categoryIds, 'Choose a category.');
});

test('toggleCategory adds and removes for events, replaces for deals', () => {
  let d = toggleCategory(eventDraft({ categoryIds: [] }), MUSIC);
  d = toggleCategory(d, ARTS);
  assert.deepEqual(d.categoryIds, [MUSIC, ARTS]);
  assert.deepEqual(toggleCategory(d, MUSIC).categoryIds, [ARTS]);
  assert.deepEqual(toggleCategory(dealDraft({ categoryIds: [MUSIC] }), ARTS).categoryIds, [ARTS]);
});

test('switching type keeps shared fields; a deal keeps only the first category', () => {
  const event = eventDraft({ categoryIds: [MUSIC, ARTS], listingUrl: 'https://example.com' });
  const deal = switchListingType(event, 'deal');
  assert.equal(deal.type, 'deal');
  assert.equal(deal.title, event.title);
  assert.equal(deal.description, event.description);
  assert.equal(deal.locationText, event.locationText);
  assert.equal(deal.listingUrl, event.listingUrl);
  assert.deepEqual(deal.categoryIds, [MUSIC]);
  assert.equal(switchListingType(deal, 'deal'), deal);
});

// --- Event times ----------------------------------------------------------

test('event start date and time are both required', () => {
  assert.equal(validateListing(eventDraft({ startDate: null }), now).startsAt, 'Choose a start date and time.');
  assert.equal(validateListing(eventDraft({ startTime: null }), now).startsAt, 'Choose a start date and time.');
});

test('event start must be in the future', () => {
  assert.match(validateListing(eventDraft({ startDate: '2026-11-20', startTime: '10:00' }), now).startsAt, /passed/);
  assert.equal(validateListing(eventDraft({ startDate: '2026-11-20', startTime: '10:01' }), now).startsAt, undefined);
});

test('event start on a skipped DST time is rejected', () => {
  const later = new Date('2026-01-01T00:00:00Z');
  assert.match(validateListing(eventDraft({ startDate: '2027-03-14', startTime: '02:30' }), later).startsAt, /clocks change/);
});

test('event end is optional, needs date and time together, and must be after start', () => {
  assert.equal(validateListing(eventDraft(), now).endsAt, undefined);
  assert.match(validateListing(eventDraft({ endDate: '2026-12-05' }), now).endsAt, /both/);
  assert.match(validateListing(eventDraft({ endTime: '20:00' }), now).endsAt, /both/);
  assert.match(validateListing(eventDraft({ endDate: '2026-12-05', endTime: '18:00' }), now).endsAt, /after the start/);
  const ok = prepareListing(eventDraft({ endDate: '2026-12-05', endTime: '20:00' }), ids, now);
  assert.equal(ok.submission.input.endsAt, '2026-12-06T01:00:00.000Z');
});

// --- Deal dates -----------------------------------------------------------

test('a valid deal with dates only runs from midnight to 11:59 PM New York time', () => {
  const result = prepareListing(dealDraft({ eligibilityNote: '  ' }), ids, now);
  assert.equal(result.ok, true);
  assert.deepEqual(result.submission, {
    type: 'deal',
    input: {
      organizerId: 'org-1',
      requestKey: 'key-1',
      title: '10% off all paperbacks',
      description: 'Show your student ID at the register.',
      listingUrl: null,
      location: { venueId: null, streetAddress: '1 Main St, Amherst' },
      categoryId: ARTS,
      validFrom: '2026-11-20T05:00:00.000Z',
      validUntil: '2026-12-16T04:59:00.000Z',
      terms: '10% off one purchase per customer.',
      eligibilityNote: null,
    },
  });
});

test('deal times are used when given', () => {
  const result = prepareListing(
    dealDraft({ validFromTime: '12:00', validUntilTime: '17:30', eligibilityNote: 'Students with a valid ID' }),
    ids,
    now,
  );
  assert.equal(result.submission.input.validFrom, '2026-11-20T17:00:00.000Z');
  assert.equal(result.submission.input.validUntil, '2026-12-15T22:30:00.000Z');
  assert.equal(result.submission.input.eligibilityNote, 'Students with a valid ID');
});

test('deal dates are required and the start is today or later', () => {
  const errors = validateListing(dealDraft({ validFromDate: null, validUntilDate: null }), now);
  assert.equal(errors.validFrom, 'Choose a start date.');
  assert.equal(errors.validUntil, 'Choose an end date.');
  assert.equal(validateListing(dealDraft({ validFromDate: '2026-11-19' }), now).validFrom, "The deal can't start before today.");
  // Today is fine even though midnight has passed.
  assert.equal(validateListing(dealDraft({ validFromDate: '2026-11-20' }), now).validFrom, undefined);
});

test('deal end must be after the start and in the future', () => {
  assert.match(validateListing(dealDraft({ validUntilDate: '2026-11-20', validUntilTime: '00:00' }), now).validUntil, /after the start/);
  assert.match(validateListing(dealDraft({ validUntilDate: '2026-11-20', validUntilTime: '09:00' }), now).validUntil, /passed/);
  // Same day, no end time: lasts until 11:59 PM.
  assert.equal(validateListing(dealDraft({ validUntilDate: '2026-11-20' }), now).validUntil, undefined);
});

test('deal terms are required; eligibility note is optional', () => {
  assert.equal(validateListing(dealDraft({ terms: ' ' }), now).terms, 'Add the deal terms.');
  assert.equal(validateListing(dealDraft({ eligibilityNote: '' }), now).eligibilityNote, undefined);
});

test('event-only fields are ignored on deals and deal-only fields on events', () => {
  assert.deepEqual(validateListing(dealDraft({ startDate: null, startTime: null }), now), {});
  assert.deepEqual(validateListing(eventDraft({ terms: '' }), now), {});
});

// --- Publishing -----------------------------------------------------------

test('requestKeyFromBytes makes a v4 UUID', () => {
  const key = requestKeyFromBytes(new Uint8Array(16).fill(0xff));
  assert.match(key, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.throws(() => requestKeyFromBytes(new Uint8Array(4)));
});

test('server field errors map to form fields', () => {
  assert.deepEqual(fieldErrorsFromServer({ categoryId: 'Bad category', streetAddress: 'Bad address', unknown: 'x' }), {
    categoryIds: 'Bad category',
    location: 'Bad address',
  });
  assert.deepEqual(fieldErrorsFromServer(undefined), {});
});

test('every error code has a user-facing message', () => {
  for (const code of LISTING_ERROR_CODES) {
    assert.ok(publishErrorMessage(code, { weeklyCap: 3 }).length > 10, code);
  }
  assert.match(publishErrorMessage('weekly_cap_reached', { weeklyCap: 0 }), /paused/);
});

test('remainingText shows the weekly allowance', () => {
  assert.equal(remainingText({ weeklyCap: 3, remainingThisWeek: 2 }), '2 of 3 listings left this week.');
  assert.equal(remainingText({ weeklyCap: 1, remainingThisWeek: 0 }), '0 of 1 listing left this week.');
  assert.equal(remainingText({ weeklyCap: 0, remainingThisWeek: 0 }), 'Posting is paused for your organization.');
});

// --- More edge cases -------------------------------------------------------

test('parseLocalDate and parseLocalTime reject impossible values', () => {
  assert.deepEqual(parseLocalDate('2028-02-29'), { year: 2028, month: 2, day: 29 });
  assert.equal(parseLocalDate('2026-02-29'), null);
  assert.equal(parseLocalDate('2026-13-01'), null);
  assert.equal(parseLocalDate(''), null);
  assert.deepEqual(parseLocalTime('23:59'), { hour: 23, minute: 59 });
  assert.equal(parseLocalTime('7:00'), null);
  assert.equal(parseLocalTime('12:60'), null);
});

test('picked dates and times display like the mockup', () => {
  assert.equal(formatLocalDate('2026-11-14'), 'Nov 14, 2026');
  assert.equal(formatLocalTime('18:00'), '6:00 PM');
  assert.equal(formatLocalTime('00:05'), '12:05 AM');
  assert.equal(formatLocalTime('12:00'), '12:00 PM');
});

test('picker values round-trip as a wall clock in any phone time zone', () => {
  const fallback = new Date(2026, 0, 1, 9, 15);
  const picked = localToDeviceDate('2026-11-14', '18:30', fallback);
  assert.deepEqual(deviceDateToLocal(picked), { date: '2026-11-14', time: '18:30' });
  // Missing parts keep the fallback's.
  assert.deepEqual(deviceDateToLocal(localToDeviceDate(null, '07:45', fallback)), { date: '2026-01-01', time: '07:45' });
  assert.deepEqual(deviceDateToLocal(localToDeviceDate('2026-03-03', null, fallback)), { date: '2026-03-03', time: '09:15' });
});

test('wallClockAt follows New York across both DST changes', () => {
  assert.equal(wallClockAt(Date.parse('2026-03-08T06:59:00Z'), NY).time, '01:59');
  assert.equal(wallClockAt(Date.parse('2026-03-08T07:00:00Z'), NY).time, '03:00');
  assert.equal(wallClockAt(Date.parse('2026-11-01T05:59:00Z'), NY).time, '01:59');
  assert.equal(wallClockAt(Date.parse('2026-11-01T06:00:00Z'), NY).time, '01:00');
});

test('an empty form reports every required field at once', () => {
  assert.deepEqual(Object.keys(validateListing(emptyDraft('event'), now)).sort(), [
    'categoryIds',
    'description',
    'location',
    'startsAt',
    'title',
  ]);
  assert.deepEqual(Object.keys(validateListing(emptyDraft('deal'), now)).sort(), [
    'categoryIds',
    'description',
    'location',
    'terms',
    'title',
    'validFrom',
    'validUntil',
  ]);
});

test('submitted text is trimmed and categories are copied', () => {
  const categoryIds = [MUSIC];
  const result = prepareListing(
    eventDraft({ title: '  Jazz night ', description: '\nLive trio.\n', locationText: '  1 Main St ', categoryIds }),
    ids,
    now,
  );
  const { input } = result.submission;
  assert.equal(input.title, 'Jazz night');
  assert.equal(input.description, 'Live trio.');
  assert.equal(input.location.streetAddress, '1 Main St');
  assert.notEqual(input.categoryIds, categoryIds);
  const deal = prepareListing(dealDraft({ terms: '  One per customer. ' }), ids, now);
  assert.equal(deal.submission.input.terms, 'One per customer.');
});

test('title and description limits apply after trimming', () => {
  assert.equal(validateListing(eventDraft({ title: `  ${'a'.repeat(120)}  ` }), now).title, undefined);
  assert.equal(validateListing(eventDraft({ description: ` ${'x'.repeat(1000)} ` }), now).description, undefined);
});

test('links are case-insensitive and capped at 2,048 characters', () => {
  assert.equal(isHttpsUrl('HTTPS://EXAMPLE.COM'), true);
  assert.equal(isHttpsUrl(`https://example.com/${'a'.repeat(2028)}`), true);
  assert.equal(isHttpsUrl(`https://example.com/${'a'.repeat(2029)}`), false);
  assert.equal(isHttpsUrl('https://user@example.com'), false);
});

test('a multi-day event across the fall-back change keeps both offsets', () => {
  const result = prepareListing(
    eventDraft({ startDate: '2026-10-31', startTime: '20:00', endDate: '2026-11-01', endTime: '10:00' }),
    ids,
    new Date('2026-10-01T12:00:00Z'),
  );
  assert.equal(result.submission.input.startsAt, '2026-11-01T00:00:00.000Z'); // EDT
  assert.equal(result.submission.input.endsAt, '2026-11-01T15:00:00.000Z'); // EST
});

test('event end on a skipped DST time is rejected', () => {
  const later = new Date('2027-01-01T00:00:00Z');
  const errors = validateListing(
    eventDraft({ startDate: '2027-03-13', startTime: '20:00', endDate: '2027-03-14', endTime: '02:15' }),
    later,
  );
  assert.match(errors.endsAt, /clocks change/);
});

test('a one-day deal runs all day today', () => {
  const result = prepareListing(dealDraft({ validFromDate: '2026-11-20', validUntilDate: '2026-11-20' }), ids, now);
  assert.equal(result.ok, true);
  assert.equal(result.submission.input.validFrom, '2026-11-20T05:00:00.000Z');
  assert.equal(result.submission.input.validUntil, '2026-11-21T04:59:00.000Z');
});

test('a deal can start earlier today; only the date must not be past', () => {
  assert.equal(validateListing(dealDraft({ validFromDate: '2026-11-20', validFromTime: '08:00' }), now).validFrom, undefined);
});

test('deal times on a skipped DST time are rejected', () => {
  const later = new Date('2027-01-01T00:00:00Z');
  const errors = validateListing(
    dealDraft({ validFromDate: '2027-03-14', validFromTime: '02:30', validUntilDate: '2027-03-15', validUntilTime: '02:30' }),
    later,
  );
  assert.match(errors.validFrom, /clocks change/);
  assert.equal(errors.validUntil, undefined);
  const untilErrors = validateListing(
    dealDraft({ validFromDate: '2027-03-13', validUntilDate: '2027-03-14', validUntilTime: '02:30' }),
    later,
  );
  assert.match(untilErrors.validUntil, /clocks change/);
});

test('switching back from deal to event keeps event times and the one category', () => {
  const event = eventDraft({ categoryIds: [MUSIC, ARTS], endDate: '2026-12-05', endTime: '20:00' });
  const back = switchListingType(switchListingType(event, 'deal'), 'event');
  assert.deepEqual(back.categoryIds, [MUSIC]);
  assert.equal(back.startTime, '18:00');
  assert.equal(back.endTime, '20:00');
});

test('only network and unknown failures are retryable', () => {
  for (const code of LISTING_ERROR_CODES) {
    assert.equal(isRetryable({ ok: false, code, message: '' }), code === 'network' || code === 'unknown', code);
  }
  assert.equal(isRetryable({ ok: true, listingId: 'x', remainingThisWeek: 1 }), false);
});

test('requestKeyFromBytes is deterministic and sets the version bits', () => {
  const bytes = Uint8Array.from({ length: 16 }, (_, i) => i);
  assert.equal(requestKeyFromBytes(bytes), '00010203-0405-4607-8809-0a0b0c0d0e0f');
  assert.notEqual(requestKeyFromBytes(bytes), requestKeyFromBytes(new Uint8Array(16)));
});

test('server field errors: first message per field wins, blanks are ignored', () => {
  assert.deepEqual(fieldErrorsFromServer({ venueId: 'Unknown venue', streetAddress: 'Too long', title: '' }), {
    location: 'Unknown venue',
  });
});
