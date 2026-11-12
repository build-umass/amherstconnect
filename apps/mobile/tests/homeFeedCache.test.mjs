import test from 'node:test';
import assert from 'node:assert/strict';
import { createHomeFeedCache, loadProfileForHome } from '../src/services/homeFeedCache.ts';

const now = Date.parse('2026-11-11T12:00:00Z');
const item = {
  eventId: 'e0000000-0000-4000-8000-000000000004',
  occurrenceId: 'f0000000-0000-4000-8000-000000000403',
  title: 'Open studio',
  categoryName: 'Arts',
  categorySlug: 'arts-culture',
  organizerName: null,
  startsAt: '2026-11-12T12:00:00Z',
  endsAt: null,
  allDay: false,
  timezone: 'America/New_York',
  locationType: 'physical',
  locationName: 'Campus',
  latitude: null,
  longitude: null,
  isFree: true,
  imageUrl: null,
};

function memoryStorage() {
  const entries = new Map();
  return {
    entries,
    getItem: async key => entries.get(key) ?? null,
    setItem: async (key, value) => { entries.set(key, value); },
  };
}

test('a new cache instance restores canonical IDs for only the matching account', async () => {
  const storage = memoryStorage();
  await createHomeFeedCache(storage).write('first-account', [item]);
  const restarted = createHomeFeedCache(storage);
  assert.deepEqual(await restarted.read('first-account', now), [item]);
  assert.equal(await restarted.read('other-account', now), null);
});

test('distinguishes a successful empty page from missing or corrupt cache', async () => {
  const storage = memoryStorage();
  const cache = createHomeFeedCache(storage);
  assert.equal(await cache.read('account', now), null);
  await cache.write('account', []);
  assert.deepEqual(await cache.read('account', now), []);
  const [key] = storage.entries.keys();
  for (const corrupt of ['{', '[{}]', JSON.stringify([{ ...item, startsAt: 'invalid' }])]) {
    storage.entries.set(key, corrupt);
    assert.equal(await cache.read('account', now), null);
  }
});

test('expired cached occurrences are omitted', async () => {
  const cache = createHomeFeedCache(memoryStorage());
  await cache.write('account', [{ ...item, startsAt: '2026-11-10T12:00:00Z' }, item]);
  assert.deepEqual(await cache.read('account', now), [item]);
});

test('offline restart restores only a completed profile for the restored session', async () => {
  const storage = memoryStorage();
  const profile = {
    id: 'account', displayName: 'Student', avatarUrl: null, role: 'student',
    interests: [], notificationPrefs: { newEvents: false, savedReminders: true },
    onboardingComplete: true, createdAt: '2026-11-11', updatedAt: '2026-11-11',
  };
  const networkError = new Error('Network unavailable');
  const failure = async () => { throw networkError; };
  const opts = { storage, accountId: 'account', offline: async () => true };
  await loadProfileForHome({ ...opts, load: async () => profile });
  assert.deepEqual(await loadProfileForHome({ ...opts, load: failure }), profile);
  await assert.rejects(loadProfileForHome({ ...opts, accountId: 'other', load: failure }), networkError);
  await assert.rejects(loadProfileForHome({ ...opts, offline: async () => false, load: failure }), networkError);
  const revoked = Object.assign(new Error('Revoked'), { code: 'session_not_found' });
  await assert.rejects(loadProfileForHome({ ...opts, load: async () => { throw revoked; } }), revoked);
});
