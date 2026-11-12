import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createSupabaseEventRepository,
  EventQueryError,
  isCanonicalEventId,
  toEventDetail,
  toFeedItem,
} from '../src/services/eventRepository.ts';

const EVENT_ID = '00000000-0000-4000-8000-0000000000e1';
const ORG_ID = '00000000-0000-4000-8000-0000000000b1';
const NOW = new Date('2026-11-10T15:00:00Z');

const feedRow = (overrides = {}) => ({
  event_id: EVENT_ID,
  occurrence_id: 'occ-1',
  title: 'Gallery Opening',
  category_name: 'Arts & Culture',
  category_slug: 'arts-culture',
  organizer_name: 'Fine Arts Center',
  starts_at: '2026-11-12T23:00:00+00:00',
  ends_at: null,
  all_day: false,
  timezone: 'America/New_York',
  location_type: 'physical',
  location_name: 'Bowker Auditorium',
  latitude: 42.3914,
  longitude: -72.5262,
  is_free: false,
  image_url: 'https://example.edu/a.jpg',
  ...overrides,
});

const detailRow = (overrides = {}) => ({
  event_id: EVENT_ID,
  title: 'Gallery Opening',
  description: 'Student art',
  image_url: null,
  status: 'published',
  timezone: 'America/New_York',
  is_free: true,
  registration_type: 'none',
  registration_url: null,
  source_url: 'https://events.umass.edu/event/gallery-opening',
  category_name: 'Arts & Culture',
  category_slug: 'arts-culture',
  organizer_name: 'Fine Arts Center',
  organizer_url: 'https://fac.umass.edu',
  occurrences: [
    {
      id: 'occ-1', starts_at: '2026-11-12T23:00:00+00:00', ends_at: null, all_day: false,
      status: 'scheduled', location_type: 'physical', location_name: 'Bowker Auditorium',
      venue_name: 'Bowker Auditorium', room: null, address: '80 Campus Center Way, Amherst, MA 01003',
      latitude: 42.39, longitude: -72.52, virtual_url: null,
    },
  ],
  ...overrides,
});

/** Fake rpc that records calls and returns the given result. */
function fakeRpc(result) {
  const calls = [];
  const rpc = async (fn, args) => {
    calls.push({ fn, args });
    return typeof result === 'function' ? result(fn, args) : result;
  };
  return { rpc, calls };
}

// ── Row validation ───────────────────────────────────────────────────────────

test('toFeedItem maps a full row', () => {
  const item = toFeedItem(feedRow());
  assert.equal(item.eventId, EVENT_ID);
  assert.equal(item.organizerName, 'Fine Arts Center');
  assert.equal(item.isFree, false);
  assert.equal(item.latitude, 42.3914);
});

test('toFeedItem rejects rows without a canonical ID, title or start time', () => {
  assert.equal(toFeedItem(feedRow({ event_id: '1' })), null);
  assert.equal(toFeedItem(feedRow({ title: '' })), null);
  assert.equal(toFeedItem(feedRow({ starts_at: null })), null);
  assert.equal(toFeedItem(null), null);
  assert.equal(toFeedItem([]), null);
});

test('toFeedItem keeps coordinates only as a pair', () => {
  const item = toFeedItem(feedRow({ longitude: null }));
  assert.equal(item.latitude, null);
  assert.equal(item.longitude, null);
});

test('toFeedItem drops non-http image links and unknown location types', () => {
  const item = toFeedItem(feedRow({ image_url: 'javascript:alert(1)', location_type: 'teleport' }));
  assert.equal(item.imageUrl, null);
  assert.equal(item.locationType, 'physical');
});

test('toEventDetail uses the source page as the official link, else registration', () => {
  assert.equal(toEventDetail(detailRow()).officialUrl, 'https://events.umass.edu/event/gallery-opening');
  assert.equal(
    toEventDetail(detailRow({ source_url: null, registration_url: 'https://tickets.umass.edu/x' })).officialUrl,
    'https://tickets.umass.edu/x',
  );
  assert.equal(toEventDetail(detailRow({ source_url: 'ftp://x' })).officialUrl, null);
});

