import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithCredential,
  signOut,
  sendPasswordResetEmail,
  GoogleAuthProvider,
} from 'firebase/auth';
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { auth, db } from './firebase';
import type { UserRole, AuthProvider as AppAuthProvider, AppUser } from '../types/auth';

// ── Email/Password ──────────────────────────────────────────────

export async function signUpWithEmail(email: string, password: string) {
  return createUserWithEmailAndPassword(auth, email, password);
}

export async function loginWithEmail(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email, password);
}

export async function resetPassword(email: string) {
  return sendPasswordResetEmail(auth, email);
}

// ── OAuth Credential Builders ───────────────────────────────────

export function buildGoogleCredential(idToken: string) {
  const credential = GoogleAuthProvider.credential(idToken);
  return signInWithCredential(auth, credential);
}

// ── Sign Out ────────────────────────────────────────────────────

export async function logout() {
  return signOut(auth);
}

// ── Firestore User Document ─────────────────────────────────────

export async function createUserDocument(
  uid: string,
  email: string,
  displayName: string,
  photoURL: string | null,
  role: UserRole,
  interests: string[],
  authProvider: AppAuthProvider,
  onboardingComplete: boolean = false,
) {
  const userRef = doc(db, 'users', uid);
  await setDoc(userRef, {
    uid,
    email,
    role,
    displayName,
    photoURL,
    eduVerified: false,
    interests,
    authProvider,
    onboardingComplete,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await createRoleProfile(uid, role);
}

export async function completeOnboarding(uid: string, interests: string[]) {
  const userRef = doc(db, 'users', uid);
  await updateDoc(userRef, {
    interests,
    onboardingComplete: true,
    updatedAt: serverTimestamp(),
  });
}

async function createRoleProfile(uid: string, role: UserRole) {
  const collectionMap: Record<UserRole, string> = {
    student: 'student_profiles',
    faculty_staff: 'faculty_staff_profiles',
    alumni: 'alumni_profiles',
    local_resident: 'resident_profiles',
  };

  const collection = collectionMap[role];
  const profileRef = doc(db, collection, uid);

  const baseProfile = { uid, createdAt: serverTimestamp() };

  const roleDefaults: Record<UserRole, object> = {
    student: { eduVerified: false, eduEmail: null, major: null, gradYear: null },
    faculty_staff: { department: null, title: null },
    alumni: { gradYear: null, major: null },
    local_resident: { neighborhood: null },
  };

  await setDoc(profileRef, { ...baseProfile, ...roleDefaults[role] });
}

export async function getUserDocument(uid: string): Promise<AppUser | null> {
  const userRef = doc(db, 'users', uid);
  const snapshot = await getDoc(userRef);
  if (!snapshot.exists()) return null;
  return snapshot.data() as AppUser;
}

export async function updateUserDocument(uid: string, data: Partial<AppUser>) {
  const userRef = doc(db, 'users', uid);
  await updateDoc(userRef, { ...data, updatedAt: serverTimestamp() });
}

export async function checkUserExists(uid: string): Promise<boolean> {
  const userRef = doc(db, 'users', uid);
  const snapshot = await getDoc(userRef);
  return snapshot.exists();
}
