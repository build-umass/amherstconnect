import type {
  CreateProfileInput,
  NotificationPreferences,
  Profile,
  ProfileRole,
} from '../types/profile';

const PROFILE_COLUMNS =
  'id,display_name,avatar_url,role,interests,notify_new_events,' +
  'notify_saved_reminders,onboarding_complete,created_at,updated_at';

const ROLES: readonly ProfileRole[] = [
  'student',
  'faculty_staff',
  'alumni',
  'local_resident',
];

type ProfileErrorKind = 'unauthenticated' | 'not_found' | 'invalid_input' | 'invalid_data' | 'query';

interface ClientError {
  message: string;
  code?: string;
}

interface ClientResult {
  data: unknown;
  error: ClientError | null;
}

interface ProfileFilterQuery {
  eq(column: 'id', value: string): ProfileFilterQuery;
  maybeSingle(): PromiseLike<ClientResult>;
  single(): PromiseLike<ClientResult>;
}

interface ProfileMutationQuery {
  eq(column: 'id', value: string): ProfileMutationQuery;
  select(columns: string): ProfileFilterQuery;
}

interface ProfileTable {
  select(columns: string): ProfileFilterQuery;
  insert(values: Record<string, unknown>): ProfileMutationQuery;
  update(values: Record<string, unknown>): ProfileMutationQuery;
}

/** The small part of SD1's Supabase client that this repository needs. */
export interface ProfileClient {
  auth: {
    getUser(): PromiseLike<{
      data: { user: { id: string } | null };
      error: ClientError | null;
    }>;
  };
  from(table: 'profiles'): ProfileTable;
}

export class ProfileRepositoryError extends Error {
  constructor(
    public readonly kind: ProfileErrorKind,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ProfileRepositoryError';
  }
}

function isRole(value: unknown): value is ProfileRole {
  return ROLES.includes(value as ProfileRole);
}

function toProfile(value: unknown): Profile {
  if (!value || typeof value !== 'object') {
    throw new ProfileRepositoryError('invalid_data', 'Profile response is missing.');
  }

  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== 'string' ||
    typeof row.display_name !== 'string' ||
    !(row.avatar_url === null || typeof row.avatar_url === 'string') ||
    !isRole(row.role) ||
    !Array.isArray(row.interests) ||
    !row.interests.every((item) => typeof item === 'string') ||
    typeof row.notify_new_events !== 'boolean' ||
    typeof row.notify_saved_reminders !== 'boolean' ||
    typeof row.onboarding_complete !== 'boolean' ||
    typeof row.created_at !== 'string' ||
    typeof row.updated_at !== 'string'
  ) {
    throw new ProfileRepositoryError('invalid_data', 'Profile response does not match the schema.');
  }

  return {
    id: row.id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    role: row.role,
    interests: [...row.interests],
    notificationPrefs: {
      newEvents: row.notify_new_events,
      savedReminders: row.notify_saved_reminders,
    },
    onboardingComplete: row.onboarding_complete,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function checkResult(result: ClientResult, operation: string): Profile | null {
  if (result.error) {
    throw new ProfileRepositoryError('query', `Could not ${operation} profile.`, result.error.code);
  }
  return result.data === null ? null : toProfile(result.data);
}

function normalizeInterests(interests: string[]): string[] {
  if (!Array.isArray(interests) || !interests.every((item) => typeof item === 'string' && item.trim())) {
    throw new ProfileRepositoryError('invalid_input', 'Interests must be nonempty strings.');
  }
  return [...new Set(interests.map((item) => item.trim()))];
}

export function createProfileRepository(client: ProfileClient) {
  async function requireUserId(): Promise<string> {
    let result: Awaited<ReturnType<ProfileClient['auth']['getUser']>>;
    try {
      result = await client.auth.getUser();
    } catch {
      throw new ProfileRepositoryError('query', 'Could not verify the current user.');
    }
    if (result.error) {
      throw new ProfileRepositoryError('query', 'Could not verify the current user.', result.error.code);
    }
    if (!result.data.user?.id) {
      throw new ProfileRepositoryError('unauthenticated', 'Sign in before accessing a profile.');
    }
    return result.data.user.id;
  }

  async function readOwnProfile(userId: string): Promise<Profile | null> {
    const result = await client.from('profiles').select(PROFILE_COLUMNS).eq('id', userId).maybeSingle();
    return checkResult(result, 'load');
  }

  async function updateOwnProfile(values: Record<string, unknown>): Promise<Profile> {
    const userId = await requireUserId();
    const result = await client
      .from('profiles')
      .update(values)
      .eq('id', userId)
      .select(PROFILE_COLUMNS)
      .maybeSingle();
    const profile = checkResult(result, 'update');
    if (!profile) {
      throw new ProfileRepositoryError('not_found', 'Profile does not exist yet.');
    }
    return profile;
  }

  return {
    async load(): Promise<Profile | null> {
      return readOwnProfile(await requireUserId());
    },

    async create(input: CreateProfileInput): Promise<Profile> {
      const displayName = input.displayName?.trim();
      if (!displayName || displayName.length > 100 || !isRole(input.role)) {
        throw new ProfileRepositoryError('invalid_input', 'A valid name and role are required.');
      }
      const userId = await requireUserId();
      const result = await client
        .from('profiles')
        .insert({
          id: userId,
          display_name: displayName,
          avatar_url: input.avatarUrl ?? null,
          role: input.role,
          onboarding_complete: false,
        })
        .select(PROFILE_COLUMNS)
        .single();

      if (result.error?.code === '23505') {
        const existing = await readOwnProfile(userId);
        if (existing) return existing;
      }
      const profile = checkResult(result, 'create');
      if (!profile) {
        throw new ProfileRepositoryError('invalid_data', 'Created profile was not returned.');
      }
      return profile;
    },

    completeOnboarding(interests: string[]): Promise<Profile> {
      return updateOwnProfile({
        interests: normalizeInterests(interests),
        onboarding_complete: true,
      });
    },

    updateInterests(interests: string[]): Promise<Profile> {
      return updateOwnProfile({ interests: normalizeInterests(interests) });
    },

    updateNotificationPreferences(changes: Partial<NotificationPreferences>): Promise<Profile> {
      const values: Record<string, unknown> = {};
      if ('newEvents' in changes) {
        if (typeof changes.newEvents !== 'boolean') {
          throw new ProfileRepositoryError('invalid_input', 'newEvents must be a boolean.');
        }
        values.notify_new_events = changes.newEvents;
      }
      if ('savedReminders' in changes) {
        if (typeof changes.savedReminders !== 'boolean') {
          throw new ProfileRepositoryError('invalid_input', 'savedReminders must be a boolean.');
        }
        values.notify_saved_reminders = changes.savedReminders;
      }
      if (Object.keys(values).length === 0) {
        throw new ProfileRepositoryError('invalid_input', 'Choose a preference to update.');
      }
      return updateOwnProfile(values);
    },
  };
}
