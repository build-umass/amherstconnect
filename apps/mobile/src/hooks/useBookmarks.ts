import { useCallback, useEffect, useState } from 'react';
import type { CanonicalEvent } from '../../../../shared/contracts/event';
import {
  getBookmarkRepository,
  isBookmarked,
  removeBookmark,
  saveBookmark,
} from '../services/bookmarkClient';
import {
  loadSavedEvents,
  type BookmarkEventRepository,
} from '../services/savedEvents';

export interface UseBookmarkResult {
  isBookmarked: boolean;
  loading: boolean;
  mutating: boolean;
  error: string | null;
  toggle: () => Promise<void>;
  refresh: () => Promise<void>;
}

export interface UseSavedEventsResult {
  savedEvents: CanonicalEvent[];
  loadingSaved: boolean;
  savedEventsError: string | null;
  refetchSaved: () => Promise<void>;
}

/** Converts unknown failures into messages. */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}

/** Manages one event bookmark state. */
export function useBookmark(eventId: string): UseBookmarkResult {
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSaved(await isBookmarked(eventId));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toggle = useCallback(async () => {
    if (loading || mutating) return;
    const previous = saved;
    const next = !previous;
    setSaved(next);
    setMutating(true);
    setError(null);
    try {
      if (next) await saveBookmark(eventId);
      else await removeBookmark(eventId);
    } catch (cause) {
      setSaved(previous);
      setError(errorMessage(cause));
    } finally {
      setMutating(false);
    }
  }, [eventId, loading, mutating, saved]);

  return { isBookmarked: saved, loading, mutating, error, toggle, refresh };
}

/** Loads full bookmarked events through E02. */
export function useSavedEvents(events: BookmarkEventRepository): UseSavedEventsResult {
  const [savedEvents, setSavedEvents] = useState<CanonicalEvent[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(true);
  const [savedEventsError, setSavedEventsError] = useState<string | null>(null);

  const refetchSaved = useCallback(async () => {
    setLoadingSaved(true);
    setSavedEventsError(null);
    try {
      setSavedEvents(await loadSavedEvents(getBookmarkRepository(), events));
    } catch (cause) {
      setSavedEventsError(errorMessage(cause));
    } finally {
      setLoadingSaved(false);
    }
  }, [events]);

  useEffect(() => {
    void refetchSaved();
  }, [refetchSaved]);

  return { savedEvents, loadingSaved, savedEventsError, refetchSaved };
}
