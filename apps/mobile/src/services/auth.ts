import { getSupabase } from './supabase';
import { createAuthService } from './authService';
import type { AuthRepository } from '../types/auth';

export { AuthServiceError, AUTH_CALLBACK_URL, toAuthError } from './authService';
export type { AuthErrorKind } from './authService';
export type { AuthRepository, SignUpResult } from '../types/auth';

/** Supabase Email/Password operations used by the auth screens and AuthContext. */
export const authService: AuthRepository = createAuthService(() => getSupabase().auth);
