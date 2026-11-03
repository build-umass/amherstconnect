import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTH_CALLBACK_URL,
  AuthServiceError,
  createAuthService,
  parseAuthCallbackUrl,
  toAuthError,
} from '../src/services/authService.ts';

const GOOGLE_URL = 'https://example.supabase.co/auth/v1/authorize?provider=google';

function fakeAuth(overrides = {}, { browserResult = { type: 'cancel' } } = {}) {
  const calls = [];
  const ok = (data = {}) => async (...args) => {
    calls.push(args);
    return { data, error: null };
  };
  const auth = {
    signUp: ok({ user: { id: 'u1' }, session: null }),
    signInWithPassword: ok(),
    signInWithOAuth: ok({ provider: 'google', url: GOOGLE_URL }),
    signOut: async (...args) => { calls.push(['signOut', ...args]); return { error: null }; },
    resend: ok(),
    resetPasswordForEmail: ok(),
    updateUser: ok(),
    exchangeCodeForSession: async (code) => { calls.push(['exchange', code]); return { data: {}, error: null }; },
    ...overrides,
  };
  const browser = [];
  const openAuthSession = async (...args) => {
    browser.push(args);
    return typeof browserResult === 'function' ? browserResult(...args) : browserResult;
  };
  return { auth, calls, browser, service: createAuthService(() => auth, { openAuthSession }) };
}

const apiError = (code, extra = {}) => async () => ({ data: null, error: { name: 'AuthApiError', code, message: code, ...extra } });

test('signUp normalizes email, sets the app redirect, and stores the name as metadata', async () => {
  const { service, calls } = fakeAuth();
  await service.signUp('  Alice@Example.COM ', 'secret1', ' Alice ');
  assert.deepEqual(calls[0][0], {
    email: 'alice@example.com',
    password: 'secret1',
    options: { emailRedirectTo: AUTH_CALLBACK_URL, data: { display_name: 'Alice' } },
  });
});

test('signUp without a session reports confirmation_required', async () => {
  const { service } = fakeAuth();
  assert.deepEqual(await service.signUp('a@b.co', 'secret1'), {
    status: 'confirmation_required',
    email: 'a@b.co',
  });
});

test('signUp with a session reports signed_in', async () => {
  const { service } = fakeAuth({
    signUp: async () => ({ data: { user: { id: 'u1' }, session: { access_token: 't' } }, error: null }),
  });
  assert.deepEqual(await service.signUp('a@b.co', 'secret1'), { status: 'signed_in' });
});

test('empty credentials are rejected before calling Supabase', async () => {
  const { service, calls } = fakeAuth();
  await assert.rejects(service.signIn(' ', 'x'), { kind: 'invalid_input' });
  await assert.rejects(service.signUp('a@b.co', ''), { kind: 'invalid_input' });
  assert.equal(calls.length, 0);
});

test('Supabase error codes map to distinct user-facing kinds', async () => {
  const cases = [
    ['invalid_credentials', 'invalid_credentials'],
    ['email_not_confirmed', 'email_not_confirmed'],
    ['user_already_exists', 'signup_rejected'],
    ['weak_password', 'weak_password'],
    ['email_address_invalid', 'invalid_email'],
    ['over_email_send_rate_limit', 'rate_limited'],
  ];
  for (const [code, kind] of cases) {
    const { service } = fakeAuth({ signInWithPassword: apiError(code) });
    await assert.rejects(service.signIn('a@b.co', 'secret1'), (error) => {
      assert.ok(error instanceof AuthServiceError);
      assert.equal(error.kind, kind);
      assert.equal(error.code, code);
      return true;
    });
  }
});

test('weak password errors use the server wording so hosted rules stay accurate', () => {
  const message = 'Password should be at least 8 characters.';
  assert.equal(toAuthError({ code: 'weak_password', message }).message, message);
  assert.equal(toAuthError({ code: 'weak_password' }).message, 'Choose a stronger password.');
});

