// Supabase Email/Password operations and error mapping. This module has no
// runtime imports so it can be unit-tested in Node; services/auth.ts binds it
// to the real Supabase client.

export const AUTH_CALLBACK_URL = 'amherstconnect://auth/callback';

export type AuthErrorKind =
  | 'invalid_credentials'
  | 'email_not_confirmed'
  | 'signup_rejected'
  | 'weak_password'
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
  weak_password: 'Choose a stronger password (at least 6 characters).',
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
  email_address_invalid: 'invalid_email',
  validation_failed: 'invalid_email',
  over_request_rate_limit: 'rate_limited',
  over_email_send_rate_limit: 'rate_limited',
  otp_expired: 'link_expired',
  flow_state_expired: 'link_expired',
  flow_state_not_found: 'link_expired',
  bad_code_verifier: 'link_expired',
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
  return new AuthServiceError(kind, MESSAGES[kind], code);
}

type SupabaseResult<T> = PromiseLike<{ data: T; error: unknown }>;
type SessionTokens = { access_token: string; refresh_token: string };

/** The subset of `SupabaseClient['auth']` this service uses. */
export interface EmailAuthClient {
  signUp(credentials: {
    email: string;
    password: string;
    options?: { emailRedirectTo?: string; data?: Record<string, unknown> };
  }): SupabaseResult<{ user: unknown; session: unknown }>;
  signInWithPassword(credentials: { email: string; password: string }): SupabaseResult<unknown>;
  signOut(options?: { scope?: 'global' | 'local' | 'others' }): PromiseLike<{ error: unknown }>;
  resend(credentials: {
    type: 'signup';
    email: string;
    options?: { emailRedirectTo?: string };
  }): SupabaseResult<unknown>;
  resetPasswordForEmail(email: string, options?: { redirectTo?: string }): SupabaseResult<unknown>;
  setSession(tokens: SessionTokens): SupabaseResult<unknown>;
  exchangeCodeForSession(code: string): SupabaseResult<unknown>;
}

export type SignUpResult = { status: 'signed_in' } | { status: 'confirmation_required'; email: string };

export type AuthCallback =
  | { kind: 'tokens'; accessToken: string; refreshToken: string; type: string | null }
  | { kind: 'code'; code: string }
  | { kind: 'error'; code: string | null; description: string | null };

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

  // Supabase puts implicit-flow tokens and most errors in the fragment, and
  // PKCE codes in the query string. Merge both; the fragment wins.
  const params = parseParams(queryIndex === -1 ? '' : beforeHash.slice(queryIndex + 1));
  for (const [key, value] of parseParams(hashIndex === -1 ? '' : url.slice(hashIndex + 1))) {
    params.set(key, value);
  }

  if (params.has('error') || params.has('error_code')) {
    return {
      kind: 'error',
      code: params.get('error_code') ?? params.get('error') ?? null,
      description: params.get('error_description') ?? null,
    };
  }
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (accessToken && refreshToken) {
    return { kind: 'tokens', accessToken, refreshToken, type: params.get('type') ?? null };
  }
  const code = params.get('code');
  if (code) return { kind: 'code', code };
  return { kind: 'error', code: null, description: 'Missing session in callback.' };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function createAuthService(getAuth: () => EmailAuthClient) {
  // getSupabase() throws when configuration is missing; surface that as a
  // typed configuration error instead of an unhandled exception.
  function auth(): EmailAuthClient {
    try {
      return getAuth();
    } catch (error) {
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
      await run(() => auth().resetPasswordForEmail(normalized));
    },

    /**
     * Ends the session on this device. supabase-js clears the stored session
     * and emits SIGNED_OUT even when the revoke request fails, so a network
     * error never traps the user in the authenticated UI.
     */
    async signOut(): Promise<void> {
      let client: EmailAuthClient;
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
     * Establishes a session from an email-confirmation deep link. Returns
     * false when the URL is not an auth callback.
     */
    async handleCallbackUrl(url: string): Promise<boolean> {
      const callback = parseAuthCallbackUrl(url);
      if (!callback) return false;
      if (callback.kind === 'error') {
        throw toAuthError({ code: callback.code ?? 'otp_expired', message: callback.description ?? '' });
      }
      if (callback.kind === 'tokens') {
        // Password-recovery links need a dedicated update-password screen;
        // do not silently turn them into a normal sign-in.
        if (callback.type === 'recovery') {
          throw new AuthServiceError(
            'unknown',
            'Password reset links cannot be completed in the app yet.',
          );
        }
        await run(() =>
          auth().setSession({ access_token: callback.accessToken, refresh_token: callback.refreshToken }),
        );
      } else {
        await run(() => auth().exchangeCodeForSession(callback.code));
      }
      return true;
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
