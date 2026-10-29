import { getSupabase } from './supabase';
import { createProfileRepository, type ProfileClient } from './profileRepository';

let profileRepository: ReturnType<typeof createProfileRepository> | null = null;

/** The A07 profile repository bound to the app's Supabase client. */
export function getProfileRepository() {
  profileRepository ??= createProfileRepository(getSupabase() as unknown as ProfileClient);
  return profileRepository;
}
