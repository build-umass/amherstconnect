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

  if (!/^https?:\/\//.test(url)) {
    throw new Error('SUPABASE_URL must start with http:// or https://');
  }

  // A secret key must never ship inside the mobile app.
  if (publishableKey.startsWith('sb_secret_')) {
    throw new Error(
      'SUPABASE_PUBLISHABLE_KEY is a secret key. Use the publishable key instead.',
    );
  }

  return { url, publishableKey };
}