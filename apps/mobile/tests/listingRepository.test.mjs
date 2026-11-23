import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createFixtureListingRepository,
  FIXTURE_CATEGORIES,
  FIXTURE_ORGANIZER_ID,
} from '../src/services/listingRepository.ts';

const event = (requestKey, overrides = {}) => ({
  organizerId: FIXTURE_ORGANIZER_ID,
  requestKey,
  title: 'Author reading',
  description: 'Meet a local author.',
  listingUrl: null,
  location: { venueId: null, streetAddress: '1 Main St, Amherst' },
  categoryIds: [FIXTURE_CATEGORIES[0].id],
  startsAt: '2026-12-05T23:00:00.000Z',
  endsAt: null,
  timezone: 'America/New_York',
  ...overrides,
});

test('fixture starts with 2 of 3 listings left and counts down per publish', async () => {
  const repo = createFixtureListingRepository({ delayMs: 0 });
  const ctx = await repo.getPublishingContext(FIXTURE_ORGANIZER_ID);
  assert.deepEqual(ctx, {
    organizerId: FIXTURE_ORGANIZER_ID,
    organizerName: 'Sample Bookshop',
    weeklyCap: 3,
    remainingThisWeek: 2,
  });

  const first = await repo.publishEvent(event('k1'));
  assert.equal(first.ok, true);
  assert.equal(first.remainingThisWeek, 1);
  const second = await repo.publishDeal({ ...event('k2'), categoryId: 'c', validFrom: 'a', validUntil: 'b', terms: 't', eligibilityNote: null });
  assert.equal(second.remainingThisWeek, 0);
  assert.deepEqual(repo.published.map((p) => p.type), ['event', 'deal']);

  const third = await repo.publishEvent(event('k3'));
  assert.equal(third.ok, false);
  assert.equal(third.code, 'weekly_cap_reached');
});

test('the same request key never publishes twice', async () => {
  const repo = createFixtureListingRepository({ delayMs: 0 });
  const a = await repo.publishEvent(event('same'));
  const b = await repo.publishEvent(event('same'));
  assert.deepEqual(a, b);
  assert.equal(repo.published.length, 1);
});

test('a retry after a simulated network error succeeds once', async () => {
  const repo = createFixtureListingRepository({ delayMs: 0 });
  repo.simulateError('network');
  const failed = await repo.publishEvent(event('retry'));
  assert.equal(failed.code, 'network');
  repo.simulateError(null);
  const ok = await repo.publishEvent(event('retry'));
  assert.equal(ok.ok, true);
  assert.equal(repo.published.length, 1);
});

test('simulated validation errors carry field errors', async () => {
  const repo = createFixtureListingRepository({ delayMs: 0 });
  repo.simulateError('validation');
  const result = await repo.publishEvent(event('v'));
  assert.equal(result.code, 'validation');
  assert.ok(result.fieldErrors.title);
});

test('another organizer is refused as not a member', async () => {
  const repo = createFixtureListingRepository({ delayMs: 0 });
  const result = await repo.publishEvent(event('x', { organizerId: 'someone-else' }));
  assert.equal(result.code, 'not_member');
});

test('venue search matches name or address and is empty for a blank query', async () => {
  const repo = createFixtureListingRepository({ delayMs: 0 });
  assert.deepEqual((await repo.searchVenues('jones')).map((v) => v.name), ['Jones Library']);
  assert.deepEqual((await repo.searchVenues('amity')).map((v) => v.name), ['Jones Library']);
  assert.deepEqual(await repo.searchVenues('  '), []);
});
