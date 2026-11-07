// Explicit local integration test for A07. Requires a running local Supabase
// stack with email confirmation off (the local default); run
// `npm run test:profiles:local` from the repository root.
//
// A user signs up, completes onboarding and changes Settings, then restarts
// the app: a new client restores the persisted session and the session
// machine routes straight to the saved profile.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';
import { localConnection } from '../../../scripts/importer/local-connection.mjs';

// The repository uses TypeScript-only syntax; compile it (and the interest
// list it imports) in memory, as tests/profileRepository.test.mjs does.
function compile(path) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  return ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}
const dataUrl = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const { createProfileRepository } = await import(dataUrl(
  compile('../src/services/profileRepository.ts')
    .replace("'../constants/interests'", `'${dataUrl(compile('../src/constants/interests.ts'))}'`),
));
const { createAuthService } = await import('../src/services/authService.ts');
const { createAuthSession } = await import('../src/services/authSession.ts');
const { SUPABASE_AUTH_OPTIONS } = await import('../src/services/supabaseConfig.ts');
const { withoutProviderTokens } = await import('../src/services/supabaseClientFactory.ts');

/** One app launch; `stored` plays the part of AsyncStorage across launches. */
function launch(connection, stored = new Map()) {
  const storage = withoutProviderTokens({
    getItem: async (key) => stored.get(key) ?? null,
    setItem: async (key, value) => { stored.set(key, value); },
    removeItem: async (key) => { stored.delete(key); },
  });
  const client = createClient(connection.API_URL, connection.PUBLISHABLE_KEY ?? connection.ANON_KEY, {
    auth: { ...SUPABASE_AUTH_OPTIONS, storage },
  });
  const auth = createAuthService(() => client.auth);
  const profiles = createProfileRepository(client);
  const session = createAuthSession({ auth: client.auth, profiles, signOut: () => auth.signOut() });
  const stop = session.start();
  return {
    client, auth, profiles, session, stored,
    close() {
      stop();
      client.auth.stopAutoRefresh();
    },
  };
}

async function waitFor(session, status) {
  for (let i = 0; i < 100; i++) {
    if (session.getSnapshot().status === status) return session.getSnapshot();
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.fail(`expected ${status}, still ${session.getSnapshot().status}`);
}

test('a Supabase user keeps their profile, interests and preferences after restarting', async () => {
  const connection = localConnection();
  const email = `a07-${Date.now()}@example.test`;
  let app = launch(connection);
  await waitFor(app.session, 'signed_out');

  // Onboarding: role and name entered before the account exists.
  app.session.setOnboardingRole('alumni');
  app.session.setOnboardingSignUp('Alex Alumni', email);
  assert.deepEqual(await app.auth.signUp(email, 'a07-password', 'Alex Alumni'), { status: 'signed_in' });
  const { onboardingData } = await waitFor(app.session, 'onboarding');
  await app.session.completeOnboarding({
    role: onboardingData.role,
    displayName: onboardingData.displayName,
    interests: ['Music', 'Outdoors'],
  });
  assert.equal(app.session.getSnapshot().status, 'signed_in');

  // Settings and Edit Interests.
  app.session.setProfile(await app.profiles.updateNotificationPreferences({ savedReminders: false }));
  app.session.setProfile(await app.profiles.updateInterests(['Music', 'Outdoors', 'Tech']));
  app.close();

  app = launch(connection, app.stored);
  const { user, profile } = await waitFor(app.session, 'signed_in');
  assert.equal(user.email, email);
  assert.equal(profile.id, user.id);
  assert.equal(profile.displayName, 'Alex Alumni');
  assert.equal(profile.role, 'alumni');
  assert.deepEqual(profile.interests, ['Music', 'Outdoors', 'Tech']);
  assert.deepEqual(profile.notificationPrefs, { newEvents: true, savedReminders: false });
  assert.equal(profile.onboardingComplete, true);

  // Writing straight to the table, the database refuses unknown interests.
  const rejected = await app.client.from('profiles').update({ interests: ['Basket Weaving'] }).eq('id', user.id);
  assert.equal(rejected.error?.code, '23514');

  // Another account can neither read nor change this profile.
  const other = launch(connection);
  await waitFor(other.session, 'signed_out');
  await other.auth.signUp(`a07-other-${Date.now()}@example.test`, 'a07-password');
  await waitFor(other.session, 'onboarding');
  const read = await other.client.from('profiles').select('id').eq('id', user.id);
  assert.deepEqual(read.data, []);
  const write = await other.client.from('profiles').update({ interests: ['Tech'] }).eq('id', user.id).select('id');
  assert.deepEqual(write.data, []);
  assert.deepEqual((await app.profiles.load()).interests, ['Music', 'Outdoors', 'Tech']);

  await other.auth.signOut();
  await app.auth.signOut();
  await waitFor(app.session, 'signed_out');
  other.close();
  app.close();
});
