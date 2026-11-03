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
  const { drafts, rejected } = adaptLocalistRecords(raw, undefined, config);
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

  // Wider, still bounded public sample. Some source IDs appear once per
  // recurrence; compare identities/counts, not an assumed one-record-per-event.
  const representative = await importLocalistWindow({ range: config.representativeRange, mappings: config,
    transport, pageSize: 10 });
  assert.ok(representative.counts.imported > 0);
  assert.equal(representative.counts.failed, 0);
  assert.ok(representative.rejected.some(r => r.issues.some(i => i.code === 'unresolved_organization_selection')));
  assert.ok(representative.rejected.some(r => r.issues.some(i => i.code === 'invalid_location')));
  const allEvents = () => transport('events?source_type=eq.localist&order=id');
  const allOccurrences = () => transport('event_occurrences?source_type=eq.localist&order=id');
  const identities = async () => ({ events: (await allEvents()).map(e => [e.id, e.external_id]),
    occurrences: (await allOccurrences()).map(o => [o.id, o.external_id, o.event_id]) });
  const beforeRepeat = await identities();
  const again = await importLocalistWindow({ range: config.representativeRange, mappings: config, transport, pageSize: 10 });
  assert.equal(again.counts.failed, 0);
  assert.equal(again.counts.created, 0);
  assert.deepEqual(await identities(), beforeRepeat);
  const savedEvents = await allEvents();
  const links = await transport('event_categories?select=event_id,category_id');
  assert.ok(savedEvents.every(e => links.some(l => l.event_id === e.id && l.category_id === e.primary_category_id)));
  assert.ok(!config.catalog.categories.some(c => ['Students', 'Faculty', 'Staff', 'Public/Everyone'].includes(c.name)));
  // Explicitly unresolved source mapping must not create or alter any content.
  const contentBefore = { events: await allEvents(), occurrences: await allOccurrences() };
  const unmapped = structuredClone(config); delete unmapped.localistFilters['event_types:id:48709285422708'];
  const unresolved = await importLocalistWindow({ range: config.observedRange, mappings: unmapped, transport,
    fetchImpl: async () => Response.json({ events: [{ event: raw[0] }], page: { current: 1, total: 1 } }) });
  assert.equal(unresolved.counts.rejected, 1);
  assert.equal(unresolved.runId, null);
  assert.deepEqual({ events: await allEvents(), occurrences: await allOccurrences() }, contentBefore);
  const rejectionReasonCounts = {};
  for (const record of representative.rejected) for (const code of new Set(record.issues.map(i => i.code))) {
    rejectionReasonCounts[code] = (rejectionReasonCounts[code] ?? 0) + 1;
  }
  const topicWarnings = representative.warnings.flatMap(record => record.issues).filter(i => i.code === 'unmapped_topic').length;
  assert.ok(topicWarnings > 0, 'supplemental unmapped subjects remain visible as warnings');
  console.log(JSON.stringify({ phase: 'representative-mappings', ...representative.counts, rejectionReasonCounts, topicWarnings,
    rejected: representative.rejected.map(r => ({ id: r.externalId, codes: r.issues.map(i => i.code) })),
    repeatCreated: again.counts.created, stableIdentities: true, primaryMembership: true, unresolvedNoWrites: true }));

  // Controlled canonical drafts exercise two rooms in the same real source
  // building without changing the building catalog or a real event record.
  const roomCandidate = structuredClone(drafts[0]);
  const campus = config.catalog.venues.find(v => v.external_id === '45702739081704');
  const roomDrafts = ['165', '922'].map((room, index) => {
    const d = structuredClone(roomCandidate); d.externalId = `local-room-test-${index}`;
    d.occurrences = [structuredClone(d.occurrences[0])];
    Object.assign(d.occurrences[0], { externalId: `local-room-occurrence-${index}`, locationType: 'physical',
      locationName: `Campus Center, ${room}`, virtualUrl: null, coordinates: { latitude: 42.3917, longitude: -72.5275 } });
    d.occurrences[0].venue = { name: 'Campus Center', room, externalId: '45702739081704', sourceUrl: campus.source_url,
      addressLine1: null, addressLine2: null, city: null, region: null, postalCode: null, countryCode: null,
      coordinates: { latitude: 42.3917, longitude: -72.5275 } };
    return d;
  });
  const rooms = await importDrafts({ sourceType: 'localist', drafts: roomDrafts, mappings: config, transport });
  assert.ok(rooms.outcomes.every(o => o.outcome === 'created'));
  const roomRows = await transport(`event_occurrences?event_id=in.(${rooms.outcomes.map(o => o.eventId).join(',')})&order=external_id`);
  assert.deepEqual(roomRows.map(o => o.venue_id), [campus.id, campus.id]);
  assert.deepEqual(roomRows.map(o => o.location_name), ['Campus Center, 165', 'Campus Center, 922']);
  const buildings = await transport('venues?source_type=eq.localist&external_id=eq.45702739081704');
  assert.equal(buildings.length, 1); assert.equal(buildings[0].room, null); assert.equal(buildings[0].name, 'Campus Center');
  console.log(JSON.stringify({ phase: 'same-building-different-rooms', buildings: 1, occurrences: roomRows.length,
    roomDetailsPreserved: true, buildingNotOverwritten: true }));
});
