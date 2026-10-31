import { LocalistAdapter, fetchLocalistEvents } from '../../shared/adapters/localist.ts';
import { validateAdapterEventDraft } from '../../shared/contracts/event.ts';
import { validateDraftShape } from './shape.mjs';
import { importDrafts } from './importer.mjs';
import { mapLocalistCandidates } from './localist-mappings.mjs';

export const LOCALIST_ORIGIN = 'https://events.umass.edu';
export const LOCALIST_ENDPOINT = `${LOCALIST_ORIGIN}/api/2/events`;

export function adaptLocalistRecords(records, fetchedAt = new Date().toISOString(), mappings) {
  const adapter = new LocalistAdapter();
  const drafts = [];
  const rejected = [];
  const warnings = [];
  for (const [index, raw] of records.entries()) {
    let result;
    try {
      result = adapter.adapt({ sourceType: 'localist', sourceUrl: LOCALIST_ENDPOINT, fetchedAt, raw });
      if (result.ok && mappings !== undefined) {
        const mapped = mapLocalistCandidates(raw, result.value, mappings);
        result = { ...mapped, warnings: [...result.warnings, ...(mapped.warnings ?? [])] };
      }
      if (result.warnings?.length) warnings.push({ index,
        externalId: result.ok ? result.value.externalId : String(raw.id), issues: result.warnings });
      if (result.ok) {
        const issues = validateDraftShape(result.value);
        result = issues.length ? { ok: false, issues } : validateAdapterEventDraft(result.value);
      }
    } catch {
      result = { ok: false, issues: [{ code: 'invalid_provider_record', path: 'raw', message: 'Malformed provider record; no content written.' }] };
    }
    if (result.ok) drafts.push(result.value);
    else rejected.push({ index, externalId: typeof raw?.id === 'number' || typeof raw?.id === 'string' ? String(raw.id) : null, issues: result.issues });
  }
  return { drafts, rejected, warnings };
}

/** Local runner only: no fetching or content mapping is added to mobile. */
export async function importLocalistWindow({ range, mappings, transport, pageSize = 100, fetchImpl = fetch }) {
  const days = (Date.parse(`${range.end}T00:00:00Z`) - Date.parse(`${range.start}T00:00:00Z`)) / 86400000;
  if (!(days > 0 && days <= 31)) throw new RangeError('Use a Localist window of 1–31 days.');
  let pagesFetched = 0;
  const records = await fetchLocalistEvents({ baseUrl: LOCALIST_ORIGIN, range, pageSize,
    signal: AbortSignal.timeout(60000), fetchImpl: (url, options) => {
      if (++pagesFetched > 20) throw new RangeError('Localist window exceeds the 20-page safety bound; narrow the range.');
      return fetchImpl(url, { ...options, redirect: 'error' });
    } });
  const { drafts, rejected, warnings } = adaptLocalistRecords(records, new Date().toISOString(), mappings);
  const imported = drafts.length ? await importDrafts({ sourceType: 'localist', drafts, mappings, transport }) : { runId: null, outcomes: [] };
  const counts = { fetched: records.length, accepted: drafts.length, rejected: rejected.length,
    imported: 0, created: 0, updated: 0, unchanged: 0, stale: 0, failed: 0 };
  for (const o of imported.outcomes) {
    if (['created', 'updated'].includes(o.outcome)) { counts.imported++; counts[o.outcome]++; }
    else if (o.outcome === 'unchanged' || o.outcome === 'stale') counts[o.outcome]++;
    else counts.failed++;
  }
  return { source: LOCALIST_ENDPOINT, range, pagesFetched, counts, ...imported, rejected, warnings };
}

/** Explicit opt-in sample catalog, never inferred from incoming labels.
 * Existing catalog rows must agree; this routine never overwrites them.
 * All mutations use the caller's existing loopback-only transport.
 */
export async function ensureLocalCatalog(config, transport) {
  if (config.localOnly !== true || config.source !== LOCALIST_ENDPOINT || !config.catalog) {
    throw new TypeError('Catalog setup requires an explicitly sourced local-only catalog.');
  }
  // Validate the complete explicit configuration before creating any row.
  for (const table of ['categories', 'organizations', 'venues']) {
    const rows = config.catalog[table] ?? [];
    if (rows.some(row => !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(row.id)
      || typeof row.name !== 'string' || !row.name.trim())) throw new TypeError('Invalid local catalog identity.');
    const ids = new Set(rows.map(row => row.id));
    const identities = rows.filter(row => row.external_id != null).map(row => `${row.source_type}:${row.external_id}`);
    if (ids.size !== rows.length || new Set(identities).size !== identities.length
      || Object.values(config[table] ?? {}).some(id => !ids.has(id))) {
      throw new TypeError(`Local ${table} mappings must reference unique explicitly configured catalog rows.`);
    }
    if (table === 'venues' && config.localistFilters
      && rows.some(row => row.source_type === 'localist' && row.room !== null)) {
      throw new TypeError('Localist venue identities describe places; rooms belong on occurrences.');
    }
  }
  for (const table of ['categories', 'organizations', 'venues']) {
    for (const row of config.catalog[table] ?? []) {
      if (!/^[a-f0-9-]{36}$/i.test(row.id) || typeof row.name !== 'string' || !row.name.trim()) throw new TypeError('Invalid local catalog identity.');
      const found = await transport(`${table}?id=eq.${row.id}`);
      if (found.length) {
        if (Object.entries(row).some(([key, value]) => found[0][key] !== value)) {
          throw new Error(`Existing ${table} row differs from the reviewed local catalog; inspect it manually.`);
        }
        continue;
      }
      await transport(table, { method: 'POST', body: row });
    }
  }
}
