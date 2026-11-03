import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { adaptLocalistRecords, importLocalistWindow, ensureLocalCatalog } from '../../scripts/importer/localist.mjs';
import { normalizeLabel } from '../../scripts/importer/importer.mjs';

const fixture = name => JSON.parse(readFileSync(new URL(`../fixtures/localist/${name}.json`, import.meta.url))).events[0].event;
const config = JSON.parse(readFileSync(new URL('../../scripts/importer/localist-local-catalog.json', import.meta.url)));
const range = { start: '2026-10-27', end: '2026-10-28' };
const uuid = 'a0800000-0000-4000-8000-000000000001';
function mappingsFor(drafts) {
  const mappings = { categories: {}, organizations: {}, venues: {} };
  const key = c => c.externalId !== null ? `localist:id:${c.externalId}` : `localist:name:${normalizeLabel(c.name)}`;
  for (const d of drafts) {
    d.categoryLabels.forEach(l => { mappings.categories[normalizeLabel(l)] = uuid; });
    if (d.organization) mappings.organizations[key(d.organization)] = uuid;
    d.occurrences.forEach(o => { if (o.venue) mappings.venues[key(o.venue)] = uuid; });
  }
  const records = ['normal', 'cancelled'].map(fixture);
  mappings.localistFilters = {};
  mappings.primaryCategoryPolicy = 'single-event-type-or-single-category';
  for (const r of records) for (const [dimension, items] of Object.entries(r.filters ?? {})) {
    if (dimension === 'event_audience') continue;
    for (const item of items) mappings.localistFilters[`${dimension}:id:${item.id}`] = { label: item.name, categoryLabel: item.name };
  }
  return mappings;
}

test('all merged F14 fixtures pass the adapter/importer boundary without inferred internal registration', () => {
  const raw = ['normal', 'recurring', 'all-day', 'incomplete', 'cancelled'].map(fixture);
  const result = adaptLocalistRecords(raw);
  assert.equal(result.rejected.length, 0);
  assert.equal(result.drafts.length, 5);
  assert.equal(result.drafts[1].occurrences.length, 2);
  assert.equal(result.drafts[4].status, 'cancelled');
  assert.ok(result.drafts.every(d => d.registrationType !== 'internal'));
  raw[0].has_register = true; raw[0].allows_attendance = true;
  raw[0].ticket_url = 'https://example.test/registration';
  const d = adaptLocalistRecords([raw[0]]).drafts[0];
  assert.equal(d.registrationType, 'external');
  assert.equal(d.registrationUrl, raw[0].ticket_url);
});

test('malformed provider records are rejected per record and later valid records survive', () => {
  const badCategory = fixture('normal'); badCategory.filters = { event_types: [{ name: false }, { name: 'Valid' }] };
  const badGroup = fixture('normal'); badGroup.groups = {};
  const r = adaptLocalistRecords([null, badCategory, badGroup, fixture('normal')]);
  assert.equal(r.drafts.length, 1);
  assert.equal(r.rejected.length, 3);
  assert.ok(r.rejected[1].issues.some(i => i.code === 'invalid_category'));
  assert.equal(r.rejected[2].issues[0].code, 'invalid_provider_record');
});

test('bounded pagination connects actual adapter drafts to importer and reports partial rejection', async () => {
  const good = fixture('normal'); const bad = fixture('normal'); bad.id = null;
  const source = adaptLocalistRecords([good, fixture('cancelled')]).drafts;
  const requests = []; const calls = [];
  const result = await importLocalistWindow({ range, pageSize: 2, mappings: mappingsFor(source),
    fetchImpl: async (url, options) => {
      const u = new URL(url); requests.push(u);
      assert.equal(u.origin, 'https://events.umass.edu'); assert.equal(options.redirect, 'error');
      return Response.json({ events: (u.searchParams.get('page') === '1' ? [good, bad] : [fixture('cancelled')]).map(event => ({ event })), page: { current: requests.length, total: 2 } });
    }, transport: async (path, { body }) => {
      calls.push([path, body]);
      if (path === 'import_runs') return [{ id: 'local-run' }];
      if (path.startsWith('rpc/')) { assert.equal(body.p_failure, null); return { outcome: calls.filter(c => c[0].startsWith('rpc/')).length === 1 ? 'created' : 'unchanged' }; }
      return [];
    } });
  assert.deepEqual(result.counts, { fetched: 3, accepted: 2, rejected: 1, imported: 1, created: 1, updated: 0, unchanged: 1, stale: 0, failed: 0 });
  assert.equal(result.pagesFetched, 2);
  assert.equal(calls[0][1].expected_records, 2);
  assert.equal(requests[0].searchParams.get('start'), range.start);
  assert.equal(requests[0].searchParams.get('end'), range.end);
});

