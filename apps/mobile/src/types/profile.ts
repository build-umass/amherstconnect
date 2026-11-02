/**
 * A07 profile contract copied ahead of the feature implementation merge.
 * Keep this file implementation-free so E07 can compile against the agreed
 * profile shape without taking A07's screens or repository code.
 */
export type ProfileRole = 'student' | 'faculty_staff' | 'alumni' | 'local_resident';

export interface NotificationPreferences {
  newEvents: boolean;
  savedReminders: boolean;
}

export interface Profile {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  role: ProfileRole;
  interests: string[];
  notificationPrefs: NotificationPreferences;
  onboardingComplete: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProfileInput {
  displayName: string;
  avatarUrl?: string | null;
  role: ProfileRole;
}
