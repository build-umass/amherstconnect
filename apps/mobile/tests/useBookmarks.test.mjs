import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSavedEvents } from '../src/services/savedEvents.ts';

/** Creates one bookmark test row. */
function bookmark(eventId, createdAt) {
  return {
    profileId: 'profile-1',
    eventId,
    createdAt,
    updatedAt: createdAt,
  };
}

/** Creates one canonical event stub. */
function event(id) {
  return { event: { id } };
}

/** Preserves bookmark order after hydration. */
test('loadSavedEvents resolves events in newest bookmark order', async () => {
  const bookmarks = {
    list: async () => [
      bookmark('event-new', '2026-11-02T12:00:00Z'),
      bookmark('event-old', '2026-11-01T12:00:00Z'),
    ],
  };
  let requestedIds;
  const events = {
    async getByIds(ids) {
      requestedIds = ids;
      return [event('event-old'), event('event-new')];
    },
  };

  const result = await loadSavedEvents(bookmarks, events);
  assert.deepEqual(requestedIds, ['event-new', 'event-old']);
  assert.deepEqual(result.map((item) => item.event.id), ['event-new', 'event-old']);
});

/** Skips missing or deleted events. */
test('loadSavedEvents omits unresolved event IDs', async () => {
  const bookmarks = {
    list: async () => [bookmark('available', '2026-11-02T12:00:00Z'), bookmark('missing', '2026-11-01T12:00:00Z')],
  };
  const events = { getByIds: async () => [event('available')] };
  const result = await loadSavedEvents(bookmarks, events);
  assert.deepEqual(result.map((item) => item.event.id), ['available']);
});

/** Avoids unnecessary empty event queries. */
test('loadSavedEvents skips E02 for no bookmarks', async () => {
  let called = false;
  const bookmarks = { list: async () => [] };
  const events = {
    async getByIds() {
      called = true;
      return [];
    },
  };
  assert.deepEqual(await loadSavedEvents(bookmarks, events), []);
  assert.equal(called, false);
});
