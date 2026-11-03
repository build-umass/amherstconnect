// Supabase Email/Password and Google operations and error mapping. This module
// has no runtime imports so it can be unit-tested in Node; services/auth.ts
// binds it to the real Supabase client and the Expo auth browser.
import type { AuthRepository, GoogleSignInResult, SignUpResult } from '../types/auth';

export type { SignUpResult } from '../types/auth';

export const AUTH_CALLBACK_URL = 'amherstconnect://auth/callback';

export type AuthErrorKind =
  | 'invalid_credentials'
  | 'email_not_confirmed'
  | 'signup_rejected'
  | 'weak_password'
  | 'same_password'
  | 'invalid_email'
  | 'invalid_input'
  | 'rate_limited'
  | 'link_expired'
  | 'network'
  | 'config'
  | 'unknown';

export class AuthServiceError extends Error {
  readonly kind: AuthErrorKind;
  readonly code?: string;

  constructor(kind: AuthErrorKind, message: string, code?: string) {
    super(message);
    this.name = 'AuthServiceError';
    this.kind = kind;
    this.code = code;
  }
}

const MESSAGES: Record<AuthErrorKind, string> = {
  invalid_credentials: 'Incorrect email or password.',
  email_not_confirmed: 'Confirm your email address before logging in.',
  // Neutral wording: do not confirm whether an account exists for this email.
  signup_rejected: 'We could not create an account with this email. If you already have an account, log in instead.',
  weak_password: 'Choose a stronger password.',
  same_password: 'Choose a password that is different from your current one.',
  invalid_email: 'Enter a valid email address.',
  invalid_input: 'Enter your email and password.',
  rate_limited: 'Too many attempts. Wait a minute and try again.',
  link_expired: 'This email link is invalid or has expired. Request a new one.',
  network: 'Could not reach the server. Check your connection and try again.',
  config: 'The app is not configured for sign-in. Contact the development team.',
  unknown: 'Something went wrong. Please try again.',
};

const CODE_KINDS: Record<string, AuthErrorKind> = {
  invalid_credentials: 'invalid_credentials',
  email_not_confirmed: 'email_not_confirmed',
  user_already_exists: 'signup_rejected',
  email_exists: 'signup_rejected',
  signup_disabled: 'signup_rejected',
  email_provider_disabled: 'signup_rejected',
  email_address_not_authorized: 'signup_rejected',
  weak_password: 'weak_password',
  same_password: 'same_password',
  email_address_invalid: 'invalid_email',
  validation_failed: 'invalid_email',
  over_request_rate_limit: 'rate_limited',
  over_email_send_rate_limit: 'rate_limited',
  otp_expired: 'link_expired',
  flow_state_expired: 'link_expired',
  flow_state_not_found: 'link_expired',
  bad_code_verifier: 'link_expired',
  // The link was requested on another device, or this one already used it.
  pkce_code_verifier_not_found: 'link_expired',
  request_timeout: 'network',
};

/** Converts any thrown value or Supabase error into a user-presentable error. */
export function toAuthError(error: unknown): AuthServiceError {
  if (error instanceof AuthServiceError) return error;

  const e = (error ?? {}) as { name?: unknown; code?: unknown; status?: unknown; message?: unknown };
  const code = typeof e.code === 'string' ? e.code : undefined;
  const message = typeof e.message === 'string' ? e.message : '';

  let kind: AuthErrorKind | undefined = code ? CODE_KINDS[code] : undefined;
  if (!kind) {
    if (e.name === 'AuthRetryableFetchError' || /network request failed|failed to fetch/i.test(message)) {
      kind = 'network';
    } else if (/^Supabase is not configured|^SUPABASE_/.test(message)) {
      kind = 'config';
    } else if (e.status === 429) {
      kind = 'rate_limited';
    } else {
      kind = 'unknown';
    }
  }
  // Password rules are a hosted Auth setting, so prefer the server's wording
  // (e.g. "Password should be at least 8 characters.") over a fixed message.
  const text = kind === 'weak_password' && message ? message : MESSAGES[kind];
  return new AuthServiceError(kind, text, code);
}

type SupabaseResult<T> = PromiseLike<{ data: T; error: unknown }>;

