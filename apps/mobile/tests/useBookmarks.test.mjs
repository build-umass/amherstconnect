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

/** Creates one E02 event detail stub. */
function detail(eventId) {
  return { eventId, title: eventId };
}

const toEvent = (item) => ({ id: item.eventId });

/** Preserves bookmark order after hydration. */
test('loadSavedEvents resolves events through E02 in newest bookmark order', async () => {
  const bookmarks = {
    list: async () => [
      bookmark('event-new', '2026-11-02T12:00:00Z'),
      bookmark('event-old', '2026-11-01T12:00:00Z'),
    ],
  };
  const requestedIds = [];
  const events = {
    async getEventById(id) {
      requestedIds.push(id);
      return detail(id);
    },
  };

  const result = await loadSavedEvents(bookmarks, events, toEvent);
  assert.deepEqual(requestedIds, ['event-new', 'event-old']);
  assert.deepEqual(result, [{ id: 'event-new' }, { id: 'event-old' }]);
});

/** Skips missing or deleted events. */
test('loadSavedEvents omits events E02 cannot find', async () => {
  const bookmarks = {
    list: async () => [bookmark('available', '2026-11-02T12:00:00Z'), bookmark('missing', '2026-11-01T12:00:00Z')],
  };
  const events = { getEventById: async (id) => (id === 'available' ? detail(id) : null) };
  assert.deepEqual(await loadSavedEvents(bookmarks, events, toEvent), [{ id: 'available' }]);
});

/** Avoids unnecessary event queries. */
test('loadSavedEvents skips E02 for no bookmarks', async () => {
  let called = false;
  const bookmarks = { list: async () => [] };
  const events = {
    async getEventById() {
      called = true;
      return null;
    },
  };
  assert.deepEqual(await loadSavedEvents(bookmarks, events, toEvent), []);
  assert.equal(called, false);
});

/** Surfaces E02 failures instead of showing a false empty list. */
test('loadSavedEvents rejects when E02 fails', async () => {
  const bookmarks = { list: async () => [bookmark('event-1', '2026-11-02T12:00:00Z')] };
  const events = { getEventById: async () => { throw new Error('Could not load event: offline'); } };
  await assert.rejects(loadSavedEvents(bookmarks, events, toEvent), /Could not load event: offline/);
});
