import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  getOccurrenceAvailability,
  isIanaTimeZone,
  isUtcIsoTimestamp,
  validateAdapterEventDraft,
} from './event.ts';

function validDraft() {
  return {
    sourceType: 'localist',
    externalId: 'event-100',
    sourceUrl: 'https://events.umass.edu/event/example',
    sourceUpdatedAt: '2026-10-17T12:30:00Z',
    title: 'Example event',
    description: 'A plain-text event description.',
    imageUrl: 'https://events.umass.edu/image/example.jpg',
    organization: {
      name: 'Example Organization',
      externalId: 'group-10',
      sourceUrl: 'https://events.umass.edu/group/example',
    },
    categoryLabels: ['Campus', 'Arts'],
    primaryCategoryLabel: 'Campus',
    status: 'published',
    visibility: 'public',
    timezone: 'America/New_York',
    registrationType: 'external',
    registrationUrl: 'https://events.umass.edu/event/example/register',
    isFree: true,
    featuredRank: null,
    occurrences: [
      {
        sourceType: 'localist',
        externalId: 'event-100-instance-1',
        startsAt: '2026-10-20T22:00:00Z',
        endsAt: '2026-10-21T00:00:00Z',
        allDay: false,
        status: 'scheduled',
        locationType: 'physical',
        locationName: 'Campus Center, Room 101',
        venue: null,
        coordinates: { latitude: 42.3912, longitude: -72.5267 },
        virtualUrl: null,
        sourceAttendanceCount: 12,
        sourceUpdatedAt: '2026-10-17T12:30:00Z',
      },
    ],
  };
}

test('accepts a valid provider-neutral event draft', () => {
  const result = validateAdapterEventDraft(validDraft());
  assert.equal(result.ok, true);
});

test('requires UTC timestamps and an IANA display timezone', () => {
  assert.equal(isUtcIsoTimestamp('2026-10-20T22:00:00Z'), true);
  assert.equal(isUtcIsoTimestamp('Tue, Oct 20 at 6 PM'), false);
  assert.equal(isUtcIsoTimestamp('2026-10-20T18:00:00-04:00'), false);
  assert.equal(isIanaTimeZone('America/New_York'), true);
  assert.equal(isIanaTimeZone('UTC'), true);
  assert.equal(isIanaTimeZone('EST'), false);

  const draft = validDraft();
  draft.timezone = 'EST';
  draft.occurrences[0].startsAt = 'October 20, 2026';
  const result = validateAdapterEventDraft(draft);
  assert.equal(result.ok, false);
  assert.deepEqual(
    new Set(result.issues.map((issue) => issue.code)),
    new Set(['invalid_timezone', 'invalid_timestamp']),
  );
});

test('requires stable external identities for imported events and occurrences', () => {
  const draft = validDraft();
  draft.externalId = null;
  draft.occurrences[0].externalId = null;
  const result = validateAdapterEventDraft(draft);
  assert.equal(result.ok, false);
  assert.equal(result.issues.filter((issue) => issue.code === 'invalid_source_identity').length, 2);
});

test('rejects an occurrence whose source differs from its parent event', () => {
  const draft = validDraft();
  draft.occurrences[0].sourceType = 'campus_pulse';
  const result = validateAdapterEventDraft(draft);
  assert.equal(result.ok, false);
  assert.deepEqual(
    result.issues.filter((issue) => issue.code === 'source_type_mismatch'),
    [{
      code: 'source_type_mismatch',
      path: 'occurrences[0].sourceType',
      message: 'Occurrence source type must match its parent event source type.',
    }],
  );
});

test('rejects discriminator values outside the deployed SQL enums', () => {
  const draft = validDraft();
  draft.status = 'deleted';
  draft.visibility = 'members';
  draft.registrationType = 'ticketed';
  draft.occurrences[0].status = 'moved';
  draft.occurrences[0].locationType = 'unknown';
  const result = validateAdapterEventDraft(draft);
  assert.equal(result.ok, false);
  assert.equal(result.issues.filter((issue) => issue.code === 'invalid_enum_value').length, 5);
});

test('enforces external registration requirements', () => {
  const draft = validDraft();
  draft.registrationUrl = null;
  const result = validateAdapterEventDraft(draft);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.code === 'invalid_registration'));
});

test('accepts each location mode exactly as permitted by the SQL constraint', () => {
  const physical = validDraft();
  assert.equal(validateAdapterEventDraft(physical).ok, true);

  const virtual = validDraft();
  Object.assign(virtual.occurrences[0], {
    locationType: 'virtual',
    locationName: 'Online event',
    venue: null,
    coordinates: null,
    virtualUrl: 'https://example.org/meeting',
  });
  assert.equal(
    validateAdapterEventDraft(virtual).ok,
    true,
    'SQL permits location_name for virtual occurrences',
  );

  const hybrid = validDraft();
  Object.assign(hybrid.occurrences[0], {
    locationType: 'hybrid',
    virtualUrl: 'https://example.org/meeting',
  });
  assert.equal(validateAdapterEventDraft(hybrid).ok, true);
});

