// Local Supabase integration coverage for Q01 device registration. Run from
// the repository root after `supabase db reset`, or through
// `npm run supabase:verify`. Uses fresh accounts, never the seed users.
//
// Real Supabase Auth sessions register through the app's push device module;
// only expo-notifications is simulated.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { localConnection } from '../../../scripts/importer/local-connection.mjs';
import { createAuthService } from '../src/services/authService.ts';
import { createPushDevices } from '../src/services/pushDevices.ts';

const PASSWORD = 'q01-password';
const CLIENT_OPTIONS = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

/** One app installation: its own Supabase client and push token. */
function installation(connection, token, os = 'android', options = CLIENT_OPTIONS) {
  const client = createClient(connection.API_URL, connection.PUBLISHABLE_KEY ?? connection.ANON_KEY, options);
  const state = { permission: 'granted' };
  const push = createPushDevices({
    client,
    platform: {
      os,
      async prepare() {},
      async getPermission() { return state.permission; },
      async requestPermission() { return state.permission; },
      async getExpoPushToken() { return token; },
    },
  });
  return { client, auth: createAuthService(() => client.auth), push, state };
}

async function signUpWithProfile(device, email) {
  const { data, error } = await device.client.auth.signUp({ email, password: PASSWORD });
  if (error) throw error;
  assert.ok(data.session, 'local Supabase signs new users in without email confirmation');
  const profile = await device.client
    .from('profiles')
    .insert({ id: data.user.id, display_name: 'Q01 Device Test', role: 'student', onboarding_complete: true });
  if (profile.error) throw profile.error;
  return data.user.id;
}

async function signIn(device, email) {
  const { error } = await device.client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
}

test('Q01 devices register per session and stop receiving when signed out', async () => {
  const connection = localConnection();
  const service = createClient(connection.API_URL, connection.SERVICE_ROLE_KEY ?? connection.SECRET_KEY, CLIENT_OPTIONS);
  const run = Date.now();
  const tokens = {
    phone: `ExponentPushToken[q01-phone-${run}]`,
    tablet: `ExponentPushToken[q01-tablet-${run}]`,
    other: `ExpoPushToken[q01-other-${run}]`,
  };
  const userIds = [];

  async function devicesOf(userId) {
    const { data, error } = await service
      .from('push_devices')
      .select('expo_push_token, platform, last_registered_at')
      .eq('profile_id', userId)
      .order('expo_push_token');
    if (error) throw error;
    return data;
  }

  try {
    // Alex signs up on a phone, then signs in on a tablet as well.
    const phone = installation(connection, tokens.phone);
    const alex = await signUpWithProfile(phone, `q01-alex-${run}@example.test`);
    userIds.push(alex);
    assert.deepEqual(await phone.push.sync({ prompt: true }), { status: 'registered', token: tokens.phone });

    const tablet = installation(connection, tokens.tablet, 'ios');
    await signIn(tablet, `q01-alex-${run}@example.test`);
    await tablet.push.sync({ prompt: true });
    assert.deepEqual(
      (await devicesOf(alex)).map(({ expo_push_token, platform }) => [expo_push_token, platform]),
      [[tokens.phone, 'android'], [tokens.tablet, 'ios']],
      'each signed-in device is registered',
    );

    // Every app start registers again, refreshing the registration in place.
    const before = (await devicesOf(alex)).find((row) => row.expo_push_token === tokens.phone);
    await phone.push.sync({ prompt: true });
    const after = await devicesOf(alex);
    assert.equal(after.length, 2);
    assert.ok(
      Date.parse(after.find((row) => row.expo_push_token === tokens.phone).last_registered_at)
        > Date.parse(before.last_registered_at),
      'last_registered_at moves forward',
    );

    // Clients cannot read registrations, even their own.
    const read = await phone.client.from('push_devices').select('expo_push_token');
    assert.equal(read.error?.code, '42501');

    // Notifications turned off for the app in system settings, then back on.
    tablet.state.permission = 'denied';
    assert.equal((await tablet.push.sync({ prompt: true })).status, 'not_permitted');
    assert.deepEqual((await devicesOf(alex)).map((row) => row.expo_push_token), [tokens.phone]);
    tablet.state.permission = 'granted';
    await tablet.push.sync({ prompt: true });
    assert.equal((await devicesOf(alex)).length, 2);

    // Signing out on the tablet removes its registration with no extra call.
    await tablet.auth.signOut();
    assert.deepEqual(
      (await devicesOf(alex)).map((row) => row.expo_push_token),
      [tokens.phone],
      'Supabase sign-out removes the device registration',
    );

    // Blair signs in on Alex's phone without Alex signing out first (for
    // example, Alex signed out while offline): the phone moves to Blair.
    const sharedPhone = installation(connection, tokens.phone);
    const blair = await signUpWithProfile(sharedPhone, `q01-blair-${run}@example.test`);
    userIds.push(blair);
    await sharedPhone.push.sync({ prompt: true });
    assert.deepEqual(await devicesOf(alex), [], 'the previous account no longer receives on that phone');
    assert.deepEqual((await devicesOf(blair)).map((row) => row.expo_push_token), [tokens.phone]);

    // Blair signs out everywhere from the phone. Another device's access
    // token stays valid until it expires but can no longer register.
    const otherDevice = installation(connection, tokens.other);
    await signIn(otherDevice, `q01-blair-${run}@example.test`);
    await otherDevice.push.sync({ prompt: true });
    assert.equal((await devicesOf(blair)).length, 2);
    const { error: signOutError } = await sharedPhone.client.auth.signOut({ scope: 'global' });
    if (signOutError) throw signOutError;
    assert.deepEqual(await devicesOf(blair), [], 'signing out everywhere removes every device');
    await assert.rejects(otherDevice.push.sync({ prompt: true }), { name: 'PushDeviceError', code: '23503' });
    assert.deepEqual(await devicesOf(blair), []);
  } finally {
    for (const id of userIds) await service.auth.admin.deleteUser(id);
  }
});

