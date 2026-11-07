// E02: Home/Search feed from Supabase, a page at a time, with explicit
// loading, error and empty states. There is no mock fallback: if the backend
// fails, `status` is 'error' and the screen shows it.
// E04: combined filters (categories, organizations, free only, dates, search).
//
// Replaces useEvents for Home once E03 switches over (coordinate with Thomas).

import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { getSupabase } from '../services/supabase';
import { categoryForSlug } from '../services/mapEvents';
import {
  createSupabaseEventRepository,
  DEFAULT_FEED_LIMIT,
  type EventRepository,
} from '../services/eventRepository';
import {
  canLoadMore,
  feedFiltersFromKey,
  feedFiltersKey,
  feedReducer,
  initialFeedState,
  toFeedCardEvent,
  type FeedCardEvent,
  type FeedStatus,
} from '../services/eventFeed';

/** Different filters combine with AND; the values in one list combine with OR. */
export interface UseEventFeedParams {
  /** Category slugs (e.g. ['food-drink']). Empty or missing means all. */
  categorySlugs?: string[];
  /** Organization IDs from listOrganizations. Empty or missing means all. */
  organizationIds?: string[];
  /** Only free events. */
  freeOnly?: boolean;
  search?: string;
  /** Start of the time filter. Missing means now. */
  from?: Date | null;
  /** End of the time filter. Missing means no end. */
  until?: Date | null;
  pageSize?: number;
  /** For tests or another backend. Defaults to Supabase. */
  repository?: EventRepository;
}

export interface UseEventFeedResult {
  events: FeedCardEvent[];
  status: FeedStatus;
  error: string | null;
  loadingMore: boolean;
  loadMoreError: string | null;
  hasMore: boolean;
  loadMore: () => void;
  refresh: () => void;
}

const SEARCH_DEBOUNCE_MS = 300;

function defaultRepository(): EventRepository {
  return createSupabaseEventRepository((fn, args) => getSupabase().rpc(fn, args));
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong loading events.';
}

export function useEventFeed({
  categorySlugs,
  organizationIds,
  freeOnly,
  search,
  from,
  until,
  pageSize = DEFAULT_FEED_LIMIT,
  repository,
}: UseEventFeedParams = {}): UseEventFeedResult {
  const repo = useMemo(() => repository ?? defaultRepository(), [repository]);
  const [state, dispatch] = useReducer(feedReducer, initialFeedState);
  const requestIdRef = useRef(0);
  // Keep the query's start fixed while paging, so page 2 continues page 1.
  const fromRef = useRef(new Date());
  const [reloadKey, bumpReload] = useReducer((n: number) => n + 1, 0);

  // Rebuilt only when a filter value changes, not on every new array or date.
  const filtersKey = feedFiltersKey({ categorySlugs, organizationIds, freeOnly, search, from, until });
  const filters = useMemo(() => feedFiltersFromKey(filtersKey), [filtersKey]);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    dispatch({ type: 'start', requestId });
    fromRef.current = filters.from ?? new Date();

    const run = () => {
      repo
        .listFeed({ ...filters, from: fromRef.current }, null, pageSize)
        .then(page => dispatch({ type: 'loaded', requestId, page }))
        .catch(error => dispatch({ type: 'failed', requestId, error: messageOf(error) }));
    };

    // Wait for typing to pause before searching; other changes load right away.
    if (!filters.search) {
      run();
      return undefined;
    }
    const timer = setTimeout(run, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [repo, filters, pageSize, reloadKey]);

  const stateRef = useRef(state);
  stateRef.current = state;

  const loadMore = useCallback(() => {
    const current = stateRef.current;
    if (!canLoadMore(current)) return;
    const { requestId, nextCursor } = current;
    dispatch({ type: 'moreStart', requestId });
    repo
      .listFeed({ ...filters, from: fromRef.current }, nextCursor, pageSize)
      .then(page => dispatch({ type: 'moreLoaded', requestId, page }))
      .catch(error => dispatch({ type: 'moreFailed', requestId, error: messageOf(error) }));
  }, [repo, filters, pageSize]);

  const refresh = useCallback(() => bumpReload(), []);

  const events = useMemo(() => state.items.map(item => toFeedCardEvent(item, categoryForSlug(item.categorySlug))), [state.items]);

  return {
    events,
    status: state.status,
    error: state.error,
    loadingMore: state.loadingMore,
    loadMoreError: state.loadMoreError,
    hasMore: state.nextCursor !== null,
    loadMore,
    refresh,
  };
}
