import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LocalistAdapter, fetchLocalistEvents } from './localist.ts';

const adapter = new LocalistAdapter();
const fixture = (name) => JSON.parse(readFileSync(new URL(`../../tests/fixtures/localist/${name}.json`, import.meta.url), 'utf8')).events[0].event;
const input = (raw) => ({ sourceType: 'localist', fetchedAt: '2026-10-26T12:00:00.000Z', sourceUrl: 'https://events.umass.edu/api/2/events', raw });

for (const name of ['normal', 'recurring', 'all-day', 'incomplete']) {
  test(`Localist adapter maps ${name} F14 fixture to the event contract`, () => {
    const source = fixture(name);
    const result = adapter.adapt(input(source));
    assert.equal(result.ok, true, result.ok ? '' : JSON.stringify(result.issues));
    assert.equal(result.value.externalId, String(source.id));
    assert.equal(result.value.occurrences.length, source.event_instances.length);
    assert.equal(result.value.occurrences[0].externalId, String(source.event_instances[0].event_instance.id));
    assert.equal(result.value.timezone, 'America/New_York');
    assert.equal(result.value.status, 'published');
    assert.doesNotMatch(result.value.description ?? '', /<\/?[a-z][^>]*>/i);
  });
}

test('all-day Localist ranges use local midnight and an exclusive end date', () => {
  const result = adapter.adapt(input(fixture('all-day')));
  assert.equal(result.ok, true);
  assert.equal(result.value.occurrences[0].startsAt, '2026-10-19T04:00:00.000Z');
  assert.equal(result.value.occurrences[0].endsAt, '2026-10-24T04:00:00.000Z');
  assert.equal(result.value.occurrences[0].allDay, true);
});

test('all-day boundaries preserve the daylight-saving offset change', () => {
  const source = structuredClone(fixture('all-day'));
  source.first_date = '2026-11-01';
  source.last_date = '2026-11-01';
  source.event_instances[0].event_instance.start = '2026-11-01T00:00:00-04:00';
  const result = adapter.adapt(input(source));
  assert.equal(result.ok, true);
  assert.equal(result.value.occurrences[0].startsAt, '2026-11-01T04:00:00.000Z');
  assert.equal(result.value.occurrences[0].endsAt, '2026-11-02T05:00:00.000Z');
});

test('all-day repeated instances keep individual one-day boundaries', () => {
  const source = structuredClone(fixture('all-day'));
  const next = structuredClone(source.event_instances[0]);
  next.event_instance.id = 2201;
  next.event_instance.start = '2026-10-20T00:00:00-04:00';
  source.event_instances.push(next);
  const result = adapter.adapt(input(source));
  assert.equal(result.ok, true);
  assert.equal(result.value.occurrences[1].startsAt, '2026-10-20T04:00:00.000Z');
  assert.equal(result.value.occurrences[1].endsAt, '2026-10-21T04:00:00.000Z');
});

test('all-day occurrences preserve the end date supplied on the Localist instance', () => {
  const source = structuredClone(fixture('all-day'));
  source.last_date = '2026-10-20';
  source.event_instances[0].event_instance.end = '2026-10-24T00:00:00-04:00';
  const result = adapter.adapt(input(source));
  assert.equal(result.ok, true);
  assert.equal(result.value.occurrences[0].endsAt, '2026-10-24T04:00:00.000Z');
});

test('Localist attendance flags do not create internal registration', () => {
  const source = structuredClone(fixture('normal'));
  source.allows_attendance = true;
  source.has_register = true;
  assert.equal(adapter.adapt(input(source)).value.registrationType, 'none');
  source.ticket_url = 'https://example.edu/register';
  const withRegistrationLink = adapter.adapt(input(source));
  assert.equal(withRegistrationLink.value.registrationType, 'external');
  assert.equal(withRegistrationLink.value.registrationUrl, 'https://example.edu/register');
});

test('online-only Localist events discard physical location fields', () => {
  const source = structuredClone(fixture('normal'));
  source.experience = 'online';
  source.stream_url = 'https://example.edu/stream';
  source.location_name = 'Campus Hall';
  source.geo.latitude = '42.391';
  source.geo.longitude = '-72.526';
  const result = adapter.adapt(input(source));
  assert.equal(result.ok, true);
  assert.equal(result.value.occurrences[0].locationType, 'virtual');
  assert.equal(result.value.occurrences[0].locationName, null);
  assert.equal(result.value.occurrences[0].venue, null);
  assert.equal(result.value.occurrences[0].coordinates, null);
});

test('HTML fallback is decoded to plain text and occurrence status is mapped', () => {
  const source = structuredClone(fixture('normal'));
  source.description_text = null;
  source.description = '<p>Pizza &amp; <b>Puzzles</b></p><p>It&#39;s free&nbsp;today.</p>';
  source.event_instances[0].event_instance.status = 'cancelled';
  const result = adapter.adapt(input(source));
  assert.equal(result.ok, true);
  assert.equal(result.value.description, "Pizza & Puzzles\nIt's free today.");
  assert.equal(result.value.occurrences[0].status, 'cancelled');
});

test('event cancellation and postponement are mapped from explicit Localist statuses', () => {
  const cancelled = structuredClone(fixture('normal'));
  cancelled.status = 'cancelled';
  assert.equal(adapter.adapt(input(cancelled)).value.status, 'cancelled');
  const postponed = structuredClone(fixture('normal'));
  postponed.event_instances[0].event_instance.status = 'postponed';
  assert.equal(adapter.adapt(input(postponed)).value.occurrences[0].status, 'postponed');
});