test('missing mappings produce explicit failed/unresolved outcomes without catalog creation', async () => {
  const calls = [];
  const result = await importLocalistWindow({ range, mappings: {}, fetchImpl: async () => Response.json({ events: [{ event: fixture('normal') }], page: { current: 1, total: 1 } }),
    transport: async (path, { body }) => {
      calls.push(path); if (path === 'import_runs') return [{ id: 'run' }];
      if (path.startsWith('rpc/')) return { outcome: body.p_failure.outcome, issues: body.p_failure.issues };
      return [];
    } });
  assert.equal(result.counts.rejected, 1);
  assert.equal(result.rejected[0].issues[0].code, 'unresolved_source_mapping');
  assert.equal(result.runId, null);
  assert.ok(!calls.some(p => ['categories', 'organizations', 'venues'].includes(p)));
});

test('zero provider results make no database requests', async () => {
  const result = await importLocalistWindow({ range, mappings: {}, fetchImpl: async () => Response.json({ events: [], page: { current: 1, total: 0 } }), transport: () => { throw Error('Unexpected write'); } });
  assert.equal(result.runId, null); assert.equal(result.counts.fetched, 0);
});

test('invalid ranges, HTTP errors and excessive pagination never start imports', async () => {
  const transport = () => { throw Error('Unexpected write'); };
  await assert.rejects(importLocalistWindow({ range: { start: '2026-01-01', end: '2026-12-01' }, transport }), /1–31/);
  await assert.rejects(importLocalistWindow({ range, transport, fetchImpl: async () => new Response('', { status: 503 }) }), /503/);
  await assert.rejects(importLocalistWindow({ range, transport, fetchImpl: async url => Response.json({ events: [{ event: fixture('normal') }], page: { current: Number(new URL(url).searchParams.get('page')), total: 30 } }) }), /20-page/);
});

test('reviewed local catalog setup is opt-in, repeatable and never overwrites mismatches', async () => {
  const rows = new Map(); let inserts = 0;
  const transport = async (path, options = {}) => {
    if (options.method === 'POST') { rows.set(options.body.id, options.body); inserts++; return [options.body]; }
    const row = rows.get(path.split('id=eq.')[1]); return row ? [row] : [];
  };
  await assert.rejects(ensureLocalCatalog({ ...config, localOnly: false }, transport), /local-only/);
  await ensureLocalCatalog(config, transport); await ensureLocalCatalog(config, transport);
  assert.equal(inserts, Object.values(config.catalog).reduce((sum, rows) => sum + rows.length, 0));
  rows.set(config.catalog.categories[0].id, { ...config.catalog.categories[0], name: 'Different' });
  await assert.rejects(ensureLocalCatalog(config, transport), /differs/);
});

test('every sample mapping references its explicit source-backed catalog row', () => {
  for (const table of ['categories', 'organizations', 'venues']) {
    const rows = config.catalog[table];
    assert.equal(new Set(rows.map(r => r.id)).size, rows.length);
    for (const [key, id] of Object.entries(config[table])) {
      const row = rows.find(r => r.id === id); assert.ok(row);
      assert.equal(key, table === 'categories' ? normalizeLabel(row.name) : `localist:id:${row.external_id}`);
      if (table !== 'categories') assert.equal(row.source_type, 'localist');
    }
  }
});

test('source-aware mappings keep audiences separate and reject unknown IDs or dimensions', () => {
  const raw = fixture('normal');
  raw.filters = { event_types: [{ id: 48709285422708, name: 'Exhibit' }],
    event_audience: [{ id: 50400050256329, name: 'Students' }] };
  const result = adaptLocalistRecords([raw], undefined, config);
  assert.equal(result.rejected.length, 0);
  assert.deepEqual(result.drafts[0].categoryLabels, ['Arts & Culture']);
  assert.equal(result.drafts[0].primaryCategoryLabel, 'Arts & Culture');
  assert.ok(result.warnings[0].issues.some(i => i.code === 'audience_not_category'));
  raw.filters.event_types[0].id = 99999;
  assert.ok(adaptLocalistRecords([raw], undefined, config).rejected[0].issues.some(i => i.code === 'unresolved_source_mapping'));
  raw.filters = { event_audience: [{ id: 1, name: 'Students' }] };
  assert.ok(adaptLocalistRecords([raw], undefined, config).rejected[0].issues.some(i => i.code === 'no_usable_category'));
  raw.filters = { unknown_dimension: [{ id: 48709285422708, name: 'Exhibit' }] };
  assert.ok(adaptLocalistRecords([raw], undefined, config).rejected[0].issues.some(i => i.code === 'unresolved_source_mapping'));
});

