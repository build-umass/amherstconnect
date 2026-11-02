import type { Event } from '../types/event';
import { createBookmarkEventRepository } from './bookmarkEvents';
import type { BookmarkEventRepository } from './savedEvents';
import { getSupabase } from './supabase';

let repository: BookmarkEventRepository<Event> | null = null;

/** Returns provisional bookmark event repository. */
export function getBookmarkEventRepository(): BookmarkEventRepository<Event> {
  repository ??= createBookmarkEventRepository(getSupabase());
  return repository;
}