/** The subset of `SupabaseClient['auth']` this service uses. */
export interface SupabaseAuthClient {
  signUp(credentials: {
    email: string;
    password: string;
    options?: { emailRedirectTo?: string; data?: Record<string, unknown> };
  }): SupabaseResult<{ user: unknown; session: unknown }>;
  signInWithPassword(credentials: { email: string; password: string }): SupabaseResult<unknown>;
  signInWithOAuth(credentials: {
    provider: 'google';
    options?: { redirectTo?: string; skipBrowserRedirect?: boolean };
  }): SupabaseResult<{ url: string | null }>;
  signOut(options?: { scope?: 'global' | 'local' | 'others' }): PromiseLike<{ error: unknown }>;
  resend(credentials: {
    type: 'signup';
    email: string;
    options?: { emailRedirectTo?: string };
  }): SupabaseResult<unknown>;
  resetPasswordForEmail(email: string, options?: { redirectTo?: string }): SupabaseResult<unknown>;
  updateUser(attributes: { password: string }): SupabaseResult<unknown>;
  exchangeCodeForSession(code: string): SupabaseResult<unknown>;
}

/** `expo-web-browser`'s `openAuthSessionAsync`, injected so this module stays Node-testable. */
export type OpenAuthSession = (url: string, redirectUrl: string) => Promise<{ type: string; url?: string }>;

/** `error` is the OAuth error (e.g. access_denied); `code` is Supabase's error_code. */
export type AuthCallback =
  | { kind: 'code'; code: string }
  | { kind: 'error'; error: string | null; code: string | null; description: string | null };

function parseParams(fragment: string): Map<string, string> {
  const params = new Map<string, string>();
  for (const pair of fragment.split('&')) {
    if (!pair) continue;
    const [rawKey, ...rest] = pair.split('=');
    try {
      params.set(
        decodeURIComponent(rawKey.replace(/\+/g, ' ')),
        decodeURIComponent(rest.join('=').replace(/\+/g, ' ')),
      );
    } catch {
      // Ignore malformed percent-encoding in a single pair.
    }
  }
  return params;
}

/**
 * Parses an `amherstconnect://auth/callback` deep link from a Supabase email
 * link. Returns null for any other URL so unrelated deep links are ignored.
 */