test('invalid credentials do not reveal whether the account exists', () => {
  assert.equal(toAuthError({ code: 'invalid_credentials' }).message, 'Incorrect email or password.');
  assert.doesNotMatch(toAuthError({ code: 'user_already_exists' }).message, /already registered/i);
});

test('network and configuration failures are classified separately', async () => {
  assert.equal(toAuthError({ name: 'AuthRetryableFetchError', status: 0, message: '{}' }).kind, 'network');
  assert.equal(toAuthError(new TypeError('Network request failed')).kind, 'network');

  const service = createAuthService(() => {
    throw new Error('Supabase is not configured. Missing: SUPABASE_URL.');
  });
  await assert.rejects(service.signIn('a@b.co', 'secret1'), { kind: 'config' });
});

test('signOut is local-scoped and never throws', async () => {
  const { service, calls } = fakeAuth({
    signOut: async (options) => { calls.push(['signOut', options]); return { error: { message: 'offline' } }; },
  });
  const warn = console.warn;
  console.warn = () => {};
  try {
    await service.signOut();
  } finally {
    console.warn = warn;
  }
  assert.deepEqual(calls[0], ['signOut', { scope: 'local' }]);

  const unconfigured = createAuthService(() => { throw new Error('Supabase is not configured.'); });
  await unconfigured.signOut();
});

test('resendConfirmation targets signup emails with the app redirect', async () => {
  const { service, calls } = fakeAuth();
  await service.resendConfirmation('A@B.co');
  assert.deepEqual(calls[0][0], { type: 'signup', email: 'a@b.co', options: { emailRedirectTo: AUTH_CALLBACK_URL } });
});

test('parseAuthCallbackUrl ignores unrelated URLs', () => {
  assert.equal(parseAuthCallbackUrl('amherstconnect://events/1'), null);
  assert.equal(parseAuthCallbackUrl('https://evil.example/auth/callback#access_token=a&refresh_token=b'), null);
});

test('parseAuthCallbackUrl reads PKCE codes and errors', () => {
  assert.deepEqual(parseAuthCallbackUrl(`${AUTH_CALLBACK_URL}?code=x%2Eyz`), { kind: 'code', code: 'x.yz' });
  assert.deepEqual(
    parseAuthCallbackUrl(`${AUTH_CALLBACK_URL}#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid`),
    { kind: 'error', error: 'access_denied', code: 'otp_expired', description: 'Email link is invalid' },
  );
});

test('parseAuthCallbackUrl does not accept session tokens from a link', () => {
  const parsed = parseAuthCallbackUrl(`${AUTH_CALLBACK_URL}#access_token=a&refresh_token=r&type=signup`);
  assert.equal(parsed.kind, 'error');
});

test('handleCallbackUrl exchanges the link code for a session', async () => {
  const { service, calls } = fakeAuth();
  assert.equal(await service.handleCallbackUrl('amherstconnect://other'), false);
  assert.equal(await service.handleCallbackUrl(`${AUTH_CALLBACK_URL}?code=abc`), true);
  assert.deepEqual(calls, [['exchange', 'abc']]);
});

test('handleCallbackUrl reports expired links and refuses token links', async () => {
  const { service, calls } = fakeAuth();
  await assert.rejects(
    service.handleCallbackUrl(`${AUTH_CALLBACK_URL}#error_code=otp_expired&error_description=expired`),
    { kind: 'link_expired' },
  );
  // A crafted link must not sign the user into whatever account the tokens belong to.
  await assert.rejects(
    service.handleCallbackUrl(`${AUTH_CALLBACK_URL}#access_token=a&refresh_token=r&type=recovery`),
    { kind: 'link_expired' },
  );
  assert.equal(calls.length, 0);
});

test('a reset link whose code was already used or requested elsewhere is reported as expired', async () => {
  const { service } = fakeAuth({
    exchangeCodeForSession: async () => ({
      data: { session: null },
      error: { name: 'AuthPKCECodeVerifierMissingError', code: 'pkce_code_verifier_not_found', status: 400 },
    }),
  });
  await assert.rejects(service.handleCallbackUrl(`${AUTH_CALLBACK_URL}?code=used`), { kind: 'link_expired' });
});

