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
  assert.equal(result.counts.failed, 1);
  assert.equal(result.outcomes[0].outcome, 'unresolved');
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
  assert.equal(inserts, 31);
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
