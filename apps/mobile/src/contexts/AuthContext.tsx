import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Alert, Linking } from 'react-native';
import { getSupabase } from '../services/supabase';
import { authService, getProfileRepository } from '../services/auth';
import { toAuthError } from '../services/authService';
import { createAuthSession, type AuthSnapshot, type SessionSource } from '../services/authSession';
import type { Profile } from '../types/profile';
import type { OnboardingData, UserRole } from '../types/auth';

interface AuthContextValue extends AuthSnapshot {
  /** Choices made before the profile row exists (kept in memory only). */
  onboardingData: OnboardingData;
  setOnboardingRole: (role: UserRole) => void;
  setOnboardingDisplayName: (name: string) => void;
  /** Creates the owned profile if needed, saves interests, and enters the app. */
  completeOnboarding: (interests: string[]) => Promise<void>;
  /** Apply a profile returned by a repository update so screens stay in sync. */
  setProfile: (profile: Profile) => void;
  retryProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Without Supabase configuration the app still starts, signed out; sign-in
// attempts then show the configuration error from the auth service.
const UNCONFIGURED_SOURCE: SessionSource = {
  onAuthStateChange(callback) {
    callback('INITIAL_SESSION', null);
    return { data: { subscription: { unsubscribe() {} } } };
  },
};

function createSession() {
  let auth: SessionSource;
  try {
    auth = getSupabase().auth;
  } catch (error) {
    console.error('[AuthContext] Supabase is not configured:', error);
    auth = UNCONFIGURED_SOURCE;
  }
  return createAuthSession({
    auth,
    profiles: {
      load: () => getProfileRepository().load(),
      create: (input) => getProfileRepository().create(input),
      completeOnboarding: (interests) => getProfileRepository().completeOnboarding(interests),
    },
    signOut: () => authService.signOut(),
  });
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session] = useState(createSession);
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const [onboardingData, setOnboardingData] = useState<OnboardingData>({});

  useEffect(() => session.start(), [session]);

  // Email-confirmation links open amherstconnect://auth/callback, both on a
  // cold start (initial URL) and while the app is running.
  useEffect(() => {
    const handleUrl = (url: string | null | undefined) => {
      if (!url) return;
      authService.handleCallbackUrl(url).catch((error) => {
        Alert.alert('Email link failed', toAuthError(error).message);
      });
    };
    Linking.getInitialURL().then(handleUrl).catch(() => {});
    const subscription = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => subscription.remove();
  }, []);

  // The draft is chosen while signed out (role before signup), so it is only
  // discarded once onboarding finishes or the user signs out.
  useEffect(() => {
    if (snapshot.status === 'signed_in') setOnboardingData({});
  }, [snapshot.status]);

  const setOnboardingRole = useCallback((role: UserRole) => {
    setOnboardingData((prev) => ({ ...prev, role }));
  }, []);

  const setOnboardingDisplayName = useCallback((displayName: string) => {
    setOnboardingData((prev) => ({ ...prev, displayName }));
  }, []);

  const completeOnboarding = useCallback(
    async (interests: string[]) => {
      const role = session.getSnapshot().profile?.role ?? onboardingData.role;
      if (!role) throw new Error('Choose a role before finishing onboarding.');
      await session.completeOnboarding({ role, interests, displayName: onboardingData.displayName });
    },
    [session, onboardingData],
  );

  const signOut = useCallback(async () => {
    setOnboardingData({});
    await authService.signOut();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...snapshot,
      onboardingData,
      setOnboardingRole,
      setOnboardingDisplayName,
      completeOnboarding,
      setProfile: session.setProfile,
      retryProfile: session.retryProfile,
      signOut,
    }),
    [snapshot, onboardingData, setOnboardingRole, setOnboardingDisplayName, completeOnboarding, session, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