export function parseAuthCallbackUrl(url: string): AuthCallback | null {
  const hashIndex = url.indexOf('#');
  const beforeHash = hashIndex === -1 ? url : url.slice(0, hashIndex);
  const queryIndex = beforeHash.indexOf('?');
  const base = queryIndex === -1 ? beforeHash : beforeHash.slice(0, queryIndex);
  if (base.replace(/\/+$/, '') !== AUTH_CALLBACK_URL) return null;

  // Supabase puts PKCE codes in the query string and repeats errors in the
  // fragment. Merge both; the fragment wins.
  const params = parseParams(queryIndex === -1 ? '' : beforeHash.slice(queryIndex + 1));
  for (const [key, value] of parseParams(hashIndex === -1 ? '' : url.slice(hashIndex + 1))) {
    params.set(key, value);
  }

  if (params.has('error') || params.has('error_code')) {
    return {
      kind: 'error',
      error: params.get('error') ?? null,
      code: params.get('error_code') ?? null,
      description: params.get('error_description') ?? null,
    };
  }
  // The client uses the PKCE flow, so a genuine link carries a one-time code
  // that only this device can exchange. Implicit-flow tokens in the URL are
  // refused: anyone could craft such a link to sign the user into another
  // account.
  const code = params.get('code');
  if (code) return { kind: 'code', code };
  return { kind: 'error', error: null, code: null, description: 'Missing authorization code in callback.' };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function createAuthService(
  getAuth: () => SupabaseAuthClient,
  options: { openAuthSession?: OpenAuthSession } = {},
): AuthRepository {
  // While Google sign-in waits for its redirect it completes the callback
  // itself. Android also delivers that redirect to the app's URL listener;
  // exchanging the single-use code twice would fail the second time and
  // report a bogus expired link.
  let awaitingOAuthRedirect = false;

  // getSupabase() throws when configuration is missing; surface that as a
  // typed configuration error instead of an unhandled exception.
  function auth(): SupabaseAuthClient {
    try {
      return getAuth();
    } catch (error) {
      // The user-facing message is generic; keep the specific cause in logs.
      console.error('[auth] Supabase client unavailable:', error);
      throw toAuthError(error);
    }
  }

  async function run<T>(operation: () => SupabaseResult<T>): Promise<T> {
    let result: { data: T; error: unknown };
    try {
      result = await operation();
    } catch (error) {
      throw toAuthError(error);
    }
    if (result.error) throw toAuthError(result.error);
    return result.data;
  }

  function requireCredentials(email: string, password: string) {
    if (!normalizeEmail(email) || !password) {
      throw new AuthServiceError('invalid_input', MESSAGES.invalid_input);
    }
  }

  /** `fallbackCode` classifies an error callback that carries no code at all. */
  async function completeCallback(callback: AuthCallback, fallbackCode: string | null): Promise<void> {
    if (callback.kind === 'error') {
      throw toAuthError({ code: callback.code ?? callback.error ?? fallbackCode, message: callback.description ?? '' });
    }
    // Emits SIGNED_IN, or PASSWORD_RECOVERY for a reset link (see authSession).
    await run(() => auth().exchangeCodeForSession(callback.code));
  }

  return {
    async signUp(email: string, password: string, displayName?: string): Promise<SignUpResult> {
      requireCredentials(email, password);
      const normalized = normalizeEmail(email);
      const name = displayName?.trim();
      const data = await run(() =>
        auth().signUp({
          email: normalized,
          password,
          options: {
            emailRedirectTo: AUTH_CALLBACK_URL,
            // Only a default for the profile display name; the profiles row is
            // the source of truth once onboarding creates it.
            ...(name ? { data: { display_name: name } } : {}),
          },
        }),
      );
      // With email confirmation enabled Supabase returns a user but no session.
      // It also returns a session-less placeholder for an already-registered
      // email, so both cases share the same neutral "check your email" state.
      return data.session ? { status: 'signed_in' } : { status: 'confirmation_required', email: normalized };
    },

    async signIn(email: string, password: string): Promise<void> {
      requireCredentials(email, password);
      await run(() => auth().signInWithPassword({ email: normalizeEmail(email), password }));
    },

    /**
     * Supabase-hosted Google OAuth in an in-app browser session. Only identity
     * scopes are requested; the session client drops Google's tokens.
     */
    async signInWithGoogle(): Promise<GoogleSignInResult> {
      const { openAuthSession } = options;
      if (!openAuthSession) throw new AuthServiceError('config', MESSAGES.config);
      const { url } = await run(() =>
        auth().signInWithOAuth({
          provider: 'google',
          options: { redirectTo: AUTH_CALLBACK_URL, skipBrowserRedirect: true },
        }),
      );
      if (!url) throw new AuthServiceError('unknown', MESSAGES.unknown);

      let result: { type: string; url?: string };
      awaitingOAuthRedirect = true;
      try {
        result = await openAuthSession(url, AUTH_CALLBACK_URL);
      } catch (error) {
        throw toAuthError(error);
      } finally {
        awaitingOAuthRedirect = false;
      }

      const callback = result.type === 'success' && result.url ? parseAuthCallbackUrl(result.url) : null;
      // Declining Google's consent screen returns access_denied without an
      // error_code; refusals by Supabase (e.g. signup_disabled) carry one.
      if (!callback || (callback.kind === 'error' && callback.error === 'access_denied' && !callback.code)) {
        return { status: 'cancelled' };
      }
      await completeCallback(callback, null);
      return { status: 'signed_in' };
    },

    async resendConfirmation(email: string): Promise<void> {
      const normalized = normalizeEmail(email);
      if (!normalized) throw new AuthServiceError('invalid_email', MESSAGES.invalid_email);
      await run(() =>
        auth().resend({ type: 'signup', email: normalized, options: { emailRedirectTo: AUTH_CALLBACK_URL } }),
      );
    },

    async requestPasswordReset(email: string): Promise<void> {
      const normalized = normalizeEmail(email);
      if (!normalized) throw new AuthServiceError('invalid_email', MESSAGES.invalid_email);
      await run(() => auth().resetPasswordForEmail(normalized, { redirectTo: AUTH_CALLBACK_URL }));
    },

    async updatePassword(password: string): Promise<void> {
      if (!password) throw new AuthServiceError('invalid_input', 'Enter a new password.');
      await run(() => auth().updateUser({ password }));
    },

    /**
     * Ends the session on this device. supabase-js clears the stored session
     * and emits SIGNED_OUT even when the revoke request fails, so a network
     * error never traps the user in the authenticated UI.
     */
    async signOut(): Promise<void> {
      let client: SupabaseAuthClient;
      try {
        client = getAuth();
      } catch {
        return;
      }
      try {
        const { error } = await client.signOut({ scope: 'local' });
        if (error) console.warn('[auth] Server sign-out failed; local session cleared:', error);
      } catch (error) {
        console.warn('[auth] Sign-out failed:', error);
      }
    },

    /**
     * Establishes a session from an email-confirmation or password-reset deep
     * link. Returns false when the URL is not an auth callback.
     */
    async handleCallbackUrl(url: string): Promise<boolean> {
      const callback = parseAuthCallbackUrl(url);
      if (!callback) return false;
      if (awaitingOAuthRedirect) return true;
      await completeCallback(callback, 'otp_expired');
      return true;
    },
  };
}
