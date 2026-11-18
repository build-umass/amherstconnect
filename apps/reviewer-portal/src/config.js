export function isPublicClientKey(value) {
  if (typeof value !== 'string') return false;
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(value)) return true;
  const parts = value.split('.');
  if (parts.length !== 3 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) return false;
  try {
    return JSON.parse(atob(parts[1].replaceAll('-', '+').replaceAll('_', '/'))).role === 'anon';
  } catch {
    return false;
  }
}
