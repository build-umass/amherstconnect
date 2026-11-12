import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Alert, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getNetworkStateAsync } from 'expo-network';
import { loadProfileForHome } from '../services/homeFeedCache';
import { getSupabase } from '../services/supabase';
import { authService, toAuthError, type GoogleSignInResult } from '../services/auth';
import { getProfileRepository } from '../services/profile';
import { createAuthSession, type AuthSnapshot, type SessionSource } from '../services/authSession';
import type { Profile } from '../types/profile';
import type { UserRole } from '../types/auth';

interface AuthContextValue extends AuthSnapshot {
  setOnboardingRole: (role: UserRole) => void;
  /** Records the signup name and binds the draft to the signup email. */
  setOnboardingSignUp: (displayName: string, email: string) => void;
  /** Creates the owned profile if needed, saves interests, and enters the app. */
  completeOnboarding: (interests: string[]) => Promise<void>;
  /**
   * From the signup screen (`keepOnboardingDraft`), the role chosen in step 1
   * carries over to the Google account that signs in.
   */
  signInWithGoogle: (options?: { keepOnboardingDraft?: boolean }) => Promise<GoogleSignInResult>;
  /** Saves the new password after a reset link and leaves password recovery. */
  updatePassword: (password: string) => Promise<void>;
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
      load: (accountId) => loadProfileForHome({
        accountId,
        storage: AsyncStorage,
        load: () => getProfileRepository().load(),
        offline: async () => {
          const state = await getNetworkStateAsync();
          return state.isConnected === false || state.isInternetReachable === false;
        },
      }),
      create: (input) => getProfileRepository().create(input),
      completeOnboarding: (interests) => getProfileRepository().completeOnboarding(interests),
    },
    signOut: () => authService.signOut(),
  });
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session] = useState(createSession);
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot);

  useEffect(() => session.start(), [session]);

  // Confirmation and password-reset links open amherstconnect://auth/callback,
  // both on a cold start (initial URL) and while the app is running.
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

  const completeOnboarding = useCallback(
    async (interests: string[]) => {
      const { profile, onboardingData } = session.getSnapshot();
      const role = profile?.role ?? onboardingData.role;
      if (!role) throw new Error('Choose a role before finishing onboarding.');
      await session.completeOnboarding({ role, interests, displayName: onboardingData.displayName });
    },
    [session],
  );

  const signInWithGoogle = useCallback(
    async ({ keepOnboardingDraft = false } = {}) => {
      if (keepOnboardingDraft) session.claimOnboardingDraft();
      try {
        const result = await authService.signInWithGoogle();
        if (result.status === 'cancelled') session.releaseOnboardingDraft();
        return result;
      } catch (error) {
        session.releaseOnboardingDraft();
        throw error;
      }
    },
    [session],
  );

  const updatePassword = useCallback(
    async (password: string) => {
      await authService.updatePassword(password);
      session.endPasswordRecovery();
    },
    [session],
  );

  // The draft and recovery state are cleared by the SIGNED_OUT event, so a
  // sign-out from anywhere (including an expired session) resets them.
  const value = useMemo<AuthContextValue>(
    () => ({
      ...snapshot,
      setOnboardingRole: session.setOnboardingRole,
      setOnboardingSignUp: session.setOnboardingSignUp,
      completeOnboarding,
      signInWithGoogle,
      updatePassword,
      setProfile: session.setProfile,
      retryProfile: session.retryProfile,
      signOut: authService.signOut,
    }),
    [snapshot, session, completeOnboarding, signInWithGoogle, updatePassword],
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
