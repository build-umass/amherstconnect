import * as WebBrowser from 'expo-web-browser';
import { getSupabase } from './supabase';
import { createAuthService } from './authService';
import type { AuthRepository } from '../types/auth';

export { AuthServiceError, AUTH_CALLBACK_URL, toAuthError } from './authService';
export type { AuthErrorKind } from './authService';
export type { AuthRepository, GoogleSignInResult, SignUpResult } from '../types/auth';

/** Supabase Email/Password and Google operations used by the auth screens and AuthContext. */
export const authService: AuthRepository = createAuthService(() => getSupabase().auth, {
  openAuthSession: (url, redirectUrl) => WebBrowser.openAuthSessionAsync(url, redirectUrl),
});
