import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTH_CALLBACK_URL,
  AuthServiceError,
  createAuthService,
  parseAuthCallbackUrl,
  toAuthError,
} from '../src/services/authService.ts';

function fakeAuth(overrides = {}) {
  const calls = [];
  const ok = (data = {}) => async (...args) => {
    calls.push(args);
    return { data, error: null };
  };
  const auth = {
    signUp: ok({ user: { id: 'u1' }, session: null }),
    signInWithPassword: ok(),
    signOut: async (...args) => { calls.push(['signOut', ...args]); return { error: null }; },
    resend: ok(),
    setSession: ok(),
    exchangeCodeForSession: ok(),
    ...overrides,
  };
  return { auth, calls, service: createAuthService(() => auth) };
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

test('parseAuthCallbackUrl reads implicit-flow tokens, PKCE codes, and errors', () => {
  assert.deepEqual(
    parseAuthCallbackUrl(`${AUTH_CALLBACK_URL}#access_token=a%2Eb&refresh_token=r&type=signup`),
    { kind: 'tokens', accessToken: 'a.b', refreshToken: 'r', type: 'signup' },
  );
  assert.deepEqual(parseAuthCallbackUrl(`${AUTH_CALLBACK_URL}?code=xyz`), { kind: 'code', code: 'xyz' });
  assert.deepEqual(
    parseAuthCallbackUrl(`${AUTH_CALLBACK_URL}#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid`),
    { kind: 'error', code: 'otp_expired', description: 'Email link is invalid' },
  );
});

test('handleCallbackUrl establishes the session from the link', async () => {
  const { service, auth, calls } = fakeAuth();
  assert.equal(await service.handleCallbackUrl('amherstconnect://other'), false);
  assert.equal(await service.handleCallbackUrl(`${AUTH_CALLBACK_URL}#access_token=a&refresh_token=r&type=signup`), true);
  assert.deepEqual(calls.at(-1), [{ access_token: 'a', refresh_token: 'r' }]);
  assert.ok(auth);
});

test('handleCallbackUrl reports expired links and refuses recovery sign-ins', async () => {
  const { service, calls } = fakeAuth();
  await assert.rejects(
    service.handleCallbackUrl(`${AUTH_CALLBACK_URL}#error_code=otp_expired&error_description=expired`),
    { kind: 'link_expired' },
  );
  await assert.rejects(service.handleCallbackUrl(`${AUTH_CALLBACK_URL}#access_token=a&refresh_token=r&type=recovery`));
  assert.equal(calls.length, 0);
});
