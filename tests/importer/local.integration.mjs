// Explicit local integration test. Requires a running, freshly reset local stack.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { localConnection } from '../../scripts/importer/local-connection.mjs';
import { draft, mappings } from './drafts.mjs';
import { importDrafts, createLocalTransport } from '../../scripts/importer/importer.mjs';

test('F11 drafts reach local PostgreSQL atomically and idempotently through REST', async () => {
  const c = localConnection();
  const transport = createLocalTransport(c.API_URL, c.SERVICE_ROLE_KEY ?? c.SECRET_KEY);
  const run = async (d, config = mappings) => (await importDrafts({ sourceType: 'localist', drafts: [d], mappings: config, transport })).outcomes[0];
  const original = draft();
  const missingOrganization = draft(); delete missingOrganization.organization;
  const missingVenue = draft(); delete missingVenue.occurrences[0].venue;
  const incorrectType = draft(); incorrectType.isFree = 'false';
  const batch = await importDrafts({ sourceType: 'localist', drafts: [missingOrganization, missingVenue, incorrectType, original], mappings, transport });
  assert.deepEqual(batch.outcomes.map(o => o.outcome), ['invalid', 'invalid', 'invalid', 'created']);
  assert.equal((await transport(`event_import_records?run_id=eq.${batch.runId}`)).length, 4);
  assert.equal((await transport(`import_runs?id=eq.${batch.runId}`))[0].status, 'failed');
  // The valid record after malformed inputs really reached PostgreSQL.
  original.externalId = 'a08-rest-event';
  original.occurrences.forEach(o => { o.externalId = `rest-${o.externalId}`; });
  const first = await run(original); assert.equal(first.outcome, 'created');
  const id = first.eventId;
  const occurrences = () => transport(`event_occurrences?event_id=eq.${id}&order=external_id`);
  const before = await occurrences(); assert.equal(before.length, 2); assert.notEqual(before[0].id, before[1].id);
  assert.equal((await run(original)).outcome, 'unchanged');
  assert.deepEqual((await occurrences()).map(o => o.id), before.map(o => o.id));
  const changed = structuredClone(original); changed.title = 'Updated concert'; changed.sourceUpdatedAt = '2026-10-27T12:00:00Z';
  const update = await run(changed); assert.equal(update.outcome, 'updated'); assert.equal(update.eventId, id);
  assert.equal((await run(original)).outcome, 'stale');
  const invalid = draft(); invalid.title = ''; assert.equal((await run(invalid)).outcome, 'invalid');
  assert.equal((await run(draft(), {})).outcome, 'unresolved');
  // Distinct source IDs at one start instant pass F11 but collide in SQL.
  const failed = structuredClone(changed); failed.title = 'Must roll back';
  failed.occurrences[1].startsAt = failed.occurrences[0].startsAt;
  assert.equal((await run(failed)).outcome, 'failed');
  assert.equal((await transport(`events?id=eq.${id}`))[0].title, 'Updated concert');
  const records = await transport(`event_import_records?event_id=eq.${id}`);
  assert.ok(records.some(r => r.outcome === 'stale'));
  // Real REST path also permits schedule swaps without replacing UUIDs.
  const swap = structuredClone(changed);
  [swap.occurrences[0].startsAt, swap.occurrences[1].startsAt] = [swap.occurrences[1].startsAt, swap.occurrences[0].startsAt];
  swap.occurrences.forEach(o => { o.endsAt = null; });
  assert.equal((await run(swap)).outcome, 'updated');
  assert.deepEqual((await occurrences()).map(o => o.id), before.map(o => o.id));
  assert.equal((await run(changed)).outcome, 'updated');
  const directory = await mkdtemp(join(tmpdir(), 'a08-cli-input-'));
  const inputFile = join(directory, 'drafts.json'); const mappingFile = join(directory, 'mappings.json');
  await writeFile(inputFile, JSON.stringify([missingOrganization, missingVenue, incorrectType, changed])); await writeFile(mappingFile, JSON.stringify(mappings));
  const cli = spawnSync(process.execPath, ['scripts/import-events.mjs', inputFile, mappingFile], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  assert.equal(cli.status, 1, 'CLI signals partial failure after processing every record');
  const cliResult = JSON.parse(cli.stdout);
  assert.deepEqual(cliResult.outcomes.map(o => o.outcome), ['invalid', 'invalid', 'invalid', 'unchanged']);
});
