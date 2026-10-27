export type SupabaseConfig = {
  url: string;
  publishableKey: string;
};

type ExpoExtra = Record<string, unknown> | null | undefined;

// Shared auth settings: keep users signed in across app restarts and refresh
// tokens automatically. detectSessionInUrl is a web-only feature.
export const SUPABASE_AUTH_OPTIONS = {
  persistSession: true,
  autoRefreshToken: true,
  detectSessionInUrl: false,
} as const;

function readString(extra: ExpoExtra, key: string): string {
  const value = extra?.[key];
  return typeof value === 'string' ? value.trim() : '';
}

export function readSupabaseConfig(extra: ExpoExtra): SupabaseConfig {
  const url = readString(extra, 'supabaseUrl');
  const publishableKey = readString(extra, 'supabasePublishableKey');

  const missing: string[] = [];
  if (!url) missing.push('SUPABASE_URL');
  if (!publishableKey) missing.push('SUPABASE_PUBLISHABLE_KEY');
  if (missing.length > 0) {
    throw new Error(
      `Supabase is not configured. Missing: ${missing.join(', ')}. ` +
        'Add them to apps/mobile/.env (see .env.example) and restart Expo.',
    );
  }

  let parsedUrl: URL;
  try {
    if (!/^https?:\/\/[^/?#]+/i.test(url)) throw new Error('missing URL authority');
    parsedUrl = new URL(url);
  } catch {
    throw new Error('SUPABASE_URL must be a valid HTTP or HTTPS URL with a hostname.');
  }
  if (
    (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:')
    || !parsedUrl.hostname
    || parsedUrl.hostname === '.'
  ) {
    throw new Error('SUPABASE_URL must be a valid HTTP or HTTPS URL with a hostname.');
  }

  if (parsedUrl.username || parsedUrl.password) {
    throw new Error('SUPABASE_URL must not contain embedded credentials.');
  }

  if (publishableKey.startsWith('sb_publishable_') && publishableKey.length > 'sb_publishable_'.length) {
    return { url, publishableKey };
  }

  const jwtRole = readJwtRole(publishableKey);
  if (jwtRole === 'anon') {
    return { url, publishableKey };
  }

  // Both modern secret keys and legacy service_role JWTs grant privileged access.
  if (publishableKey.startsWith('sb_secret_') || jwtRole === 'service_role') {
    throw new Error(
      'SUPABASE_PUBLISHABLE_KEY is privileged. Use a Supabase publishable key or legacy anon key instead.',
    );
  }

  throw new Error(
    'SUPABASE_PUBLISHABLE_KEY must be a Supabase publishable key or legacy anon key.',
  );
}

function readJwtRole(key: string): string | null {
  const parts = key.split('.');
  if (parts.length !== 3 || !parts[1] || !/^[A-Za-z0-9_-]+$/.test(parts[1])) return null;

  const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  try {
    const payload = JSON.parse(atob(padded)) as { role?: unknown };
    return typeof payload.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}
