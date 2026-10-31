import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  regionToBounds,
  timeWindowFor,
  toMapOccurrence,
  fetchMapOccurrences,
  toMapPinEvent,
  categoryForSlug,
  MAP_CATEGORY_SLUGS,
  reconcileSelection,
  findHighlightToCenter,
} from '../src/services/mapEvents.ts';

const validRow = {
  occurrence_id: 'occ-1',
  event_id: 'evt-1',
  title: 'Fall Gallery Opening',
  category_name: 'Arts & Culture',
  category_slug: 'arts-culture',
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

// ── Bounds and time windows ──────────────────────────────────────────────────

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

// ── Rows and fetching ────────────────────────────────────────────────────────

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

// ── Pins and categories (fix 5) ──────────────────────────────────────────────

test('toMapPinEvent formats date and time in the event timezone', () => {
  const pin = toMapPinEvent(toMapOccurrence(validRow));
  assert.equal(pin.id, 'occ-1');
  assert.equal(pin.eventId, 'evt-1');
  assert.equal(pin.date, 'Tue, Nov 3');
  assert.equal(pin.time, '6:00 PM');
  assert.equal(pin.category, 'Arts & Culture');
  assert.equal(pin.emoji, '🎨');
  assert.equal(pin.pinColor, '#BD1479');
});

test('toMapPinEvent handles all-day events and missing locations', () => {
  const pin = toMapPinEvent(toMapOccurrence({ ...validRow, all_day: true, location_name: null }));
  assert.equal(pin.time, 'All day');
  assert.equal(pin.location, 'Location TBA');
});

test('every agreed category slug maps to its own label, emoji and color', () => {
  const expected = {
    'talks-lectures': 'Talks & Lectures',
    'workshops-classes': 'Workshops & Classes',
    'arts-culture': 'Arts & Culture',
    'sports-recreation': 'Sports & Recreation',
    'career-networking': 'Career & Networking',
    'health-wellness': 'Health & Wellness',
    'social-community': 'Social & Community',
    'food-drink': 'Food & Drink',
  };
  assert.deepEqual([...MAP_CATEGORY_SLUGS].sort(), Object.keys(expected).sort());
  for (const [slug, label] of Object.entries(expected)) {
    assert.equal(categoryForSlug(slug).category, label, slug);
  }
  const colors = MAP_CATEGORY_SLUGS.map(slug => categoryForSlug(slug).color);
  assert.equal(new Set(colors).size, colors.length, 'each category has a distinct color');
});

test('unknown category slugs fall back to a default pin', () => {
  assert.deepEqual(categoryForSlug('not-a-real-slug'), {
    category: 'Social & Community',
    emoji: '📍',
    color: '#8B1A1A',
  });
});

// ── Selection after reload (fix 3) ───────────────────────────────────────────

test('reconcileSelection closes the card when its pin disappears', () => {
  const selected = { id: 'occ-1', title: 'Old' };
  assert.equal(reconcileSelection(selected, [{ id: 'occ-2', title: 'Other' }]), null);
});

test('reconcileSelection refreshes the card when its pin remains', () => {
  const selected = { id: 'occ-1', title: 'Old title' };
  const fresh = { id: 'occ-1', title: 'New title' };
  assert.equal(reconcileSelection(selected, [fresh]), fresh);
});

test('reconcileSelection keeps nothing selected when nothing was selected', () => {
  assert.equal(reconcileSelection(null, [{ id: 'occ-1' }]), null);
});

// ── Highlight centering (fix 4) ──────────────────────────────────────────────

test('findHighlightToCenter centers on the highlighted event the first time', () => {
  const pin = { id: 'occ-1', eventId: 'evt-1', latitude: 42.39, longitude: -72.52 };
  assert.equal(findHighlightToCenter('evt-1', null, [pin]), pin);
});

test('findHighlightToCenter does not re-center after reloads for the same highlight', () => {
  const pin = { id: 'occ-1', eventId: 'evt-1', latitude: 42.39, longitude: -72.52 };
  assert.equal(findHighlightToCenter('evt-1', 'evt-1', [pin]), null);
});

test('findHighlightToCenter ignores missing highlights and pins without coordinates', () => {
  const noCoords = { id: 'occ-1', eventId: 'evt-1' };
  assert.equal(findHighlightToCenter(null, null, [noCoords]), null);
  assert.equal(findHighlightToCenter('evt-1', null, [noCoords]), null);
  assert.equal(findHighlightToCenter('evt-9', null, []), null);
});