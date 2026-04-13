import { type User as FirebaseUser } from 'firebase/auth';
import { type Timestamp } from 'firebase/firestore';

export type UserRole = 'student' | 'faculty_staff' | 'alumni' | 'local_resident';

export type AuthProvider = 'email' | 'google' | 'apple';

export interface AppUser {
  uid: string;
  email: string;
  role: UserRole;
  displayName: string;
  photoURL: string | null;
  eduVerified: boolean;
  interests: string[];
  authProvider: AuthProvider;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface StudentProfile {
  uid: string;
  eduVerified: boolean;
  eduEmail: string | null;
  major: string | null;
  gradYear: number | null;
  createdAt: Timestamp;
}

export interface FacultyStaffProfile {
  uid: string;
  department: string | null;
  title: string | null;
  createdAt: Timestamp;
}

export interface AlumniProfile {
  uid: string;
  gradYear: number | null;
  major: string | null;
  createdAt: Timestamp;
}

export interface ResidentProfile {
  uid: string;
  neighborhood: string | null;
  createdAt: Timestamp;
}

export interface AuthState {
  user: AppUser | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  initialized: boolean;
}

export interface OnboardingData {
  role: UserRole;
  interests: string[];
}
