import { createHash } from 'node:crypto';
import { validateAdapterEventDraft } from '../../shared/contracts/event.ts';
import { validateDraftShape } from './shape.mjs';

export const normalizeLabel = value => value.trim().replace(/\s+/g, ' ').toLowerCase();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const stable = value => Array.isArray(value) ? value.map(stable)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k, stable(value[k])])) : value;
export const payloadHash = value => createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');

/** Mapping aliases are explicit approvals, never fuzzy or first-name matches.
 * Entity keys: sourceType:id:externalId, or sourceType:name:normalized name.
 * Category keys are normalized source labels. Values must be existing UUIDs.
 */
export function resolveMappings(draft, config) {
  const issues = [];
  function lookup(section, key, path) {
    const id = config?.[section]?.[key];
    if (typeof id !== 'string' || !uuid.test(id)) {
      issues.push({ code: 'unresolved_mapping', path, message: `Supply an approved ${section} mapping.` });
      return null;
    }
    return id;
  }
  function entity(section, candidate, path) {
    if (candidate === null) return null;
    const key = candidate.externalId !== null
      ? `${draft.sourceType}:id:${candidate.externalId}`
      : `${draft.sourceType}:name:${normalizeLabel(candidate.name)}`;
    return lookup(section, key, path);
  }
  const categoryIds = [...new Set(draft.categoryLabels.map((label, i) =>
    lookup('categories', normalizeLabel(label), `categoryLabels[${i}]`)))];
  const mapping = {
    organizationId: entity('organizations', draft.organization, 'organization'),
    categoryIds,
    primaryCategoryId: lookup('categories', normalizeLabel(draft.primaryCategoryLabel), 'primaryCategoryLabel'),
    venueIds: draft.occurrences.map((o, i) => entity('venues', o.venue, `occurrences[${i}].venue`)),
  };
  return issues.length ? { ok: false, issues } : { ok: true, mapping };
}

export function prepareRecord(input, mappings) {
  let validation;
  try {
    const issues = validateDraftShape(input);
    if (issues.length) return { outcome: 'invalid', issues };
    // Strip prototypes after type checks so JSON serialization cannot coerce
    // non-finite numbers into nullable fields.
    const draft = JSON.parse(JSON.stringify(input));
    validation = validateAdapterEventDraft(draft);
    if (validation.ok && !['localist', 'campus_pulse'].includes(draft.sourceType)) {
      return { outcome: 'invalid', issues: [{ code: 'invalid_source_identity', path: 'sourceType', message: 'Importer requires an external provider identity.' }] };
    }
  } catch {
    return { outcome: 'invalid', issues: [{ code: 'invalid_shape', path: '', message: 'Input must be a complete JSON F11 AdapterEventDraft.' }] };
  }
  if (!validation.ok) return { outcome: 'invalid', issues: validation.issues };
  const resolved = resolveMappings(validation.value, mappings);
  return resolved.ok ? { draft: validation.value, mapping: resolved.mapping }
    : { outcome: 'unresolved', issues: resolved.issues };
}

/** The transport is server-side only. A01 passes successful AdapterResult.value
 * records here; no raw Localist payload, UI model or mobile credential belongs here.
 */
export async function importDrafts({ sourceType, drafts, mappings, transport }) {
  if (!['localist', 'campus_pulse'].includes(sourceType) || !Array.isArray(drafts)) throw new TypeError('Expected an external source and draft array.');
  const run = await transport('import_runs', { method: 'POST', body: { source_type: sourceType, expected_records: drafts.length } });
  const runId = run[0].id;
  const outcomes = [];
  try {
    for (const [index, raw] of drafts.entries()) {
      const prepared = prepareRecord(raw, mappings);
      if (prepared.draft && prepared.draft.sourceType !== sourceType) {
        prepared.outcome = 'invalid';
        prepared.issues = [{ code: 'source_type_mismatch', path: 'sourceType', message: 'Draft must match the import run source.' }];
      }
      const failure = prepared.outcome ? { outcome: prepared.outcome, issues: prepared.issues } : null;
      const draft = prepared.draft ?? { externalId: typeof raw?.externalId === 'string' ? raw.externalId : null };
      const result = await transport('rpc/import_event_record', { method: 'POST', body: {
        p_run_id: runId, p_record_index: index, p_draft: draft,
        p_mapping: prepared.mapping ?? {}, p_payload_hash: payloadHash({ raw, mapping: prepared.mapping ?? null }),
        p_failure: failure,
      } });
      outcomes.push(result);
    }
    await transport(`import_runs?id=eq.${runId}`, { method: 'PATCH', body: {
      status: outcomes.some(o => ['invalid', 'unresolved', 'failed'].includes(o.outcome)) ? 'failed' : 'completed',
      finished_at: new Date().toISOString(),
    } });
    return { runId, outcomes };
  } catch {
    await transport(`import_runs?id=eq.${runId}`, { method: 'PATCH', body: { status: 'failed', finished_at: new Date().toISOString() } });
    throw new Error(`Import run ${runId} interrupted; inspect its recorded outcomes. A new run can safely retry.`);
  }
}

export function createLocalTransport(url, key, fetchImpl = fetch) {
  const parsed = new URL(url);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) || parsed.username || parsed.password || !['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('This importer entry point accepts only a local Supabase endpoint.');
  }
  if (!key) throw new Error('Local importer requires a privileged local key.');
  return async (path, { method = 'GET', body } = {}) => {
    const response = await fetchImpl(new URL(`/rest/v1/${path}`, parsed), {
      method, redirect: 'error', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) throw new Error(`Local importer request failed (${response.status}); credentials and response body omitted.`);
    return response.json();
  };
}