test('primary categories are order-independent members; ambiguous types require a source-key override', () => {
  const raw = fixture('normal');
  const one = { id: 48709285422708, name: 'Exhibit' };
  const two = { id: 50541392971397, name: 'Lecture/Talk/Reading' };
  raw.filters = { event_types: [one, two] };
  assert.ok(adaptLocalistRecords([raw], undefined, config).rejected[0].issues.some(i => i.code === 'unresolved_primary_category'));
  const explicit = { ...config, primaryCategoryByEvent: { [raw.id]: 'event_types:id:50541392971397' } };
  for (const order of [[one, two], [two, one]]) {
    raw.filters.event_types = order;
    const draft = adaptLocalistRecords([raw], undefined, explicit).drafts[0];
    assert.equal(draft.primaryCategoryLabel, 'Talks & Lectures');
    assert.ok(draft.categoryLabels.includes(draft.primaryCategoryLabel));
  }
  explicit.primaryCategoryByEvent[raw.id] = 'event_types:id:missing';
  assert.equal(adaptLocalistRecords([raw], undefined, explicit).drafts.length, 0);
});

test('multiple organizers cannot silently use array order; only explicit primary IDs resolve ambiguity', () => {
  const raw = fixture('normal'); raw.groups = [{ id: 1, name: 'One' }, { id: 2, name: 'Two' }];
  raw.filters = { event_types: [{ id: 48709285422708, name: 'Exhibit' }] };
  assert.ok(adaptLocalistRecords([raw], undefined, config).rejected[0].issues.some(i => i.code === 'unresolved_organization_selection'));
  const explicit = { ...config, organizationByEvent: { [raw.id]: '2' } };
  assert.equal(adaptLocalistRecords([raw], undefined, explicit).drafts[0].organization.externalId, '2');
  raw.groups.reverse();
  assert.equal(adaptLocalistRecords([raw], undefined, explicit).drafts[0].organization.externalId, '2');
});

test('building identity stays stable across rooms; occurrence display and coordinates stay specific', () => {
  const raw = fixture('normal'); raw.groups = [];
  raw.filters = { event_types: [{ id: 48709285422708, name: 'Exhibit' }] };
  raw.venue_id = 45702739081704; raw.location_name = 'Campus Center';
  raw.geo = { latitude: 42.3917, longitude: -72.5275 };
  const drafts = ['165', '922'].map(room => {
    const record = structuredClone(raw); record.room_number = room;
    return adaptLocalistRecords([record], undefined, config).drafts[0];
  });
  assert.deepEqual(drafts.map(d => d.occurrences[0].venue.name), ['Campus Center', 'Campus Center']);
  assert.deepEqual(drafts.map(d => d.occurrences[0].locationName), ['Campus Center, 165', 'Campus Center, 922']);
  assert.deepEqual(drafts[0].occurrences[0].coordinates, { latitude: 42.3917, longitude: -72.5275 });
  assert.ok(drafts.every(d => d.occurrences[0].venue.externalId === '45702739081704'));
  const building = config.catalog.venues.find(v => v.external_id === '45702739081704');
  assert.equal(building.name, 'Campus Center'); assert.equal(building.room, null);
});

test('mapping targets and place identities are checked before local catalog writes', async () => {
  let calls = 0; const transport = () => { calls++; throw Error('unexpected request'); };
  const dangling = structuredClone(config); dangling.categories['arts & culture'] = '00000000-0000-4000-8000-000000000000';
  await assert.rejects(ensureLocalCatalog(dangling, transport), /explicitly configured/);
  const room = structuredClone(config); room.catalog.venues[0].room = '165';
  await assert.rejects(ensureLocalCatalog(room, transport), /rooms belong on occurrences/);
  const duplicate = structuredClone(config); duplicate.catalog.venues.push({ ...duplicate.catalog.venues[0], id: '00000000-0000-4000-8000-000000000000' });
  await assert.rejects(ensureLocalCatalog(duplicate, transport), /unique/);
  assert.equal(calls, 0);
});


test('every source filter target is configured, source-scoped and never an audience rule', () => {
  for (const [key, rule] of Object.entries(config.localistFilters)) {
    assert.match(key, /^(event_types|event_topic):id:[0-9]+$/);
    assert.ok(rule.label.trim());
    if (rule.categoryLabel === null) { assert.ok(rule.reviewReason.trim()); continue; }
    const id = config.categories[normalizeLabel(rule.categoryLabel)];
    assert.ok(config.catalog.categories.some(row => row.id === id));
  }
});

