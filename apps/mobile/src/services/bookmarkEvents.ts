import type { SupabaseClient } from '@supabase/supabase-js';
import type { Event, EventCategory } from '../types/event';
import type { BookmarkEventRepository } from './savedEvents';

type EventClient = Pick<SupabaseClient, 'from'>;

const CATEGORY_DISPLAY: Record<string, { category: EventCategory; emoji: string }> = {
  'talks-lectures': { category: 'Talks & Lectures', emoji: '\u{1F3A4}' },
  'workshops-classes': { category: 'Workshops & Classes', emoji: '\u{1F6E0}\uFE0F' },
  'arts-culture': { category: 'Arts & Culture', emoji: '\u{1F3A8}' },
  'sports-recreation': { category: 'Sports & Recreation', emoji: '\u{1F3C3}' },
  'career-networking': { category: 'Career & Networking', emoji: '\u{1F4BC}' },
  'health-wellness': { category: 'Health & Wellness', emoji: '\u{1F9D8}' },
  'social-community': { category: 'Social & Community', emoji: '\u{1F91D}' },
  'food-drink': { category: 'Food & Drink', emoji: '\u{1F37D}\uFE0F' },
};

const DEFAULT_CATEGORY = { category: 'Social & Community' as const, emoji: '\u{1F4CD}' };

type EventRow = {
  id?: unknown;
  title?: unknown;
  description?: unknown;
  is_free?: unknown;
  featured_rank?: unknown;
  timezone?: unknown;
  organization?: unknown;
  primary_category?: unknown;
  occurrences?: unknown;
};

/** Extracts one related database object. */
function related(value: unknown): Record<string, unknown> | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return typeof candidate === 'object' && candidate !== null
    ? candidate as Record<string, unknown>
    : null;
}

/** Formats one event timestamp safely. */
function formatTimestamp(
  value: string,
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
): string {
  try {
    return new Intl.DateTimeFormat('en-US', { ...options, timeZone })
      .format(new Date(value))
      .replace(/\u202f/g, ' ');
  } catch {
    return new Intl.DateTimeFormat('en-US', options)
      .format(new Date(value))
      .replace(/\u202f/g, ' ');
  }
}

/** Maps provisional Supabase event data. */
export function toBookmarkEvent(row: EventRow): Event | null {
  if (typeof row.id !== 'string' || typeof row.title !== 'string') return null;

  const category = related(row.primary_category);
  const categoryStyle = CATEGORY_DISPLAY[
    typeof category?.slug === 'string' ? category.slug : ''
  ] ?? DEFAULT_CATEGORY;
  const organization = related(row.organization);
  const occurrences = Array.isArray(row.occurrences)
    ? row.occurrences
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      .sort((a, b) => String(a.starts_at ?? '').localeCompare(String(b.starts_at ?? '')))
    : [];
  const occurrence = occurrences[0] ?? null;
  const venue = related(occurrence?.venue);
  const startsAt = typeof occurrence?.starts_at === 'string' ? occurrence.starts_at : null;
  const timeZone = typeof row.timezone === 'string' ? row.timezone : 'America/New_York';
  const allDay = occurrence?.all_day === true;

  return {
    id: row.id,
    title: row.title,
    category: categoryStyle.category,
    emoji: categoryStyle.emoji,
    date: startsAt
      ? formatTimestamp(startsAt, timeZone, { weekday: 'short', month: 'short', day: 'numeric' })
      : 'Date TBA',
    time: startsAt
      ? allDay
        ? 'All day'
        : formatTimestamp(startsAt, timeZone, { hour: 'numeric', minute: '2-digit' })
      : 'Time TBA',
    location:
      (typeof occurrence?.location_name === 'string' && occurrence.location_name)
      || (typeof venue?.name === 'string' && venue.name)
      || 'Location TBA',
    organizer: typeof organization?.name === 'string' ? organization.name : undefined,
    description: typeof row.description === 'string' ? row.description : undefined,
    isFree: row.is_free === true,
    isFeatured: typeof row.featured_rank === 'number',
  };
}

/** Creates provisional E02-compatible repository. */
export function createBookmarkEventRepository(
  client: EventClient,
): BookmarkEventRepository<Event> {
  return {
    getId: (event) => event.id,
    async getByIds(eventIds) {
      if (eventIds.length === 0) return [];
      const { data, error } = await client
        .from('events')
        .select(`
          id,title,description,is_free,featured_rank,timezone,
          organization:organizations(name),
          primary_category:categories!events_primary_category_id_fkey(name,slug),
          occurrences:event_occurrences(starts_at,all_day,location_name,venue:venues(name))
        `)
        .in('id', eventIds);
      if (error) throw new Error(`Could not load bookmarked events: ${error.message}`);
      if (!Array.isArray(data)) return [];
      return data
        .map((row: unknown) =>
          typeof row === 'object' && row !== null ? toBookmarkEvent(row as EventRow) : null)
        .filter((event): event is Event => event !== null);
    },
  };
}