test('rejects physical and hybrid occurrences missing SQL-required fields', () => {
  const physicalWithVirtualUrl = validDraft();
  physicalWithVirtualUrl.occurrences[0].virtualUrl = 'https://example.org/meeting';
  assert.equal(validateAdapterEventDraft(physicalWithVirtualUrl).ok, false);

  const physicalWithoutLocator = validDraft();
  Object.assign(physicalWithoutLocator.occurrences[0], {
    locationName: null,
    venue: null,
    coordinates: null,
  });
  assert.equal(validateAdapterEventDraft(physicalWithoutLocator).ok, false);

  const hybridWithoutVirtualUrl = validDraft();
  hybridWithoutVirtualUrl.occurrences[0].locationType = 'hybrid';
  assert.equal(validateAdapterEventDraft(hybridWithoutVirtualUrl).ok, false);

  const hybridWithoutPhysicalLocator = validDraft();
  Object.assign(hybridWithoutPhysicalLocator.occurrences[0], {
    locationType: 'hybrid',
    locationName: null,
    venue: null,
    coordinates: null,
    virtualUrl: 'https://example.org/meeting',
  });
  assert.equal(validateAdapterEventDraft(hybridWithoutPhysicalLocator).ok, false);
});

test('rejects virtual occurrences with SQL-prohibited physical fields', () => {
  const missingVirtualUrl = validDraft();
  Object.assign(missingVirtualUrl.occurrences[0], {
    locationType: 'virtual',
    venue: null,
    coordinates: null,
    virtualUrl: null,
  });
  assert.equal(validateAdapterEventDraft(missingVirtualUrl).ok, false);

  const withVenue = validDraft();
  Object.assign(withVenue.occurrences[0], {
    locationType: 'virtual',
    venue: {
      name: 'Campus Center',
      externalId: 'venue-1',
      sourceUrl: null,
      room: null,
      addressLine1: null,
      addressLine2: null,
      city: null,
      region: null,
      postalCode: null,
      countryCode: 'US',
      coordinates: null,
    },
    coordinates: null,
    virtualUrl: 'https://example.org/meeting',
  });
  assert.equal(validateAdapterEventDraft(withVenue).ok, false);

  const withCoordinates = validDraft();
  Object.assign(withCoordinates.occurrences[0], {
    locationType: 'virtual',
    venue: null,
    coordinates: { latitude: 42.3912, longitude: -72.5267 },
    virtualUrl: 'https://example.org/meeting',
  });
  assert.equal(validateAdapterEventDraft(withCoordinates).ok, false);
});

test('rejects blank and duplicate normalized category labels', () => {
  const draft = validDraft();
  draft.categoryLabels = ['Campus Events', '  ', ' campus   events '];
  draft.primaryCategoryLabel = 'CAMPUS EVENTS';
  const result = validateAdapterEventDraft(draft);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.code === 'invalid_category'));
  assert.ok(result.issues.some((issue) => issue.code === 'duplicate_category'));
});

test('matches the primary category using normalized labels', () => {
  const matching = validDraft();
  matching.categoryLabels = ['Campus   Events', 'Arts'];
  matching.primaryCategoryLabel = ' campus events ';
  assert.equal(validateAdapterEventDraft(matching).ok, true);

  const missing = validDraft();
  missing.primaryCategoryLabel = 'Dining';
  const result = validateAdapterEventDraft(missing);
  assert.equal(result.ok, false);
  assert.ok(
    result.issues.some(
      (issue) => issue.code === 'invalid_category' && issue.path === 'primaryCategoryLabel',
    ),
  );
});

test('requires an exclusive end instant for all-day occurrences', () => {
  const draft = validDraft();
  draft.occurrences[0].allDay = true;
  draft.occurrences[0].endsAt = null;
  const result = validateAdapterEventDraft(draft);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.code === 'invalid_all_day_range'));
});

test('rejects provider HTML in the canonical plain-text description', () => {
  const draft = validDraft();
  draft.description = '<p>Provider markup</p>';
  const result = validateAdapterEventDraft(draft);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.code === 'description_contains_html'));
});

test('applies cancellation and postponement as availability overrides', () => {
  assert.equal(getOccurrenceAvailability('published', 'scheduled'), 'available');
  assert.equal(getOccurrenceAvailability('cancelled', 'scheduled'), 'cancelled');
  assert.equal(getOccurrenceAvailability('published', 'cancelled'), 'cancelled');
  assert.equal(getOccurrenceAvailability('postponed', 'scheduled'), 'postponed');
  assert.equal(getOccurrenceAvailability('published', 'postponed'), 'postponed');
  assert.equal(getOccurrenceAvailability('draft', 'scheduled'), 'unavailable');
  assert.equal(getOccurrenceAvailability('archived', 'scheduled'), 'unavailable');
});

test('contract literals and fields stay aligned with the deployed SQL migration', async () => {
  const sqlUrl = new URL('../../supabase/migrations/202610120001_initial_event_foundation.sql', import.meta.url);
  const sql = await readFile(sqlUrl, 'utf8');
  const requiredFragments = [
    "source_type in ('localist', 'campus_pulse', 'amherst_connect')",
    "status in ('draft', 'published', 'cancelled', 'postponed', 'archived')",
    "status in ('scheduled', 'cancelled', 'postponed')",
    "visibility in ('public', 'authenticated', 'private')",
    "registration_type in ('none', 'internal', 'external')",
    "location_type in ('physical', 'virtual', 'hybrid')",
    'timezone text not null',
    'image_url text',
    'source_attendance_count integer',
    'event_occurrences_source_external_id_key',
  ];
  for (const fragment of requiredFragments) {
    assert.ok(sql.includes(fragment), `SQL migration is missing: ${fragment}`);
  }
});
