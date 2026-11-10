import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPushDevices, pushRegistrationFor, PushDeviceError } from '../src/services/pushDevices.ts';

const TOKEN = 'ExponentPushToken[device-1]';

function deferred() {
  let resolve;
  const promise = new Promise((res) => { resolve = res; });
  return { promise, resolve };
}

/** A fake expo-notifications platform and Supabase client that record every call. */
function setup({
  os = 'android',
  permission = 'granted',
  afterPrompt = 'granted',
  getPermission,
  tokenError = null,
  rpcError = null,
} = {}) {
  const calls = [];
  const platform = {
    os,
    async prepare() { calls.push('prepare'); },
    async getPermission() {
      calls.push('getPermission');
      return getPermission ? getPermission() : permission;
    },
    async requestPermission() { calls.push('requestPermission'); return afterPrompt; },
    async getExpoPushToken() {
      calls.push('getExpoPushToken');
      if (tokenError) throw tokenError;
      return TOKEN;
    },
  };
  const client = {
    async rpc(fn, args) {
      calls.push(args === undefined ? [fn] : [fn, args]);
      return { data: null, error: rpcError };
    },
  };
  return { calls, devices: createPushDevices({ client, platform }) };
}

test('registers the Expo push token of a device that allows notifications', async () => {
  const { calls, devices } = setup();
  assert.deepEqual(await devices.sync({ prompt: true }), { status: 'registered', token: TOKEN });
  assert.deepEqual(calls, [
    'prepare',
    'getPermission',
    'getExpoPushToken',
    ['register_push_device', { p_expo_push_token: TOKEN, p_platform: 'android' }],
  ]);
});

test('asks for permission after creating the Android channel, then registers', async () => {
  const { calls, devices } = setup({ os: 'ios', permission: 'undetermined' });
  assert.equal((await devices.sync({ prompt: true })).status, 'registered');
  assert.deepEqual(calls.slice(0, 3), ['prepare', 'getPermission', 'requestPermission']);
  assert.deepEqual(calls.at(-1), ['register_push_device', { p_expo_push_token: TOKEN, p_platform: 'ios' }]);
});

test('does not show the prompt when both notification preferences are off', async () => {
  const { calls, devices } = setup({ permission: 'undetermined' });
  assert.deepEqual(await devices.sync({ prompt: false }), { status: 'not_permitted', permission: 'undetermined' });
  assert.ok(!calls.includes('requestPermission'));
  assert.ok(!calls.includes('getExpoPushToken'));
  assert.deepEqual(calls.at(-1), ['unregister_push_device']);
});

test('declining the prompt removes any registration for this device', async () => {
  const { calls, devices } = setup({ permission: 'undetermined', afterPrompt: 'denied' });
  assert.deepEqual(await devices.sync({ prompt: true }), { status: 'not_permitted', permission: 'denied' });
  assert.deepEqual(calls.at(-1), ['unregister_push_device']);
});

test('never asks again after a refusal, and unregisters the device', async () => {
  const { calls, devices } = setup({ permission: 'denied' });
  assert.deepEqual(await devices.sync({ prompt: true }), { status: 'not_permitted', permission: 'denied' });
  assert.deepEqual(calls, ['prepare', 'getPermission', ['unregister_push_device']]);
});

test('simulators, emulators and web touch neither permissions nor Supabase', async () => {
  const { calls, devices } = setup({ os: null });
  assert.deepEqual(await devices.sync({ prompt: true }), { status: 'unsupported' });
  assert.deepEqual(calls, []);
});

test('a Supabase error rejects with its database code', async () => {
  const { devices } = setup({ rpcError: { message: 'insert or update violates foreign key constraint', code: '23503' } });
  await assert.rejects(devices.sync({ prompt: true }), (error) => {
    assert.ok(error instanceof PushDeviceError);
    assert.equal(error.code, '23503');
    assert.match(error.message, /register this device/);
    return true;
  });
});

test('a failure to get the Expo token is reported without calling Supabase', async () => {
  const failure = new Error('Fetching the token failed');
  const { calls, devices } = setup({ tokenError: failure });
  await assert.rejects(devices.sync({ prompt: true }), failure);
  assert.ok(!calls.some((call) => Array.isArray(call)));
});

test('overlapping calls run one at a time, so the latest call decides', async () => {
  const first = deferred();
  const answers = [first.promise, 'denied'];
  const { calls, devices } = setup({ getPermission: () => answers.shift() });

  const earlier = devices.sync({ prompt: true });
  const later = devices.sync({ prompt: true });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, ['prepare', 'getPermission'], 'the second call waits for the first');

  first.resolve('granted');
  assert.equal((await earlier).status, 'registered');
  assert.equal((await later).status, 'not_permitted');
  assert.deepEqual(calls.filter(Array.isArray).map(([fn]) => fn), ['register_push_device', 'unregister_push_device']);
});

test('a failed call does not block the next one', async () => {
  let fail = true;
  const { devices } = setup({
    getPermission: () => {
      if (fail) {
        fail = false;
        throw new Error('permissions unavailable');
      }
      return 'granted';
    },
  });
  await assert.rejects(devices.sync({ prompt: true }), /permissions unavailable/);
  assert.equal((await devices.sync({ prompt: true })).status, 'registered');
});

const signedIn = (prefs, overrides = {}) => ({
  status: 'signed_in',
  user: { id: 'alice' },
  profile: { notificationPrefs: prefs },
  passwordRecovery: false,
  ...overrides,
});

test('registers only users who finished onboarding, outside password recovery', () => {
  const prefs = { newEvents: true, savedReminders: true };
  assert.deepEqual(pushRegistrationFor(signedIn(prefs)), { userId: 'alice', prompt: true });
  for (const status of ['initializing', 'signed_out', 'loading_profile', 'onboarding', 'profile_error']) {
    assert.equal(pushRegistrationFor(signedIn(prefs, { status })), null, status);
  }
  assert.equal(pushRegistrationFor(signedIn(prefs, { passwordRecovery: true })), null);
  assert.equal(pushRegistrationFor(signedIn(prefs, { profile: null })), null);
  assert.equal(pushRegistrationFor(signedIn(prefs, { user: null })), null);
});

test('the permission prompt needs at least one notification preference on', () => {
  assert.equal(pushRegistrationFor(signedIn({ newEvents: false, savedReminders: true })).prompt, true);
  assert.equal(pushRegistrationFor(signedIn({ newEvents: true, savedReminders: false })).prompt, true);
  assert.equal(pushRegistrationFor(signedIn({ newEvents: false, savedReminders: false })).prompt, false);
});
