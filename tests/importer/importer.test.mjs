import test from 'node:test';
import assert from 'node:assert/strict';
import { draft, mappings } from './drafts.mjs';
import { payloadHash, prepareRecord, resolveMappings, importDrafts, createLocalTransport } from '../../scripts/importer/importer.mjs';

test('validates the committed F11 boundary and resolves only approved IDs', () => {
  const p = prepareRecord(draft(), mappings);
  assert.equal(p.outcome, undefined);
  assert.equal(p.mapping.primaryCategoryId, mappings.categories.campus);
  assert.deepEqual(p.mapping.venueIds, [mappings.venues['localist:id:venue-a08'], mappings.venues['localist:id:venue-a08']]);
});
test('invalid F11 fields and malformed JSON shapes fail clearly', () => {
  const invalid = draft(); invalid.occurrences[0].sourceType = 'campus_pulse';
  assert.equal(prepareRecord(invalid, mappings).outcome, 'invalid');
  for (const input of [null, {}, { title: 'not a full draft' }]) assert.equal(prepareRecord(input, mappings).outcome, 'invalid');
});
test('unresolved categories, organizations and supplied venues never get invented', () => {
  for (const section of ['categories', 'organizations', 'venues']) {
    const config = structuredClone(mappings); config[section] = {};
    const p = prepareRecord(draft(), config);
    assert.equal(p.outcome, 'unresolved'); assert.ok(p.issues.every(i => i.code === 'unresolved_mapping'));
  }
  const d = draft(); d.organization = null; d.occurrences.forEach(o => { o.venue = null; });
  assert.equal(prepareRecord(d, { categories: mappings.categories }).outcome, undefined);
});
test('complete JSON types are checked before mapping without coercion', () => {
  const mutations = [
    d => { delete d.organization; }, d => { delete d.occurrences[0].venue; },
    d => { d.isFree = 'false'; }, d => { d.occurrences[0].allDay = 'false'; },
    d => { d.description = 123; }, d => { delete d.imageUrl; },
    d => { d.organization.externalId = 123; }, d => { d.organization.name = []; },
    d => { delete d.occurrences[0].venue.room; },
    d => { d.occurrences[0].venue.coordinates = { latitude: '42', longitude: -72 }; },
    d => { d.occurrences[0].coordinates = []; },
    d => { d.occurrences[0].sourceAttendanceCount = '0'; },
    d => { d.featuredRank = Infinity; }, d => { d.categoryLabels = [123]; },
  ];
  for (const mutate of mutations) {
    const d = draft(); mutate(d);
    const p = prepareRecord(d, mappings);
    assert.equal(p.outcome, 'invalid'); assert.equal(p.issues[0].code, 'invalid_shape');
  }
  // Every required nullable field must be explicit, not omitted.
  for (const key of Object.keys(draft())) {
    const d = draft(); delete d[key]; assert.equal(prepareRecord(d, mappings).outcome, 'invalid', key);
  }
  for (const key of Object.keys(draft().occurrences[0])) {
    const d = draft(); delete d.occurrences[0][key]; assert.equal(prepareRecord(d, mappings).outcome, 'invalid', key);
  }
  for (const key of Object.keys(draft().organization)) {
    const d = draft(); delete d.organization[key]; assert.equal(prepareRecord(d, mappings).outcome, 'invalid', `organization.${key}`);
  }
  for (const key of Object.keys(draft().occurrences[0].venue)) {
    const d = draft(); delete d.occurrences[0].venue[key]; assert.equal(prepareRecord(d, mappings).outcome, 'invalid', `venue.${key}`);
  }
});
test('malformed drafts are recorded and later valid records still import', async () => {
  const missingOrganization = draft(); delete missingOrganization.organization;
  const missingVenue = draft(); delete missingVenue.occurrences[0].venue;
  const wrongBoolean = draft(); wrongBoolean.isFree = 'false';
  const bodies = [];
  const result = await importDrafts({ sourceType: 'localist', drafts: [missingOrganization, missingVenue, wrongBoolean, draft()], mappings,
    transport: async (path, { body }) => {
      if (path === 'import_runs') return [{ id: 'shape-run' }];
      if (path.startsWith('rpc/')) { bodies.push(body); return { outcome: body.p_failure?.outcome ?? 'created' }; }
      return [];
    } });
  assert.deepEqual(result.outcomes.map(o => o.outcome), ['invalid', 'invalid', 'invalid', 'created']);
  assert.ok(bodies.slice(0, 3).every(b => b.p_failure.issues[0].code === 'invalid_shape'));
});
test('configured normalized name aliases are explicit; provider IDs do not fall back to names', () => {
  const d = draft(); d.organization.externalId = null;
  const config = structuredClone(mappings); config.organizations = { 'localist:name:test organization': mappings.organizations['localist:id:group-a08'] };
  assert.equal(resolveMappings(d, config).ok, true);
  d.organization.externalId = 'unknown'; assert.equal(resolveMappings(d, config).ok, false);
});
test('stable payload hashes include mapping decisions and ignore object key order', () => {
  assert.equal(payloadHash({ a: 1, b: [2] }), payloadHash({ b: [2], a: 1 }));
  assert.notEqual(payloadHash({ draft: draft(), mapping: 1 }), payloadHash({ draft: draft(), mapping: 2 }));
});
test('orchestrator records invalid/unresolved outcomes without submitting content writes', async () => {
  const calls = [];
  const result = await importDrafts({ sourceType: 'localist', drafts: [null, draft()], mappings: {}, transport: async (path, options) => {
    calls.push([path, options.body]);
    if (path === 'import_runs') return [{ id: 'run-1' }];
    if (path.startsWith('rpc/')) return { outcome: options.body.p_failure.outcome, eventId: null };
    return [];
  } });
  assert.deepEqual(result.outcomes.map(o => o.outcome), ['invalid', 'unresolved']);
  assert.equal(calls.at(-1)[1].status, 'failed');
});
test('transport failures close the run and do not expose credentials or server bodies', async () => {
  const calls = [];
  await assert.rejects(importDrafts({ sourceType: 'localist', drafts: [draft()], mappings, transport: async (p, o) => {
    calls.push([p, o]); if (p === 'import_runs') return [{ id: 'run-2' }];
    if (p.startsWith('rpc/')) throw new Error('sensitive response'); return [];
  } }), /run-2 interrupted/);
  assert.equal(calls.at(-1)[1].body.status, 'failed');
});
test('local transport rejects hosted endpoints and HTTP redirects', async () => {
  assert.throws(() => createLocalTransport('https://project.supabase.co', 'fake'), /only a local/);
  let options;
  const t = createLocalTransport('http://127.0.0.1:54321', 'fake-local-key', async (_url, o) => {
    options = o; return new Response(JSON.stringify({ message: 'sensitive body' }), { status: 403 });
  });
  await assert.rejects(t('rpc/import_event_record', { method: 'POST', body: {} }), /403/);
  assert.equal(options.redirect, 'error');
});
