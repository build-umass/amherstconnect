// JSON boundary validation precedes the typed F11 semantic validator. Nullable
// fields must still be present; never coerce strings to booleans/numbers.
export function validateDraftShape(value) {
  const issues = [];
  const issue = path => issues.push({ code: 'invalid_shape', path, message: 'Missing field or incorrect JSON type.' });
  const object = (v, path) => {
    if (v === null || typeof v !== 'object' || Array.isArray(v)) { issue(path); return false; }
    return true;
  };
  const fields = (v, path, required, nullable = [], numeric = [], booleans = []) => {
    for (const k of required) if (typeof v[k] !== 'string') issue(`${path}${k}`);
    for (const k of nullable) if (v[k] !== null && typeof v[k] !== 'string') issue(`${path}${k}`);
    for (const k of numeric) if (v[k] !== null && (typeof v[k] !== 'number' || !Number.isFinite(v[k]))) issue(`${path}${k}`);
    for (const k of booleans) if (typeof v[k] !== 'boolean') issue(`${path}${k}`);
  };
  const coordinates = (v, path) => {
    if (v === null) return;
    if (!object(v, path)) return;
    for (const k of ['latitude', 'longitude']) if (typeof v[k] !== 'number' || !Number.isFinite(v[k])) issue(`${path}.${k}`);
  };
  const candidate = (v, path, venue = false) => {
    if (v === null) return;
    if (!object(v, path)) return;
    fields(v, `${path}.`, ['name'], ['externalId', 'sourceUrl', ...(venue ? ['room', 'addressLine1', 'addressLine2', 'city', 'region', 'postalCode', 'countryCode'] : [])]);
    if (typeof v.name === 'string' && !v.name.trim()) issue(`${path}.name`);
    if (venue) coordinates(v.coordinates, `${path}.coordinates`);
  };
  if (!object(value, '')) return issues;
  fields(value, '', ['sourceType', 'title', 'primaryCategoryLabel', 'status', 'visibility', 'timezone', 'registrationType'],
    ['externalId', 'sourceUrl', 'sourceUpdatedAt', 'description', 'imageUrl', 'registrationUrl'], ['featuredRank'], ['isFree']);
  candidate(value.organization, 'organization');
  if (!Array.isArray(value.categoryLabels)) issue('categoryLabels');
  else value.categoryLabels.forEach((v, i) => { if (typeof v !== 'string') issue(`categoryLabels[${i}]`); });
  if (!Array.isArray(value.occurrences)) issue('occurrences');
  else value.occurrences.forEach((v, i) => {
    const path = `occurrences[${i}]`;
    if (!object(v, path)) return;
    fields(v, `${path}.`, ['sourceType', 'startsAt', 'status', 'locationType'],
      ['externalId', 'endsAt', 'locationName', 'virtualUrl', 'sourceUpdatedAt'], ['sourceAttendanceCount'], ['allDay']);
    candidate(v.venue, `${path}.venue`, true);
    coordinates(v.coordinates, `${path}.coordinates`);
  });
  return issues;
}