test('missing required location is rejected, while unrecognized optional room text is preserved verbatim', () => {
  const raw = fixture('normal');
  raw.filters = { event_types: [{ id: 48709285422708, name: 'Exhibit' }] };
  raw.experience = 'virtual'; raw.stream_url = null;
  assert.ok(adaptLocalistRecords([raw], undefined, config).rejected[0].issues.some(i => i.code === 'invalid_location'));
  raw.experience = 'inperson'; raw.venue_id = 45702739081704; raw.location_name = 'Campus Center';
  raw.room_number = 'Newly named room, floor 3';
  const result = adaptLocalistRecords([raw], undefined, config);
  assert.equal(result.drafts[0].occurrences[0].locationName, 'Campus Center, Newly named room, floor 3');
  assert.equal(result.drafts[0].occurrences[0].venue.externalId, '45702739081704');
});

test('a valid category imports with an explicit warning for an additional unknown topic', () => {
  const raw = fixture('normal'); raw.filters = {
    event_types: [{ id: 48709285422708, name: 'Exhibit' }],
    event_topic: [{ id: 999999, name: 'Unreviewed topic' }],
  };
  const r = adaptLocalistRecords([raw], undefined, config);
  assert.equal(r.drafts.length, 1);
  assert.equal(r.rejected.length, 0);
  assert.deepEqual(r.drafts[0].categoryLabels, ['Arts & Culture']);
  assert.ok(r.warnings[0].issues.some(i => i.code === 'unmapped_topic' && i.path === 'raw.filters.event_topic[0]'));
});

test('same-label renames and source IDs from another dimension are not guessed aliases', () => {
  const raw = fixture('normal');
  for (const filters of [
    { event_types: [{ id: 48709285422708, name: 'Renamed exhibition type' }] },
    { event_topic: [{ id: 48709285422708, name: 'Exhibit' }] },
  ]) {
    raw.filters = filters;
    assert.ok(adaptLocalistRecords([raw], undefined, config).rejected[0].issues.some(i => i.code === 'unresolved_source_mapping'));
  }
});

test('catalog is exactly the eight approved app categories, with stable distinct identities', () => {
  const approved = ['Talks & Lectures', 'Workshops & Classes', 'Arts & Culture', 'Sports & Recreation',
    'Career & Networking', 'Health & Wellness', 'Social & Community', 'Food & Drink'];
  assert.deepEqual(config.catalog.categories.map(row => row.name), approved);
  assert.equal(new Set(config.catalog.categories.map(row => row.id)).size, 8);
  assert.deepEqual(Object.keys(config.categories).sort(), approved.map(normalizeLabel).sort());
  for (const rule of Object.values(config.localistFilters)) {
    assert.ok(rule.categoryLabel === null || approved.includes(rule.categoryLabel));
  }
});

test('approved mappings retain multiple categories, deduplicate aliases, and select a member as primary', () => {
  const raw = fixture('normal'); raw.location_name = 'Dining Commons'; raw.groups = [];
  raw.filters = { event_types: [{ id: 50542912006793, name: 'Career/Recruiting' }],
    event_topic: [{ id: 50400062191087, name: 'Career Development' }, { id: 50400062188014, name: 'Arts and Culture' }],
    event_audience: [{ id: 50400050256329, name: 'Students' }] };
  const d = adaptLocalistRecords([raw], undefined, config).drafts[0];
  assert.deepEqual(d.categoryLabels, ['Career & Networking', 'Arts & Culture']);
  assert.equal(d.primaryCategoryLabel, 'Career & Networking');
  assert.ok(d.categoryLabels.includes(d.primaryCategoryLabel));
  assert.ok(!d.categoryLabels.includes('Food & Drink'), 'location never implies a category');
});

test('ambiguous types reject, while supplemental ambiguous topics warn beside a valid category', () => {
  const raw = fixture('normal'); raw.groups = [];
  for (const [dimension, item] of [
    ['event_types', { id: 45703326930059, name: 'Conference/Seminar/Workshop' }],
    ['event_topic', { id: 50400062212599, name: 'Sustainability' }],
  ]) {
    raw.filters = { event_types: [{ id: 48709285422708, name: 'Exhibit' }] };
    raw.filters[dimension] = [...(raw.filters[dimension] ?? []), item];
    const r = adaptLocalistRecords([raw], undefined, config);
    if (dimension === 'event_topic') {
      assert.equal(r.drafts.length, 1);
      assert.ok(r.warnings[0].issues.some(i => i.code === 'unmapped_topic' && i.message.includes(item.name)));
    } else {
      assert.equal(r.drafts.length, 0);
      assert.ok(r.rejected[0].issues.some(i => i.code === 'ambiguous_source_mapping' && i.message.includes(item.name)));
    }
  }
});

