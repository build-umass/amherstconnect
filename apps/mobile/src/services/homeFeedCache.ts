import type { FeedItem } from './eventRepository';
import type { Profile } from '../types/profile';

type Storage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

const prefix = 'amherst.home-feed.v1:';
const idPattern = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;
const optionalText = (value: unknown) => value === null || typeof value === 'string';
const optionalCoordinate = (value: unknown) => value === null || (typeof value === 'number' && Number.isFinite(value));

function validItem(value: unknown): value is FeedItem {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return [row.eventId, row.occurrenceId].every(id => typeof id === 'string' && idPattern.test(id))
    && [row.title, row.categoryName, row.categorySlug, row.timezone].every(text => typeof text === 'string')
    && typeof row.startsAt === 'string' && Number.isFinite(Date.parse(row.startsAt))
    && (row.endsAt === null || (typeof row.endsAt === 'string' && Number.isFinite(Date.parse(row.endsAt))))
    && [row.organizerName, row.locationName, row.imageUrl].every(optionalText)
    && [row.latitude, row.longitude].every(optionalCoordinate)
    && typeof row.allDay === 'boolean' && typeof row.isFree === 'boolean'
    && (row.locationType === 'physical' || row.locationType === 'virtual' || row.locationType === 'hybrid');
}

export function createHomeFeedCache(storage: Storage) {
  return {
    async read(accountId: string, now = Date.now()): Promise<FeedItem[] | null> {
      try {
        const raw = await storage.getItem(prefix + accountId);
        if (raw === null) return null;
        const items: unknown = JSON.parse(raw);
        if (!Array.isArray(items) || !items.every(validItem)) return null;
        return items.filter(item => Date.parse(item.endsAt ?? item.startsAt) > now);
      } catch {
        return null;
      }
    },
    async write(accountId: string, items: FeedItem[]): Promise<void> {
      try {
        await storage.setItem(prefix + accountId, JSON.stringify(items));
      } catch {
        // Storage failure must not turn a successful network result into an error.
      }
    },
  };
}

/** Restore only the completed profile for the account already restored by Auth. */
export async function loadProfileForHome({ accountId, storage, load, offline }: {
  accountId: string;
  storage: Storage;
  load: () => Promise<Profile | null>;
  offline: () => Promise<boolean>;
}): Promise<Profile | null> {
  const key = 'amherst.home-profile.v1:' + accountId;
  try {
    const profile = await load();
    try {
      await storage.setItem(key, JSON.stringify(profile?.id === accountId && profile.onboardingComplete ? profile : null));
    } catch {
      // A storage failure should not interrupt sign-in.
    }
    return profile;
  } catch (error) {
    const failure = error as { kind?: string; code?: string };
    // A revoked or missing session must go through the normal Auth flow.
    if (failure?.kind === 'unauthenticated' || failure?.code) throw error;
    try {
      if (await offline()) {
        const value = JSON.parse((await storage.getItem(key)) ?? 'null') as Partial<Profile> | null;
        if (value?.id === accountId && value.onboardingComplete === true
          && typeof value.displayName === 'string'
          && ['student', 'faculty_staff', 'alumni', 'local_resident'].includes(value.role ?? '')
          && Array.isArray(value.interests) && value.interests.every(interest => typeof interest === 'string')
          && typeof value.notificationPrefs?.newEvents === 'boolean'
          && typeof value.notificationPrefs?.savedReminders === 'boolean'
          && (value.avatarUrl === null || typeof value.avatarUrl === 'string')
          && typeof value.createdAt === 'string' && typeof value.updatedAt === 'string') return value as Profile;
      }
    } catch {
      // Preserve the original profile failure when cache or connectivity fails.
    }
    throw error;
  }
}
