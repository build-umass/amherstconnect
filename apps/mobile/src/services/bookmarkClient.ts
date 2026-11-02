import type { Bookmark, BookmarkRepository } from '../types/bookmark';
import { createBookmarkRepository } from './bookmarkRepository';
import { getSupabase } from './supabase';

let repository: BookmarkRepository | null = null;

/** Returns the shared bookmark repository. */
export function getBookmarkRepository(): BookmarkRepository {
  repository ??= createBookmarkRepository(getSupabase());
  return repository;
}

/** Saves one event for current user. */
export async function saveBookmark(eventId: string): Promise<void> {
  await getBookmarkRepository().save(eventId);
}

/** Removes one current user bookmark. */
export async function removeBookmark(eventId: string): Promise<void> {
  await getBookmarkRepository().remove(eventId);
}

/** Checks current user bookmark state. */
export async function isBookmarked(eventId: string): Promise<boolean> {
  return getBookmarkRepository().isSaved(eventId);
}

/** Lists current user bookmarks newest first. */
export async function listBookmarks(): Promise<Bookmark[]> {
  return getBookmarkRepository().list();
}
