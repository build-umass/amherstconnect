import type { NotificationPreferences, ProfileRole } from './profile';

export type UserRole = ProfileRole;

export type NotificationPrefs = NotificationPreferences;

/** Onboarding choices held in memory until the profile row is created. */
export interface OnboardingData {
  role?: UserRole;
  displayName?: string;
  /** Account the draft was entered for; it is ignored for any other session user. */
  email?: string;
}

export type SignUpResult = { status: 'signed_in' } | { status: 'confirmation_required'; email: string };

/** `cancelled` when the user closed the browser or declined Google's consent screen. */
export type GoogleSignInResult = { status: 'signed_in' } | { status: 'cancelled' };

/**
 * Backend-neutral auth operations used by the auth screens and AuthContext.
 * Failures reject with an `AuthServiceError` carrying a user-facing message.
 */
export interface AuthRepository {
  signUp(email: string, password: string, displayName?: string): Promise<SignUpResult>;
  signIn(email: string, password: string): Promise<void>;
  signInWithGoogle(): Promise<GoogleSignInResult>;
  /** Ends the session on this device; never rejects. */
  signOut(): Promise<void>;
  resendConfirmation(email: string): Promise<void>;
  /** Emails a reset link that opens the app; responds the same whether or not the account exists. */
  requestPasswordReset(email: string): Promise<void>;
  /** Sets a new password for the signed-in user (after opening a reset link). */
  updatePassword(password: string): Promise<void>;
  /** Establishes a session from an email-link deep link; false if the URL is not an auth callback. */
  handleCallbackUrl(url: string): Promise<boolean>;
}
