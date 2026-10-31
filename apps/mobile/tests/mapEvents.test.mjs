import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  regionToBounds,
  timeWindowFor,
  toMapOccurrence,
  fetchMapOccurrences,
  toMapPinEvent,
  categoryForSlug,
} from '../src/services/mapEvents.ts';

const validRow = {
  occurrence_id: 'occ-1',
  event_id: 'evt-1',
  title: 'Tuesday Night Jazz Jam',
  category_name: 'Music',
  category_slug: 'music',
  starts_at: '2026-11-03T23:00:00Z',
  ends_at: '2026-11-04T01:00:00Z',
  all_day: false,
  timezone: 'America/New_York',
  event_status: 'published',
  occurrence_status: 'scheduled',
  location_name: 'Bowker Auditorium',
  latitude: 42.3914,
  longitude: -72.5262,
};

test('regionToBounds converts a region without padding', () => {
  const bounds = regionToBounds(
    { latitude: 42.39, longitude: -72.53, latitudeDelta: 0.02, longitudeDelta: 0.04 },
    0,
  );
  assert.ok(Math.abs(bounds.minLat - 42.38) < 1e-9);
  assert.ok(Math.abs(bounds.maxLat - 42.4) < 1e-9);
  assert.ok(Math.abs(bounds.minLng - -72.55) < 1e-9);
  assert.ok(Math.abs(bounds.maxLng - -72.51) < 1e-9);
});

test('regionToBounds pads the box and clamps to valid coordinates', () => {
  const padded = regionToBounds({ latitude: 0, longitude: 0, latitudeDelta: 2, longitudeDelta: 2 }, 0.5);
  assert.equal(padded.maxLat, 1.5);
  const clamped = regionToBounds({ latitude: 89, longitude: 179, latitudeDelta: 10, longitudeDelta: 10 }, 0);
  assert.equal(clamped.maxLat, 90);
  assert.equal(clamped.maxLng, 180);
});

test('timeWindowFor builds real windows for each filter', () => {
  const now = new Date('2026-11-03T15:00:00Z');
  const nowWindow = timeWindowFor('Now', now);
  assert.equal(nowWindow.start.getTime(), now.getTime());
  assert.equal(nowWindow.end.getTime() - now.getTime(), 60 * 60 * 1000);

  const today = timeWindowFor('Today', now);
  assert.equal(today.end.getHours(), 0);
  assert.equal(today.end.getMinutes(), 0);
  assert.ok(today.end > now);
  assert.ok(today.end.getTime() - now.getTime() <= 24 * 60 * 60 * 1000);

  const week = timeWindowFor('This Week', now);
  assert.equal(week.end.getTime() - now.getTime(), 7 * 24 * 60 * 60 * 1000);
  assert.deepEqual(timeWindowFor('Something else', now), week);
});

test('toMapOccurrence maps a valid row', () => {
  const occurrence = toMapOccurrence(validRow);
  assert.equal(occurrence.occurrenceId, 'occ-1');
  assert.equal(occurrence.eventId, 'evt-1');
  assert.equal(occurrence.availability, 'available');
  assert.equal(occurrence.latitude, 42.3914);
});

test('toMapOccurrence rejects rows without usable coordinates or IDs', () => {
  assert.equal(toMapOccurrence({ ...validRow, latitude: null }), null);
  assert.equal(toMapOccurrence({ ...validRow, longitude: Number.NaN }), null);
  assert.equal(toMapOccurrence({ ...validRow, occurrence_id: '' }), null);
  assert.equal(toMapOccurrence(null), null);
});

test('toMapOccurrence reports cancelled and postponed availability', () => {
  assert.equal(toMapOccurrence({ ...validRow, occurrence_status: 'cancelled' }).availability, 'cancelled');
  assert.equal(toMapOccurrence({ ...validRow, event_status: 'postponed' }).availability, 'postponed');
});

test('fetchMapOccurrences sends the right arguments and drops bad rows', async () => {
  let called;
  const rpc = async (fn, args) => {
    called = { fn, args };
    return { data: [validRow, { ...validRow, latitude: null }], error: null };
  };
  const window = {
    start: new Date('2026-11-02T00:00:00Z'),
    end: new Date('2026-11-09T00:00:00Z'),
  };
  const result = await fetchMapOccurrences(
    rpc,
    { minLat: 42.37, minLng: -72.55, maxLat: 42.4, maxLng: -72.5 },
    window,
  );

  assert.equal(called.fn, 'map_occurrences_in_bounds');
  assert.deepEqual(called.args, {
    p_min_lat: 42.37,
    p_min_lng: -72.55,
    p_max_lat: 42.4,
    p_max_lng: -72.5,
    p_window_start: '2026-11-02T00:00:00.000Z',
    p_window_end: '2026-11-09T00:00:00.000Z',
    p_limit: 200,
  });
  assert.equal(result.length, 1);
});

test('fetchMapOccurrences throws a clear error when the query fails', async () => {
  const rpc = async () => ({ data: null, error: { message: 'permission denied' } });
  await assert.rejects(
    fetchMapOccurrences(rpc, { minLat: 0, minLng: 0, maxLat: 1, maxLng: 1 }, timeWindowFor('Now')),
    /Could not load map events: permission denied/,
  );
});

test('toMapPinEvent formats date and time in the event timezone', () => {
  const pin = toMapPinEvent(toMapOccurrence(validRow));
  assert.equal(pin.id, 'occ-1');
  assert.equal(pin.eventId, 'evt-1');
  assert.equal(pin.date, 'Tue, Nov 3');
  assert.equal(pin.time, '6:00 PM');
  assert.equal(pin.category, 'Arts & Music');
  assert.equal(pin.emoji, '🎵');
});

test('toMapPinEvent handles all-day events and missing locations', () => {
  const pin = toMapPinEvent(toMapOccurrence({ ...validRow, all_day: true, location_name: null }));
  assert.equal(pin.time, 'All day');
  assert.equal(pin.location, 'Location TBA');
});

test('unknown category slugs fall back to a default pin', () => {
  assert.deepEqual(categoryForSlug('not-a-real-slug'), { category: 'Campus', emoji: '📍' });
});