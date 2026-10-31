import { normalizeLabel } from './importer.mjs';

const issue = (code, path, message) => ({ code, path, message });
const sourceId = value => typeof value === 'string' && value.trim() ? value.trim()
  : Number.isSafeInteger(value) ? String(value) : null;

/** Source dimensions survive until this boundary. A flat label lookup cannot
 * distinguish an audience from an event type with the same display name.
 * This function never creates catalogs or guesses aliases.
 */
export function mapLocalistCandidates(raw, draft, config) {
  const issues = [];
  const warnings = [];
  const rules = config?.localistFilters;
  if (!rules || typeof rules !== 'object' || Array.isArray(rules)) {
    return { ok: false, issues: [issue('unresolved_source_mapping', 'filters', 'Supply reviewed localistFilters keyed by filter dimension and source ID.')] };
  }
  const selected = [];
  const unmappedTopics = [];
  for (const [dimension, items] of Object.entries(raw.filters ?? {})) {
    if (dimension === 'event_audience') {
      if (items.length) warnings.push(issue('audience_not_category', 'raw.filters.event_audience',
        `Audience metadata is not an event category: ${items.map(x => `${sourceId(x.id) ?? 'no-id'} (${x.name})`).join('; ')}.`));
      continue;
    }
    for (const [index, item] of items.entries()) {
      const id = sourceId(item.id);
      const key = `${dimension}:id:${id ?? 'missing'}`;
      const rule = rules[key];
      const path = `raw.filters.${dimension}[${index}]`;
      if (!['event_types', 'event_topic'].includes(dimension) || !id || !rule
        || typeof rule.label !== 'string' || normalizeLabel(rule.label) !== normalizeLabel(item.name)) {
        const problem = issue('unresolved_source_mapping', path, `Review ${key} (${item.name}); no category inferred.`);
        (dimension === 'event_topic' ? unmappedTopics : issues).push(problem);
        continue;
      }
      if (rule.categoryLabel === null && typeof rule.reviewReason === 'string' && rule.reviewReason.trim()) {
        const problem = issue('ambiguous_source_mapping', path, `Review ${key} (${item.name}): ${rule.reviewReason}`);
        (dimension === 'event_topic' ? unmappedTopics : issues).push(problem);
        continue;
      }
      if (typeof rule.categoryLabel !== 'string' || !rule.categoryLabel.trim()
        || !config.categories?.[normalizeLabel(rule.categoryLabel)]) {
        issues.push(issue('unresolved_source_mapping', path, `Category target for ${key} is not configured.`));
        continue;
      }
      selected.push({ key, dimension, label: rule.categoryLabel.trim() });
    }
  }
  const labels = [...new Map(selected.map(x => [normalizeLabel(x.label), x.label])).values()];
  const typeLabels = [...new Map(selected.filter(x => x.dimension === 'event_types').map(x => [normalizeLabel(x.label), x.label])).values()];
  // A supplemental subject is not a required app category. Keep it visible for
  // review without discarding an otherwise categorized event. With no usable
  // category, retain the mapping issues and reject instead of inventing a fallback.
  if (labels.length) warnings.push(...unmappedTopics.map(problem => ({ ...problem, code: 'unmapped_topic' })));
  else {
    issues.push(...unmappedTopics);
    issues.push(issue('no_usable_category', 'categoryLabels', `Event ${draft.externalId} has no mapped app category.`));
  }
  const override = config.primaryCategoryByEvent?.[draft.externalId];
  let primary = null;
  if (override !== undefined) {
    primary = selected.find(x => x.key === override)?.label ?? null;
  } else if (config.primaryCategoryPolicy === 'single-event-type-or-single-category') {
    primary = typeLabels.length === 1 ? typeLabels[0] : labels.length === 1 ? labels[0] : null;
  }
  if (labels.length && !primary) issues.push(issue('unresolved_primary_category', 'primaryCategoryLabel',
    `Event ${draft.externalId} needs an explicit primary category among its mapped type/topic candidates.`));

  // SQL currently has one organization per event. Do not silently choose the
  // provider's first co-host. An explicit per-event source ID can resolve it.
  const groups = [...new Map((raw.groups ?? []).filter(g => typeof g?.name === 'string' && g.name.trim())
    .map(g => [sourceId(g.id) ?? `name:${normalizeLabel(g.name)}`, g])).values()];
  let organization = draft.organization;
  const groupOverride = config.organizationByEvent?.[draft.externalId];
  if (groupOverride !== undefined || groups.length > 1) {
    const group = groups.find(g => sourceId(g.id) === groupOverride);
    if (!group) issues.push(issue('unresolved_organization_selection', 'organization',
      `Event ${draft.externalId} has organizer candidates ${groups.map(g => `${sourceId(g.id) ?? 'no-id'} (${g.name.trim()})`).join('; ')}; select a primary source group explicitly.`));
    else organization = { name: group.name.trim(), externalId: sourceId(group.id), sourceUrl: null };
  }
  const occurrences = draft.occurrences.map(o => {
    if (o.locationType === 'virtual' || !o.venue) return o;
    const building = (typeof raw.location_name === 'string' && raw.location_name.trim())
      || (typeof raw.location === 'string' && raw.location.trim());
    if (!building) return o; // Existing F11 validation handles insufficient location.
    const room = o.venue.room;
    return { ...o, venue: { ...o.venue, name: building },
      locationName: room ? `${building}, ${room}` : building };
  });
  if (issues.length) return { ok: false, issues, warnings };
  return { ok: true, value: { ...draft, categoryLabels: labels, primaryCategoryLabel: primary, organization, occurrences }, warnings };
}
