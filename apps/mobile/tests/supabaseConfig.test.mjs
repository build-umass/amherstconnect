import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  readSupabaseConfig,
  SUPABASE_AUTH_OPTIONS,
} from '../src/services/supabaseConfig.ts';

const valid = {
  supabaseUrl: 'https://example.supabase.co',
  supabasePublishableKey: 'sb_publishable_test_key',
};

test('returns the configured url and key', () => {
  assert.deepEqual(readSupabaseConfig(valid), {
    url: 'https://example.supabase.co',
    publishableKey: 'sb_publishable_test_key',
  });
});

test('trims surrounding whitespace', () => {
  const config = readSupabaseConfig({
    supabaseUrl: '  https://example.supabase.co ',
    supabasePublishableKey: ' sb_publishable_test_key\n',
  });
  assert.equal(config.url, 'https://example.supabase.co');
  assert.equal(config.publishableKey, 'sb_publishable_test_key');
});

test('accepts a local development url', () => {
  const config = readSupabaseConfig({ ...valid, supabaseUrl: 'http://127.0.0.1:54321' });
  assert.equal(config.url, 'http://127.0.0.1:54321');
});

test('names SUPABASE_URL when it is missing', () => {
  assert.throws(
    () => readSupabaseConfig({ ...valid, supabaseUrl: '' }),
    /Missing: SUPABASE_URL\./,
  );
});

test('names SUPABASE_PUBLISHABLE_KEY when it is missing', () => {
  assert.throws(
    () => readSupabaseConfig({ ...valid, supabasePublishableKey: undefined }),
    /Missing: SUPABASE_PUBLISHABLE_KEY\./,
  );
});

test('names both values when extra is undefined', () => {
  assert.throws(
    () => readSupabaseConfig(undefined),
    /Missing: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY/,
  );
});

test('treats whitespace-only values as missing', () => {
  assert.throws(
    () => readSupabaseConfig({ supabaseUrl: '   ', supabasePublishableKey: '  ' }),
    /Missing: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY/,
  );
});

test('rejects a url without http or https', () => {
  assert.throws(
    () => readSupabaseConfig({ ...valid, supabaseUrl: 'example.supabase.co' }),
    /must start with http/,
  );
});

test('rejects a secret key', () => {
  assert.throws(
    () => readSupabaseConfig({ ...valid, supabasePublishableKey: 'sb_secret_abc' }),
    /secret key/,
  );
});

test('persists sessions and refreshes tokens', () => {
  assert.equal(SUPABASE_AUTH_OPTIONS.persistSession, true);
  assert.equal(SUPABASE_AUTH_OPTIONS.autoRefreshToken, true);
  assert.equal(SUPABASE_AUTH_OPTIONS.detectSessionInUrl, false);
});