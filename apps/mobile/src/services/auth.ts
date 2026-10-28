import { getSupabase } from './supabase';
import { createAuthService } from './authService';
import { createProfileRepository, type ProfileClient } from './profileRepository';

export { AuthServiceError, AUTH_CALLBACK_URL } from './authService';
export type { AuthErrorKind, SignUpResult } from './authService';

/** Supabase Email/Password operations used by the auth screens and AuthContext. */
export const authService = createAuthService(() => getSupabase().auth);

let profileRepository: ReturnType<typeof createProfileRepository> | null = null;

/** The A07 profile repository bound to the app's Supabase client. */
export function getProfileRepository() {
  profileRepository ??= createProfileRepository(getSupabase() as unknown as ProfileClient);
  return profileRepository;
}
