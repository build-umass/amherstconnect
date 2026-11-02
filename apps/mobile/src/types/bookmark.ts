/** Mirrors public.bookmarks in Supabase. */
export interface Bookmark {
  profileId: string;
  eventId: string;
  createdAt: string;
  updatedAt: string;
}

/** Stable E07 contract consumed by event details and the profile hook. */
export interface BookmarkRepository {
  save(eventId: string): Promise<void>;
  remove(eventId: string): Promise<void>;
  isSaved(eventId: string): Promise<boolean>;
  list(): Promise<Bookmark[]>;
}