test('missing event and occurrence identities fail rather than creating unstable import keys', () => {
  const noEventId = structuredClone(fixture('normal'));
  delete noEventId.id;
  assert.equal(adapter.adapt(input(noEventId)).ok, false);
  const noOccurrenceId = structuredClone(fixture('normal'));
  delete noOccurrenceId.event_instances[0].event_instance.id;
  const result = adapter.adapt(input(noOccurrenceId));
  assert.equal(result.ok, false);
  assert.ok(result.issues.some(({ code, path }) => code === 'invalid_source_identity' && path === 'occurrences[0].externalId'));
});

test('records without a source category fail instead of treating Localist event kind as a category', () => {
  const source = structuredClone(fixture('incomplete'));
  source.filters = {};
  const result = adapter.adapt(input(source));
  assert.equal(result.ok, false);
  assert.ok(result.issues.some(({ code, path }) => code === 'missing_required_field' && path === 'categoryLabels'));
});

test('unexpected Localist filter shapes return a validation issue instead of throwing', () => {
  for (const filters of [{ event_types: { name: 'Talk' } }, 'unexpected']) {
    const source = structuredClone(fixture('normal'));
    source.filters = filters;
    const result = adapter.adapt(input(source));
    assert.equal(result.ok, false);
    assert.ok(result.issues.some(({ code, path }) => code === 'invalid_category' && path === 'raw.filters'));
  }
});

test('missing, non-string and blank category names return structured errors', () => {
  const malformed = [{}, { name: null }, { name: 42 }, { name: false },
    { name: [] }, { name: {} }, { name: '' }, { name: ' \t\n ' }];
  for (const item of malformed) {
    // A valid sibling must not hide malformed data, regardless of input order.
    for (const entries of [[item], [item, { name: 'Valid' }], [{ name: 'Valid' }, item]]) {
      const source = structuredClone(fixture('normal'));
      source.filters = { event_types: entries, event_topic: [{ name: 'Another valid category' }] };
      const result = adapter.adapt(input(source));
      assert.equal(result.ok, false, JSON.stringify(entries));
      assert.ok(result.issues.some(({ code, path }) => code === 'invalid_category'
        && path === `raw.filters.event_types[${entries.indexOf(item)}].name`));
    }
  }
  // Validate every filter family, not only the primary event-type candidates.
  const source = structuredClone(fixture('normal'));
  source.filters = { event_types: [{ name: 'Valid' }], event_topic: [{}] };
  const result = adapter.adapt(input(source));
  assert.equal(result.ok, false);
  assert.equal(result.issues[0].path, 'raw.filters.event_topic[0].name');
});

test('valid category names are trimmed and duplicates remain accepted', () => {
  const source = structuredClone(fixture('normal'));
  source.filters = { event_types: [{ name: '  Talk  ' }, { name: 'talk' }] };
  const result = adapter.adapt(input(source));
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.categoryLabels, ['Talk']);
  assert.equal(result.value.primaryCategoryLabel, 'Talk');
});

test('fetchLocalistEvents requests all pages with inclusive start and exclusive end bounds', async () => {
  const requests = [];
  const fetchImpl = async (url) => {
    requests.push(new URL(url));
    const page = Number(new URL(url).searchParams.get('page'));
    return new Response(JSON.stringify({
      events: [{ event: { id: page, title: `event ${page}` } }],
      page: { current: page, size: 1, total: 2 },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const events = await fetchLocalistEvents({ baseUrl: 'https://events.umass.edu', range: { start: '2026-01-01', end: '2026-02-01' }, pageSize: 1, fetchImpl });
  assert.deepEqual(events.map(({ id }) => id), [1, 2]);
  assert.equal(requests.length, 2);
  assert.deepEqual(requests.map((url) => [url.searchParams.get('start'), url.searchParams.get('end'), url.searchParams.get('page'), url.searchParams.get('pp')]), [
    ['2026-01-01', '2026-02-01', '1', '1'],
    ['2026-01-01', '2026-02-01', '2', '1'],
  ]);
});

test('fetchLocalistEvents accepts a successful response with zero events', async () => {
  const events = await fetchLocalistEvents({
    baseUrl: 'https://events.umass.edu',
    range: { start: '2026-01-01', end: '2026-02-01' },
    fetchImpl: async () => new Response(JSON.stringify({ events: [], page: { current: 1, size: 100, total: 0 } }), {
      status: 200, headers: { 'content-type': 'application/json' },
    }),
  });
  assert.deepEqual(events, []);
});

test('fetchLocalistEvents rejects invalid and oversized date ranges before fetching', async () => {
  await assert.rejects(fetchLocalistEvents({ baseUrl: 'https://events.umass.edu', range: { start: '2026-02-01', end: '2026-01-01' } }), /after/);
  await assert.rejects(fetchLocalistEvents({ baseUrl: 'https://events.umass.edu', range: { start: '2025-01-01', end: '2026-01-07' } }), /370 days/);
  await assert.rejects(fetchLocalistEvents({ baseUrl: 'https://events.umass.edu', range: { start: '2026-02-30', end: '2026-03-01' } }), /valid calendar date/);
});
