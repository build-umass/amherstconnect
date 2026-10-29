import type { NotificationPreferences, ProfileRole } from './profile';

export type UserRole = ProfileRole;

export type NotificationPrefs = NotificationPreferences;

/** Onboarding choices held in memory until the profile row is created. */
export interface OnboardingData {
  role?: UserRole;
  displayName?: string;
}

export type SignUpResult = { status: 'signed_in' } | { status: 'confirmation_required'; email: string };

/**
 * Backend-neutral auth operations used by the auth screens and AuthContext.
 * Failures reject with an `AuthServiceError` carrying a user-facing message.
 */
export interface AuthRepository {
  signUp(email: string, password: string, displayName?: string): Promise<SignUpResult>;
  signIn(email: string, password: string): Promise<void>;
  /** Ends the session on this device; never rejects. */
  signOut(): Promise<void>;
  resendConfirmation(email: string): Promise<void>;
  /** Establishes a session from an email-link deep link; false if the URL is not an auth callback. */
  handleCallbackUrl(url: string): Promise<boolean>;
}