test('failed server sign-out cannot leave an opted-out switch receiving the previous account’s pushes', async t => {
  const connection = localConnection();
  const key = connection.PUBLISHABLE_KEY ?? connection.ANON_KEY;
  const service = createClient(connection.API_URL, connection.SERVICE_ROLE_KEY ?? connection.SECRET_KEY, CLIENT_OPTIONS);
  const phone = installation(connection, 'ExpoPushToken[handoff]', 'android', {
    ...CLIENT_OPTIONS, global: { fetch: (url, options) =>
      String(url).includes('/logout') ? Promise.reject(new Error('offline')) : fetch(url, options) },
  });
  const other = installation(connection, 'ExpoPushToken[other-handoff]');
  const run = Date.now();
  const users = [];
  t.after(async () => {
    for (const id of users) await service.auth.admin.deleteUser(id);
  });
  const alex = await signUpWithProfile(phone, `q01-handoff-a-${run}@example.test`);
  users.push(alex);
  const blair = await signUpWithProfile(other, `q01-handoff-b-${run}@example.test`);
  users.push(blair);
  const aToken = (await phone.client.auth.getSession()).data.session.access_token;
  const optOut = await other.client.from('profiles').update({
    notify_new_events: false, notify_saved_reminders: false,
  }).eq('id', blair);
  assert.equal(optOut.error, null);
  const bToken = (await other.client.auth.getSession()).data.session.access_token;
  const { createPushInstallation } = await import('../src/services/pushInstallation.ts');
  const { randomBytes } = await import('node:crypto');
  const storage = new Map();
  let delayed;
  let failDetach = false;
  const write = async (update, accessToken) => {
    const client = createClient(connection.API_URL, key, CLIENT_OPTIONS);
    const request = client.rpc('sync_push_installation', update);
    if (accessToken) request.setHeader('Authorization', `Bearer ${accessToken}`);
    const { error } = await request;
    if (error) throw error;
  };
  const makePush = () => createPushDevices({
    updateInstallation: createPushInstallation({
      storage: { getItem: async key => storage.get(key), setItem: async (key, value) => storage.set(key, value) },
      newProof: () => randomBytes(32).toString('hex'),
      async write(update, accessToken) {
        if (failDetach) {
          failDetach = false;
          throw Error('connection lost');
        }
        if (update.p_token && delayed === null) {
          delayed = () => write(update, accessToken);
          throw Error('request delayed past its local deadline');
        }
        return write(update, accessToken);
      },
    }),
    platform: { os: 'android', async prepare() {}, async getPermission() { return 'granted'; },
      async requestPermission() { throw Error('unexpected permission prompt'); },
      async getExpoPushToken() { return 'ExpoPushToken[handoff]'; } },
  });
  const deviceRows = async () => {
    const result = await service.from('push_devices').select('profile_id').eq('expo_push_token', 'ExpoPushToken[handoff]');
    assert.equal(result.error, null);
    return result.data;
  };
  const push = makePush();
  await push.sync({ prompt: true, accessToken: aToken });
  assert.deepEqual(await deviceRows(), [{ profile_id: alex }]);

  // Supabase clears the local session after a failed logout request. Leave A's
  // real server session alive, as happens when that request never reaches Auth.
  const failingSignOut = await phone.client.auth.signOut({ scope: 'local' });
  assert.ok(failingSignOut.error);

  delayed = null;
  await assert.rejects(push.sync({ prompt: true, accessToken: aToken }), /delayed/);
  failDetach = true;
  await assert.rejects(push.sync({ prompt: false }), /connection lost/);
  assert.deepEqual(await deviceRows(), [{ profile_id: alex }]);
  // Reopen the app and switch to B, who never grants permission or asks Expo
  // for a token. The installation proof still removes A's registration.
  await makePush().sync({ prompt: false, accessToken: bToken });
  assert.deepEqual(await deviceRows(), []);
  await delayed();
  assert.deepEqual(await deviceRows(), [], 'late work authenticated as A cannot reclaim the device');

  const rejected = await other.client.rpc('sync_push_installation', {
    p_proof: 'a'.repeat(64), p_revision: 1, p_token: 'ExpoPushToken[opted-out]', p_platform: 'android',
  });
  assert.equal(rejected.error?.code, '42501');
});