test('approved category records reuse exact-name seed identities without unique-name conflicts', async () => {
  const { categories } = await import('../../supabase/scripts/seed-data.mjs');
  for (const row of config.catalog.categories) {
    const existing = categories.find(c => c.name === row.name);
    if (existing) {
      assert.equal(row.id, `d0000000-0000-4000-8000-${String(existing.n).padStart(12, '0')}`);
      assert.equal(row.slug, existing.slug);
    }
  }
});

test('unmapped topics cannot supply a fallback category when no usable category exists', () => {
  const raw = fixture('normal'); raw.groups = [];
  for (const topic of [{ id: 999999, name: 'Unknown subject' }, { id: 50400062212599, name: 'Sustainability' }]) {
    raw.filters = { event_topic: [topic] };
    const r = adaptLocalistRecords([raw], undefined, config);
    assert.equal(r.drafts.length, 0);
    assert.ok(r.rejected[0].issues.some(i => i.code === 'no_usable_category'));
  }
});

test('supplemental topic warnings do not resolve an ambiguous primary or organizer', () => {
  const raw = fixture('normal'); raw.groups = [];
  raw.filters = {
    event_types: [{ id: 48709285422708, name: 'Exhibit' }, { id: 50541392971397, name: 'Lecture/Talk/Reading' }],
    event_topic: [{ id: 50400062212599, name: 'Sustainability' }],
  };
  const r = adaptLocalistRecords([raw], undefined, config);
  assert.equal(r.drafts.length, 0);
  assert.ok(r.rejected[0].issues.some(i => i.code === 'unresolved_primary_category'));
  assert.ok(r.warnings[0].issues.some(i => i.code === 'unmapped_topic'));
  raw.filters.event_types.pop(); raw.groups = [{ id: 1, name: 'Host A' }, { id: 2, name: 'Host B' }];
  assert.ok(adaptLocalistRecords([raw], undefined, config).rejected[0].issues.some(i => i.code === 'unresolved_organization_selection'));
});

test('a mapped topic can supply a sole category alongside an unmapped additional topic', () => {
  const raw = fixture('normal'); raw.groups = [];
  raw.filters = { event_topic: [{ id: 50400062205429, name: 'Health and Wellness' }, { id: 999999, name: 'Unknown subject' }] };
  const r = adaptLocalistRecords([raw], undefined, config);
  assert.deepEqual(r.drafts[0].categoryLabels, ['Health & Wellness']);
  assert.equal(r.drafts[0].primaryCategoryLabel, 'Health & Wellness');
  assert.ok(r.warnings[0].issues.some(i => i.code === 'unmapped_topic'));
});

test('Campus Center and Campus Center Auditorium remain separate source places', () => {
  const center = config.venues['localist:id:45702739081704'];
  const auditorium = config.venues['localist:id:45702738934228'];
  assert.ok(center && auditorium); assert.notEqual(center, auditorium);
  for (const id of [center, auditorium]) assert.equal(config.catalog.venues.find(v => v.id === id).room, null);
});

test('topic warning behavior is independent of filter order', () => {
  const raw = fixture('normal'); raw.groups = [];
  raw.filters = { event_topic: [{ id: 999999, name: 'Unknown subject' }],
    event_types: [{ id: 48709285422708, name: 'Exhibit' }] };
  const r = adaptLocalistRecords([raw], undefined, config);
  assert.equal(r.rejected.length, 0);
  assert.equal(r.drafts[0].primaryCategoryLabel, 'Arts & Culture');
  assert.ok(r.warnings[0].issues.some(i => i.code === 'unmapped_topic'));
});

test('a broken configured category target is not hidden as an optional topic warning', () => {
  const raw = fixture('normal'); raw.groups = [];
  raw.filters = { event_types: [{ id: 48709285422708, name: 'Exhibit' }],
    event_topic: [{ id: 50400062205429, name: 'Health and Wellness' }] };
  const broken = structuredClone(config); delete broken.categories['health & wellness'];
  const r = adaptLocalistRecords([raw], undefined, broken);
  assert.equal(r.drafts.length, 0);
  assert.ok(r.rejected[0].issues.some(i => i.code === 'unresolved_source_mapping'));
});