test('toEventDetail keeps status and occurrence details', () => {
  const detail = toEventDetail(detailRow({ status: 'cancelled' }));
  assert.equal(detail.status, 'cancelled');
  assert.equal(detail.occurrences.length, 1);
  assert.equal(detail.occurrences[0].address, '80 Campus Center Way, Amherst, MA 01003');
});

test('toEventDetail skips broken occurrences and handles a missing list', () => {
  assert.equal(toEventDetail(detailRow({ occurrences: [{ id: 'x' }, null] })).occurrences.length, 0);
  assert.deepEqual(toEventDetail(detailRow({ occurrences: null })).occurrences, []);
});

test('isCanonicalEventId accepts UUIDs only', () => {
  assert.equal(isCanonicalEventId(EVENT_ID), true);
  assert.equal(isCanonicalEventId('1'), false);
  assert.equal(isCanonicalEventId(undefined), false);
});

// ── listFeed ─────────────────────────────────────────────────────────────────

test('listFeed sends filters, trims text and defaults "from" to now', async () => {
  const { rpc, calls } = fakeRpc({ data: [], error: null });
  const repo = createSupabaseEventRepository(rpc, () => NOW);
  await repo.listFeed({
    categorySlugs: [' food-drink ', 'music', 'food-drink'],
    organizationIds: [ORG_ID],
    isFree: true,
    search: '  pizza ',
    until: new Date('2026-11-17T00:00:00Z'),
  });
  assert.equal(calls[0].fn, 'event_feed_filtered');
  assert.deepEqual(calls[0].args, {
    p_from: '2026-11-10T15:00:00.000Z',
    p_until: '2026-11-17T00:00:00.000Z',
    p_category_slugs: ['food-drink', 'music'],
    p_search: 'pizza',
    p_organization_ids: [ORG_ID],
    p_is_free: true,
    p_after_starts_at: null,
    p_after_event_id: null,
    p_limit: 20,
  });
});

test('listFeed sends blank filters as null', async () => {
  const { rpc, calls } = fakeRpc({ data: [], error: null });
  const repo = createSupabaseEventRepository(rpc, () => NOW);
  await repo.listFeed({ categorySlugs: ['  '], organizationIds: [], search: '' });
  assert.equal(calls[0].args.p_category_slugs, null);
  assert.equal(calls[0].args.p_organization_ids, null);
  assert.equal(calls[0].args.p_is_free, null);
  assert.equal(calls[0].args.p_search, null);
  assert.equal(calls[0].args.p_until, null);

  await repo.listFeed();
  assert.equal(calls[1].args.p_category_slugs, null);
  assert.equal(calls[1].args.p_organization_ids, null);
});

test('listFeed returns a cursor only when the page is full', async () => {
  const full = fakeRpc({ data: [feedRow(), feedRow({ event_id: '00000000-0000-4000-8000-0000000000e2', starts_at: '2026-11-13T00:00:00+00:00' })], error: null });
  const page = await createSupabaseEventRepository(full.rpc, () => NOW).listFeed({}, null, 2);
  assert.deepEqual(page.nextCursor, { startsAt: '2026-11-13T00:00:00+00:00', eventId: '00000000-0000-4000-8000-0000000000e2' });

  const partial = fakeRpc({ data: [feedRow()], error: null });
  const last = await createSupabaseEventRepository(partial.rpc, () => NOW).listFeed({}, null, 2);
  assert.equal(last.nextCursor, null);
});

test('listFeed passes the cursor back and clamps the limit', async () => {
  const { rpc, calls } = fakeRpc({ data: [], error: null });
  const repo = createSupabaseEventRepository(rpc, () => NOW);
  await repo.listFeed({}, { startsAt: '2026-11-12T23:00:00+00:00', eventId: EVENT_ID }, 500);
  assert.equal(calls[0].args.p_after_starts_at, '2026-11-12T23:00:00+00:00');
  assert.equal(calls[0].args.p_after_event_id, EVENT_ID);
  assert.equal(calls[0].args.p_limit, 100);

  await repo.listFeed({}, null, 0);
  assert.equal(calls[1].args.p_limit, 1);
});

