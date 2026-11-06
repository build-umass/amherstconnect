import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSupabaseGetter } from '../src/services/supabaseClientFactory.ts';
import { readSupabaseConfig, SUPABASE_AUTH_OPTIONS } from '../src/services/supabaseConfig.ts';

function setup({ platform = 'ios', currentState = 'active', readConfig } = {}) {
  const calls = [];
  const starts = [];
  const stops = [];
  const listeners = [];
  const stored = new Map();
  const storage = {
    getItem: (key) => stored.get(key) ?? null,
    setItem: (key, value) => { stored.set(key, value); },
    removeItem: (key) => { stored.delete(key); },
  };
  const client = { auth: {
    startAutoRefresh: () => starts.push('start'),
    stopAutoRefresh: () => stops.push('stop'),
  } };
  const getSupabase = createSupabaseGetter({
    readConfig: readConfig ?? (() => ({ url: 'https://example.supabase.co', publishableKey: 'sb_publishable_test_key' })),
    createClient: (...args) => { calls.push(args); return client; },
    authOptions: SUPABASE_AUTH_OPTIONS,
    storage,
    platform,
    appState: {
      currentState,
      addEventListener: (event, listener) => {
        listeners.push({ event, listener });
        return { remove() {} };
      },
    },
  });
  return { getSupabase, calls, starts, stops, listeners, client, stored };
}

test('creates the client lazily and reuses the singleton', () => {
  const state = setup();
  assert.equal(state.calls.length, 0);
  const first = state.getSupabase();
  assert.equal(state.getSupabase(), first);
  assert.equal(state.calls.length, 1);
  assert.equal(state.listeners.length, 1);
});

test('passes persistent auth options and AsyncStorage to the client', async () => {
  const state = setup();
  state.getSupabase();
  const [url, key, options] = state.calls[0];
  assert.equal(url, 'https://example.supabase.co');
  assert.equal(key, 'sb_publishable_test_key');
  const { storage, ...auth } = options.auth;
  assert.deepEqual(auth, SUPABASE_AUTH_OPTIONS);
  await storage.setItem('verifier', '"abc/recovery"');
  assert.equal(await storage.getItem('verifier'), '"abc/recovery"');
  await storage.removeItem('verifier');
  assert.equal(state.stored.size, 0);
});

test('Google provider tokens are not persisted with the session', async () => {
  const state = setup();
  state.getSupabase();
  const { storage } = state.calls[0][2].auth;
  const session = { access_token: 'a', refresh_token: 'r', user: { app_metadata: { provider: 'google' } } };
  await storage.setItem('sb-auth-token', JSON.stringify({ ...session, provider_token: 'g', provider_refresh_token: 'gr' }));
  assert.deepEqual(JSON.parse(state.stored.get('sb-auth-token')), session);
});

test('keeps a missing-config error clear and does not create a client', () => {
  const state = setup({ readConfig: () => readSupabaseConfig(undefined) });
  assert.throws(state.getSupabase, /Missing: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY/);
  assert.equal(state.calls.length, 0);
});

test('starts token refresh only while the native app is active', () => {
  const state = setup({ currentState: 'active' });
  state.getSupabase();
  assert.deepEqual(state.starts, ['start']);
  assert.deepEqual(state.stops, []);
  assert.equal(state.listeners[0].event, 'change');

  state.listeners[0].listener('background');
  assert.deepEqual(state.stops, ['stop']);
  state.listeners[0].listener('active');
  assert.deepEqual(state.starts, ['start', 'start']);
});

test('does not configure native storage or an AppState listener on web', () => {
  const state = setup({ platform: 'web' });
  state.getSupabase();
  assert.deepEqual(state.calls[0][2].auth, SUPABASE_AUTH_OPTIONS);
  assert.equal(state.listeners.length, 0);
  assert.deepEqual(state.starts, []);
  assert.deepEqual(state.stops, []);
});
