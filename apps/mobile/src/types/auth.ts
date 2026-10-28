import type { NotificationPreferences, ProfileRole } from './profile';

export type UserRole = ProfileRole;

export type NotificationPrefs = NotificationPreferences;

/** Onboarding choices held in memory until the profile row is created. */
export interface OnboardingData {
  role?: UserRole;
  displayName?: string;
}
