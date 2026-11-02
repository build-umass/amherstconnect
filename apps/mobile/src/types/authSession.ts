import type { Profile } from './profile';

/**
 * A04 session contract copied ahead of the feature implementation merge.
 * A04's AuthContext will supply this state; E07 should consume only this
 * public shape and must not depend on the session implementation.
 */
export type AuthStatus =
  | 'initializing'
  | 'signed_out'
  | 'loading_profile'
  | 'onboarding'
  | 'signed_in'
  | 'profile_error';

export interface AuthUser {
  id: string;
  email: string | null;
  /** Name from signup metadata or the identity provider; a profile default only. */
  metadataName: string | null;
}

export interface AuthSnapshot {
  status: AuthStatus;
  user: AuthUser | null;
  profile: Profile | null;
  profileError: string | null;
}
