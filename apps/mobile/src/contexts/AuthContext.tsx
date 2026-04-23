import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { auth } from '../services/firebase';
import { getUserDocument } from '../services/auth';
import type { AppUser, OnboardingData, UserRole } from '../types/auth';

interface AuthContextValue {
  firebaseUser: FirebaseUser | null;
  appUser: AppUser | null;
  loading: boolean;
  initialized: boolean;
  onboardingData: OnboardingData | null;
  setOnboardingRole: (role: UserRole) => void;
  setOnboardingInterests: (interests: string[]) => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const [onboardingData, setOnboardingData] = useState<OnboardingData | null>(null);

  const fetchAppUser = useCallback(async (uid: string) => {
    const userDoc = await getUserDocument(uid);
    setAppUser(userDoc);
    return userDoc;
  }, []);

  const refreshUser = useCallback(async () => {
    if (firebaseUser) {
      await fetchAppUser(firebaseUser.uid);
    }
  }, [firebaseUser, fetchAppUser]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      console.log('[AuthContext] onAuthStateChanged →', user ? `uid=${user.uid}` : 'null');
      setFirebaseUser(user);

      if (user) {
        try {
          const doc = await fetchAppUser(user.uid);
          console.log('[AuthContext] Loaded user doc:', doc ? `role=${doc.role} onboardingComplete=${doc.onboardingComplete}` : 'null (no doc)');
        } catch (err) {
          // Don't leave the app wedged in "onboarding" mode because of a
          // transient network/permissions error — clear appUser so navigation
          // falls through to the correct branch, but surface the reason in
          // Metro logs so we can diagnose sign-ins that never progress.
          console.error('[AuthContext] Failed to load user document:', err);
          setAppUser(null);
        }
      } else {
        setAppUser(null);
        setOnboardingData(null);
      }

      setLoading(false);
      setInitialized(true);
    });

    return unsubscribe;
  }, [fetchAppUser]);

  const setOnboardingRole = useCallback((role: UserRole) => {
    setOnboardingData((prev) => ({
      role,
      interests: prev?.interests ?? [],
    }));
  }, []);

  const setOnboardingInterests = useCallback((interests: string[]) => {
    setOnboardingData((prev) => ({
      role: prev?.role ?? 'student',
      interests,
    }));
  }, []);

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        appUser,
        loading,
        initialized,
        onboardingData,
        setOnboardingRole,
        setOnboardingInterests,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
