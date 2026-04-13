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
      setFirebaseUser(user);

      if (user) {
        try {
          await fetchAppUser(user.uid);
        } catch {
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
