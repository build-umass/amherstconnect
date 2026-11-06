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
