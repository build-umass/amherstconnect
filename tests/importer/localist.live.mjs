// Explicit opt-in acceptance: public network reads + writes to a freshly reset
// LOCAL stack only. Not part of offline tests or CI. Never log Auth responses.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { localConnection } from '../../scripts/importer/local-connection.mjs';
import { createLocalTransport, importDrafts } from '../../scripts/importer/importer.mjs';
import { importLocalistWindow, adaptLocalistRecords, ensureLocalCatalog } from '../../scripts/importer/localist.mjs';
import { users, SEED_PASSWORD } from '../../supabase/scripts/seed-data.mjs';

test('real Localist → local Supabase: create, retry, update, reject, rollback and RLS', { timeout: 180000 }, async () => {
  const configPath = 'scripts/importer/localist-local-catalog.json';
  const config = JSON.parse(readFileSync(configPath));
  const connection = localConnection();
  const transport = createLocalTransport(connection.API_URL, connection.SERVICE_ROLE_KEY ?? connection.SECRET_KEY);
  await ensureLocalCatalog(config, transport);
  await ensureLocalCatalog(config, transport); // Catalog setup is repeatable too.
  const raw = [];
  const first = await importLocalistWindow({ range: config.observedRange, mappings: config, transport, pageSize: 5,
    fetchImpl: async (url, options) => {
      const response = await fetch(url, options);
      if (response.ok) raw.push(...(await response.clone().json()).events.map(w => w.event));
      return response;
    } });
  assert.ok(first.pagesFetched > 1, 'real pagination exercised');
  assert.ok(first.counts.created > 0, 'run on a freshly reset local database');
  assert.equal(first.counts.failed, 0, 'review newly unresolved mappings rather than inventing matches');
  const { drafts, rejected } = adaptLocalistRecords(raw);
  assert.equal(first.counts.rejected, rejected.length);
  assert.equal(first.counts.created, drafts.length);
  console.log(JSON.stringify({ phase: 'real-first-import', pages: first.pagesFetched, ...first.counts,
    rejectionCodes: rejected.map(r => ({ externalId: r.externalId, codes: r.issues.map(i => i.code) })) }));

  const eventFilter = `source_type=eq.localist&external_id=in.(${drafts.map(d => d.externalId).join(',')})`;
  const getEvents = () => transport(`events?${eventFilter}&order=id`);
  const events = await getEvents();
  const eventIds = events.map(e => e.id).join(',');
  const getOccurrences = () => transport(`event_occurrences?event_id=in.(${eventIds})&order=id`);
  const snapshot = async () => ({ events: await getEvents(), occurrences: await getOccurrences(),
    categories: await transport(`event_categories?event_id=in.(${eventIds})&order=event_id,category_id`) });
  const before = await snapshot();
  assert.equal(events.length, drafts.length);
  assert.equal(before.occurrences.length, drafts.reduce((sum, d) => sum + d.occurrences.length, 0));
  for (const d of drafts) {
    const saved = events.find(e => e.external_id === d.externalId);
    assert.equal(saved.registration_type, d.registrationType);
    assert.equal(saved.registration_url, d.registrationUrl);
    assert.notEqual(saved.registration_type, 'internal');
  }
  const repeat = await importDrafts({ sourceType: 'localist', drafts, mappings: config, transport });
  assert.ok(repeat.outcomes.every(o => o.outcome === 'unchanged'));
  assert.deepEqual(await snapshot(), before, 'identical retry preserves rows, UUIDs and content timestamps');
  console.log(JSON.stringify({ phase: 'frozen-identical-retry', unchanged: repeat.outcomes.length,
    eventCount: events.length, occurrenceCount: before.occurrences.length, identicalSnapshot: true }));

  const run = async (draft, mappings = config) => (await importDrafts({ sourceType: 'localist', drafts: [draft], mappings, transport })).outcomes[0];
  const changed = structuredClone(drafts[0]); changed.title = `${changed.title} [local acceptance update]`;
  const updated = await run(changed);
  assert.equal(updated.outcome, 'updated');
  assert.equal(updated.eventId, events.find(e => e.external_id === changed.externalId).id);
  assert.equal((await getEvents()).find(e => e.id === updated.eventId).title, changed.title);
  assert.equal((await getEvents()).length, events.length);
  assert.deepEqual((await getOccurrences()).map(o => o.id), before.occurrences.map(o => o.id));
  assert.equal((await run(drafts[0])).outcome, 'updated'); // Restore real content, same provider timestamp.
  const beforeInvalid = await snapshot();
  const invalid = structuredClone(drafts[0]); invalid.title = '';
  const malformed = structuredClone(drafts[0]); delete malformed.organization;
  const collision = structuredClone(drafts[0]); collision.title = 'Must roll back';
  const duplicateSlot = structuredClone(collision.occurrences[0]); duplicateSlot.externalId += '-local-collision-test';
  collision.occurrences.push(duplicateSlot);
  assert.equal((await run(invalid)).outcome, 'invalid');
  assert.equal((await run(malformed)).outcome, 'invalid');
  assert.equal((await run(drafts[0], {})).outcome, 'unresolved');
  assert.equal((await run(collision)).outcome, 'failed');
  assert.deepEqual(await snapshot(), beforeInvalid, 'all invalid/unmapped/SQL-failed attempts leave content unchanged');
  console.log(JSON.stringify({ phase: 'controlled-local-changes', updated: 1, restored: 1,
    invalid: 2, unresolved: 1, atomicSqlFailure: 1, noDuplicates: true, rollbackVerified: true }));

  const clientKey = connection.ANON_KEY ?? connection.PUBLISHABLE_KEY;
  const login = await fetch(new URL('/auth/v1/token?grant_type=password', connection.API_URL), {
    method: 'POST', redirect: 'error', headers: { apikey: clientKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: users[0].email, password: SEED_PASSWORD }),
  });
  assert.equal(login.status, 200, 'ordinary seeded local account signs in');
  const { access_token } = await login.json();
  const getAs = (path, token) => fetch(new URL(`/rest/v1/${path}`, connection.API_URL), {
    redirect: 'error', headers: { apikey: clientKey, Authorization: `Bearer ${token}` },
  });
  const visible = await getAs(`events?${eventFilter}`, access_token);
  assert.equal(visible.status, 200);
  const eligible = events.filter(e => ['published', 'cancelled', 'postponed'].includes(e.status) && ['public', 'authenticated'].includes(e.visibility));
  assert.deepEqual((await visible.json()).map(e => e.id).sort(), eligible.map(e => e.id).sort());
  const occurrences = await getAs(`event_occurrences?event_id=in.(${eventIds})`, access_token);
  assert.equal(occurrences.status, 200);
  assert.equal((await occurrences.json()).length, before.occurrences.filter(o => eligible.some(e => e.id === o.event_id)).length);
  const anonymous = await getAs(`events?${eventFilter}`, clientKey);
  assert.ok([401, 403].includes(anonymous.status), 'anonymous database access is denied');
  const deniedWrite = await fetch(new URL('/rest/v1/events', connection.API_URL), { method: 'POST', redirect: 'error',
    headers: { apikey: clientKey, Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(deniedWrite.status, 403);
  console.log(JSON.stringify({ phase: 'ordinary-session-rls', eligibleEvents: eligible.length,
    authenticatedRead: true, anonymousDenied: true, authenticatedWriteDenied: true }));

  const cli = spawnSync(process.execPath, ['scripts/import-localist.mjs', '--start', config.observedRange.start,
    '--end', config.observedRange.end, '--page-size', '5', '--mappings', configPath, '--setup-local-catalog'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 90000 });
  const output = JSON.parse(cli.stdout);
  assert.equal(output.counts.failed, 0);
  assert.equal(cli.status, output.counts.rejected ? 1 : 0, 'partial rejection is signalled after processing valid records');
  assert.equal(output.counts.unchanged, drafts.length);
  console.log(JSON.stringify({ phase: 'real-cli-retry', ...output.counts, exitCode: cli.status }));
});