test('requestPasswordReset sends a link that opens the app', async () => {
  const { service, calls } = fakeAuth();
  await service.requestPasswordReset(' Alice@Example.com ');
  assert.deepEqual(calls[0], ['alice@example.com', { redirectTo: AUTH_CALLBACK_URL }]);
  await assert.rejects(service.requestPasswordReset('  '), { kind: 'invalid_email' });
  assert.equal(calls.length, 1);
});

test('updatePassword saves the new password and explains rejected ones', async () => {
  const { service, calls } = fakeAuth();
  await service.updatePassword('n3w-secret');
  assert.deepEqual(calls[0], [{ password: 'n3w-secret' }]);
  await assert.rejects(service.updatePassword(''), { kind: 'invalid_input' });

  const reused = fakeAuth({ updateUser: apiError('same_password') });
  await assert.rejects(reused.service.updatePassword('old-secret'), { kind: 'same_password' });
  const weak = fakeAuth({ updateUser: apiError('weak_password', { message: 'Password should be at least 8 characters.' }) });
  await assert.rejects(weak.service.updatePassword('short'), { message: 'Password should be at least 8 characters.' });
});

test('signInWithGoogle opens Supabase OAuth and exchanges the returned code', async () => {
  const { service, calls, browser } = fakeAuth({}, { browserResult: { type: 'success', url: `${AUTH_CALLBACK_URL}?code=g1` } });
  assert.deepEqual(await service.signInWithGoogle(), { status: 'signed_in' });
  assert.deepEqual(calls[0], [{ provider: 'google', options: { redirectTo: AUTH_CALLBACK_URL, skipBrowserRedirect: true } }]);
  assert.deepEqual(browser, [[GOOGLE_URL, AUTH_CALLBACK_URL]]);
  assert.deepEqual(calls.at(-1), ['exchange', 'g1']);
});

test('closing the browser or declining consent cancels Google sign-in quietly', async () => {
  for (const browserResult of [
    { type: 'cancel' },
    { type: 'dismiss' },
    { type: 'success', url: `${AUTH_CALLBACK_URL}?error=access_denied&error_description=The+user+denied#error=access_denied` },
  ]) {
    const { service, calls } = fakeAuth({}, { browserResult });
    assert.deepEqual(await service.signInWithGoogle(), { status: 'cancelled' });
    assert.ok(calls.every((call) => call[0] !== 'exchange'));
  }
});

test('Google sign-in refused by Supabase is reported, not treated as a cancel', async () => {
  const { service } = fakeAuth({}, {
    browserResult: { type: 'success', url: `${AUTH_CALLBACK_URL}#error=access_denied&error_code=signup_disabled&error_description=Signups+not+allowed` },
  });
  await assert.rejects(service.signInWithGoogle(), { kind: 'signup_rejected' });
});

test('Google sign-in without the auth browser is a configuration error', async () => {
  const service = createAuthService(() => fakeAuth().auth);
  await assert.rejects(service.signInWithGoogle(), { kind: 'config' });
});

test('the Google redirect is exchanged once when Android also delivers it to the URL listener', async () => {
  const redirect = `${AUTH_CALLBACK_URL}?code=g2`;
  let listenerResult;
  const { service, calls } = fakeAuth({}, {
    browserResult: async () => {
      // Android: the app's Linking listener receives the redirect too.
      listenerResult = await service.handleCallbackUrl(redirect);
      return { type: 'success', url: redirect };
    },
  });
  assert.deepEqual(await service.signInWithGoogle(), { status: 'signed_in' });
  assert.equal(listenerResult, true);
  assert.deepEqual(calls.filter((call) => call[0] === 'exchange'), [['exchange', 'g2']]);

  // Once the browser has closed, a callback (e.g. a cold start) is handled normally.
  await service.handleCallbackUrl(`${AUTH_CALLBACK_URL}?code=g3`);
  assert.deepEqual(calls.at(-1), ['exchange', 'g3']);
});