test('listFeed skips bad rows but still pages from the last raw row', async () => {
  const lastRaw = feedRow({ event_id: '00000000-0000-4000-8000-0000000000e9', title: '' });
  const { rpc } = fakeRpc({ data: [feedRow(), lastRaw], error: null });
  const page = await createSupabaseEventRepository(rpc, () => NOW).listFeed({}, null, 2);
  assert.equal(page.items.length, 1);
  assert.equal(page.nextCursor.eventId, '00000000-0000-4000-8000-0000000000e9');
});

test('listFeed throws EventQueryError instead of returning fallback data', async () => {
  const { rpc } = fakeRpc({ data: null, error: { message: 'permission denied' } });
  await assert.rejects(
    createSupabaseEventRepository(rpc, () => NOW).listFeed(),
    error => error instanceof EventQueryError && /permission denied/.test(error.message),
  );
});

// ── listOrganizations ────────────────────────────────────────────────────────

test('listOrganizations returns valid choices in order', async () => {
  const { rpc, calls } = fakeRpc({
    data: [
      { organization_id: ORG_ID, name: 'Amherst Run Club' },
      { organization_id: 'not-a-uuid', name: 'Bad Row' },
      { organization_id: '00000000-0000-4000-8000-0000000000b2', name: '' },
    ],
    error: null,
  });
  const options = await createSupabaseEventRepository(rpc, () => NOW).listOrganizations();
  assert.equal(calls[0].fn, 'event_feed_organizations');
  assert.deepEqual(calls[0].args, { p_from: '2026-11-10T15:00:00.000Z' });
  assert.deepEqual(options, [{ id: ORG_ID, name: 'Amherst Run Club' }]);
});

test('listOrganizations throws EventQueryError on backend failure', async () => {
  const { rpc } = fakeRpc({ data: null, error: { message: 'timeout' } });
  await assert.rejects(
    createSupabaseEventRepository(rpc, () => NOW).listOrganizations(),
    error => error instanceof EventQueryError && /organizations/.test(error.message),
  );
});

// ── getEventById ─────────────────────────────────────────────────────────────

test('getEventById returns the event', async () => {
  const { rpc, calls } = fakeRpc({ data: [detailRow()], error: null });
  const detail = await createSupabaseEventRepository(rpc, () => NOW).getEventById(EVENT_ID);
  assert.equal(calls[0].fn, 'event_details');
  assert.deepEqual(calls[0].args, { p_event_id: EVENT_ID, p_from: '2026-11-10T15:00:00.000Z' });
  assert.equal(detail.title, 'Gallery Opening');
});

test('getEventById returns null for unknown events', async () => {
  const { rpc } = fakeRpc({ data: [], error: null });
  assert.equal(await createSupabaseEventRepository(rpc, () => NOW).getEventById(EVENT_ID), null);
});

test('getEventById returns null for old non-UUID IDs without querying', async () => {
  const { rpc, calls } = fakeRpc({ data: [detailRow()], error: null });
  assert.equal(await createSupabaseEventRepository(rpc, () => NOW).getEventById('1'), null);
  assert.equal(calls.length, 0);
});

test('getEventById throws EventQueryError on backend failure', async () => {
  const { rpc } = fakeRpc({ data: null, error: { message: 'timeout' } });
  await assert.rejects(
    createSupabaseEventRepository(rpc, () => NOW).getEventById(EVENT_ID),
    EventQueryError,
  );
});

test('selected occurrence outside the twenty-row details window is fetched by exact parent/occurrence IDs',async()=>{
 const selected='00000000-0000-4000-8000-0000000000a1';
 const repo=createSupabaseEventRepository(async(name,args)=>name==='event_details'?{data:[detailRow()],error:null}:{data:{...detailRow().occurrences[0],id:selected},error:null});
 assert.ok((await repo.getEventById(EVENT_ID,selected)).occurrences.some(o=>o.id===selected));
 const missing=createSupabaseEventRepository(async(name)=>({data:name==='event_details'?[detailRow()]:null,error:null}));
 assert.equal(await missing.getEventById(EVENT_ID,selected),null);
 const failed=createSupabaseEventRepository(async(name)=>name==='event_details'?{data:[detailRow()],error:null}:{data:null,error:{message:'Denied'}});
 await assert.rejects(failed.getEventById(EVENT_ID,selected),EventQueryError);
});
