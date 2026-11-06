import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canLoadMore,
  feedReducer,
  formatEventDate,
  formatEventTime,
  initialFeedState,
  toFeedCardEvent,
} from '../src/services/eventFeed.ts';

const item = (n, overrides = {}) => ({
  eventId: `00000000-0000-4000-8000-00000000000${n}`,
  occurrenceId: `occ-${n}`,
  title: `Event ${n}`,
  categoryName: 'Food & Drink',
  categorySlug: 'food-drink',
  organizerName: 'Dining',
  startsAt: '2026-11-12T23:00:00+00:00',
  endsAt: null,
  allDay: false,
  timezone: 'America/New_York',
  locationType: 'physical',
  locationName: 'Campus Center',
  latitude: 42.39,
  longitude: -72.52,
  isFree: true,
  imageUrl: null,
  ...overrides,
});

const style = { category: 'Food & Drink', emoji: '🍽️' };
const page = (items, nextCursor = null) => ({ items, nextCursor });
const cursor = { startsAt: '2026-11-12T23:00:00+00:00', eventId: 'x' };

// ── Display ──────────────────────────────────────────────────────────────────

test('dates and times show in the event timezone', () => {
  assert.equal(formatEventDate('2026-11-12T23:00:00Z', 'America/New_York'), 'Thu, Nov 12');
  assert.equal(formatEventTime('2026-11-12T23:00:00Z', 'America/New_York', false), '6:00 PM');
  assert.equal(formatEventTime('2026-11-12T23:00:00Z', 'America/New_York', true), 'All day');
});

test('toFeedCardEvent uses the canonical event ID as id', () => {
  const card = toFeedCardEvent(item(1), style);
  assert.equal(card.id, '00000000-0000-4000-8000-000000000001');
  assert.equal(card.occurrenceId, 'occ-1');
  assert.equal(card.category, 'Food & Drink');
  assert.equal(card.organizer, 'Dining');
  assert.equal(card.time, '6:00 PM');
});

test('toFeedCardEvent labels missing and online locations', () => {
  assert.equal(toFeedCardEvent(item(1, { locationName: null }), style).location, 'Location TBA');
  assert.equal(toFeedCardEvent(item(1, { locationName: null, locationType: 'virtual' }), style).location, 'Online');
});

test('toFeedCardEvent leaves coordinates out when there are none', () => {
  const card = toFeedCardEvent(item(1, { latitude: null, longitude: null }), style);
  assert.equal(card.latitude, undefined);
  assert.equal(card.longitude, undefined);
});

// ── State ────────────────────────────────────────────────────────────────────

test('a new query starts in loading with nothing shown', () => {
  const state = feedReducer({ ...initialFeedState, status: 'ready', items: [item(1)] }, { type: 'start', requestId: 1 });
  assert.equal(state.status, 'loading');
  assert.deepEqual(state.items, []);
});

test('loaded results are ready; no results are empty', () => {
  const start = feedReducer(initialFeedState, { type: 'start', requestId: 1 });
  assert.equal(feedReducer(start, { type: 'loaded', requestId: 1, page: page([item(1)]) }).status, 'ready');
  assert.equal(feedReducer(start, { type: 'loaded', requestId: 1, page: page([]) }).status, 'empty');
});

test('a failure shows an error and no fallback events', () => {
  const start = feedReducer(initialFeedState, { type: 'start', requestId: 1 });
  const state = feedReducer(start, { type: 'failed', requestId: 1, error: 'offline' });
  assert.equal(state.status, 'error');
  assert.equal(state.error, 'offline');
  assert.deepEqual(state.items, []);
});

test('answers to an old query are ignored', () => {
  const newer = feedReducer(initialFeedState, { type: 'start', requestId: 2 });
  const state = feedReducer(newer, { type: 'loaded', requestId: 1, page: page([item(1)]) });
  assert.equal(state.status, 'loading');
  assert.deepEqual(state.items, []);
});

test('load more appends the next page without duplicates', () => {
  let state = feedReducer(initialFeedState, { type: 'start', requestId: 1 });
  state = feedReducer(state, { type: 'loaded', requestId: 1, page: page([item(1), item(2)], cursor) });
  assert.equal(canLoadMore(state), true);

  state = feedReducer(state, { type: 'moreStart', requestId: 1 });
  assert.equal(canLoadMore(state), false, 'no double loading');

  state = feedReducer(state, { type: 'moreLoaded', requestId: 1, page: page([item(2), item(3)]) });
  assert.deepEqual(state.items.map(i => i.occurrenceId), ['occ-1', 'occ-2', 'occ-3']);
  assert.equal(state.nextCursor, null);
  assert.equal(canLoadMore(state), false, 'last page reached');
});

test('a failed load more keeps the events already shown', () => {
  let state = feedReducer(initialFeedState, { type: 'start', requestId: 1 });
  state = feedReducer(state, { type: 'loaded', requestId: 1, page: page([item(1)], cursor) });
  state = feedReducer(state, { type: 'moreStart', requestId: 1 });
  state = feedReducer(state, { type: 'moreFailed', requestId: 1, error: 'timeout' });
  assert.equal(state.status, 'ready');
  assert.equal(state.items.length, 1);
  assert.equal(state.loadMoreError, 'timeout');
  assert.equal(canLoadMore(state), true, 'can retry');
});

test('load more is not allowed while loading, empty or failed', () => {
  assert.equal(canLoadMore(initialFeedState), false);
  assert.equal(canLoadMore({ ...initialFeedState, status: 'error', nextCursor: cursor }), false);
});
