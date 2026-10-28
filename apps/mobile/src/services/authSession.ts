// Session/profile state machine behind AuthContext. Kept free of React and
// runtime imports so the routing rules can be unit-tested in Node.
import type { CreateProfileInput, Profile, ProfileRole } from '../types/profile';

/**
 * - initializing:    persisted session not restored yet; render no navigation.
 * - signed_out:      no Supabase session.
 * - loading_profile: session exists, profiles row is being read.
 * - onboarding:      session exists, profile missing or onboarding incomplete.
 * - signed_in:       session and completed profile.
 * - profile_error:   session exists but the profile could not be read. This
 *                    is never treated as a missing profile.
 */
export type AuthStatus =
  | 'initializing'
  | 'signed_out'
  | 'loading_profile'
  | 'onboarding'
  | 'signed_in'
  | 'profile_error';

export interface AuthUser {
  id: string;
  email: string | null;
  /** Name from signup metadata or the identity provider; a profile default only. */
  metadataName: string | null;
}

export interface AuthSnapshot {
  status: AuthStatus;
  user: AuthUser | null;
  profile: Profile | null;
  profileError: string | null;
}

interface SessionUser {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}

export interface SessionSource {
  onAuthStateChange(callback: (event: string, session: { user: SessionUser } | null) => void): {
    data: { subscription: { unsubscribe(): void } };
  };
}

/** Matches the A07 profile repository (`createProfileRepository`). */
export interface ProfileStore {
  load(): Promise<Profile | null>;
  create(input: CreateProfileInput): Promise<Profile>;
  completeOnboarding(interests: string[]): Promise<Profile>;
}

export interface OnboardingInput {
  role: ProfileRole;
  interests: string[];
  displayName?: string | null;
}

// Repository/getUser codes meaning the stored session no longer identifies a
// user (deleted account, revoked session). Anything else is a recoverable error.
const SESSION_GONE_CODES = new Set([
  'user_not_found',
  'session_not_found',
  'session_expired',
  'refresh_token_not_found',
  'bad_jwt',
]);

function isSessionGone(error: unknown): boolean {
  const e = error as { kind?: unknown; code?: unknown } | null;
  return e?.kind === 'unauthenticated' || (typeof e?.code === 'string' && SESSION_GONE_CODES.has(e.code));
}

function toAuthUser(user: SessionUser): AuthUser {
  const meta = user.user_metadata ?? {};
  const name = [meta.display_name, meta.full_name, meta.name].find(
    (value): value is string => typeof value === 'string' && value.trim().length > 0,
  );
  return { id: user.id, email: user.email ?? null, metadataName: name?.trim() ?? null };
}

export function defaultDisplayName(user: AuthUser, override?: string | null): string {
  const candidate = override?.trim() || user.metadataName || user.email?.split('@')[0]?.trim() || 'User';
  return candidate.slice(0, 100);
}

function statusForProfile(profile: Profile | null): AuthStatus {
  return profile?.onboardingComplete ? 'signed_in' : 'onboarding';
}

export function createAuthSession(deps: {
  auth: SessionSource;
  profiles: ProfileStore;
  /** Clears a session the server no longer accepts (emits SIGNED_OUT). */
  signOut: () => Promise<void>;
  /**
   * Runs work outside the onAuthStateChange callback. supabase-js holds a lock
   * while invoking listeners, so awaiting Supabase calls inside it deadlocks.
   */
  defer?: (task: () => void) => void;
}) {
  const defer = deps.defer ?? ((task) => setTimeout(task, 0));
  let snapshot: AuthSnapshot = { status: 'initializing', user: null, profile: null, profileError: null };
  // Incremented on every user change; stale profile loads are discarded.
  let generation = 0;
  const listeners = new Set<() => void>();

  function set(next: Partial<AuthSnapshot>) {
    snapshot = { ...snapshot, ...next };
    listeners.forEach((listener) => listener());
  }

  async function loadProfile(): Promise<void> {
    const user = snapshot.user;
    if (!user) return;
    const current = ++generation;
    set({ status: 'loading_profile', profile: null, profileError: null });
    try {
      const profile = await deps.profiles.load();
      if (current !== generation) return;
      set({ status: statusForProfile(profile), profile });
    } catch (error) {
      if (current !== generation) return;
      if (isSessionGone(error)) {
        console.warn('[auth] Stored session is no longer valid; signing out.');
        await deps.signOut();
        if (current === generation) {
          generation++;
          set({ status: 'signed_out', user: null, profile: null, profileError: null });
        }
        return;
      }
      console.warn('[auth] Profile load failed:', error);
      set({
        status: 'profile_error',
        profileError: 'We could not load your profile. Check your connection and try again.',
      });
    }
  }

  function handleSession(session: { user: SessionUser } | null) {
    if (!session) {
      generation++;
      set({ status: 'signed_out', user: null, profile: null, profileError: null });
      return;
    }
    const user = toAuthUser(session.user);
    const sameUser = snapshot.user?.id === user.id && snapshot.status !== 'signed_out';
    // Token refreshes and USER_UPDATED keep the same identity: update the user
    // fields without reloading the profile or flashing a loading state. A
    // later event for a user stuck in profile_error is a free retry.
    set({ user });
    if (!sameUser || snapshot.status === 'profile_error') void loadProfile();
  }

  return {
    getSnapshot: () => snapshot,

    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    /** Subscribes to Supabase auth events. INITIAL_SESSION restores the persisted session. */
    start(): () => void {
      const { data } = deps.auth.onAuthStateChange((_event, session) => {
        defer(() => handleSession(session));
      });
      return () => data.subscription.unsubscribe();
    },

    retryProfile: loadProfile,

    /** Applies a profile returned by a repository write (e.g. Settings, Edit Interests). */
    setProfile(profile: Profile) {
      if (!snapshot.user || profile.id !== snapshot.user.id) return;
      set({ profile, profileError: null, status: statusForProfile(profile) });
    },

    /**
     * Creates the owned profile if needed and marks onboarding complete. The
     * repository derives the profile id from the session, never from input.
     */
    async completeOnboarding(input: OnboardingInput): Promise<Profile> {
      const user = snapshot.user;
      if (!user) throw new Error('Sign in before completing onboarding.');
      if (!snapshot.profile) {
        const created = await deps.profiles.create({
          displayName: defaultDisplayName(user, input.displayName),
          role: input.role,
        });
        if (snapshot.user?.id !== user.id) return created;
        set({ profile: created });
      }
      const profile = await deps.profiles.completeOnboarding(input.interests);
      if (snapshot.user?.id === user.id) {
        set({ profile, profileError: null, status: statusForProfile(profile) });
      }
      return profile;
    },
  };
}

export type AuthSession = ReturnType<typeof createAuthSession>;
