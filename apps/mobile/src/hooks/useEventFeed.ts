// E02: Home/Search feed from Supabase, a page at a time, with explicit
// loading, error and empty states. There is no mock fallback: if the backend
// fails, `status` is 'error' and the screen shows it.
//
// Replaces useEvents for Home once E03 switches over (coordinate with Thomas).

import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNetworkState } from 'expo-network';
import { getSupabase } from '../services/supabase';
import { categoryForSlug } from '../services/mapEvents';
import { createHomeFeedCache } from '../services/homeFeedCache';
import {
  createSupabaseEventRepository,
  DEFAULT_FEED_LIMIT,
  type EventRepository,
} from '../services/eventRepository';
import {
  canLoadMore,
  feedReducer,
  initialFeedState,
  toFeedCardEvent,
  type FeedCardEvent,
  type FeedStatus,
} from '../services/eventFeed';

export interface UseEventFeedParams {
  /** Category slug (e.g. 'food-drink'). Null or missing means all. */
  categorySlug?: string | null;
  search?: string;
  /** End of the time filter. Missing means no end. */
  until?: Date | null;
  pageSize?: number;
  /** For tests or another backend. Defaults to Supabase. */
  repository?: EventRepository;
  accountId?: string;
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
  offline: boolean;
  cached: boolean;
}

const SEARCH_DEBOUNCE_MS = 300;
const homeCache = createHomeFeedCache(AsyncStorage);

function defaultRepository(): EventRepository {
  return createSupabaseEventRepository((fn, args) => getSupabase().rpc(fn, args));
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong loading events.';
}

export function useEventFeed({
  categorySlug = null,
  search = '',
  until = null,
  pageSize = DEFAULT_FEED_LIMIT,
  repository,
  accountId,
}: UseEventFeedParams = {}): UseEventFeedResult {
  const repo = useMemo(() => repository ?? defaultRepository(), [repository]);
  const [state, dispatch] = useReducer(feedReducer, initialFeedState);
  const requestIdRef = useRef(0);
  // Keep the query's "now" fixed while paging, so page 2 continues page 1.
  const fromRef = useRef(new Date());
  const [reloadKey, bumpReload] = useReducer((n: number) => n + 1, 0);

  const untilTime = until ? until.getTime() : null;
  const searchText = search.trim();
  const network = useNetworkState();
  const offline = network.isConnected === false || network.isInternetReachable === false;
  const cacheAccount = !categorySlug && !searchText && untilTime === null ? accountId : undefined;
  const cachedRequest = useRef<number | null>(null);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    let cancelled = false;
    cachedRequest.current = null;
    dispatch({ type: 'start', requestId });
    fromRef.current = new Date();
    if (offline) {
      const cached = cacheAccount ? homeCache.read(cacheAccount) : Promise.resolve(null);
      void cached.then(items => {
        if (cancelled) return;
        if (items !== null) {
          cachedRequest.current = requestId;
          dispatch({ type: 'loaded', requestId, page: { items, nextCursor: null } });
        } else {
          dispatch({ type: 'failed', requestId, error: 'No saved results for this feed. Reconnect to load events.' });
        }
      });
      return () => { cancelled = true; };
    }

    const run = () => {
      repo
        .listFeed(
          {
            categorySlug,
            search: searchText,
            from: fromRef.current,
            until: untilTime === null ? null : new Date(untilTime),
          },
          null,
          pageSize,
        )
        .then(page => {
          if (cancelled) return;
          if (cacheAccount) void homeCache.write(cacheAccount, page.items);
          dispatch({ type: 'loaded', requestId, page });
        })
        .catch(error => dispatch({ type: 'failed', requestId, error: messageOf(error) }));
    };

    // Wait for typing to pause before searching; other changes load right away.
    if (searchText.length === 0) {
      run();
      return () => { cancelled = true; };
    }
    const timer = setTimeout(run, SEARCH_DEBOUNCE_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [repo, categorySlug, searchText, untilTime, pageSize, reloadKey, offline, cacheAccount]);

  const stateRef = useRef(state);
  stateRef.current = state;

  const loadMore = useCallback(() => {
    const current = stateRef.current;
    if (offline || !canLoadMore(current)) return;
    const { requestId, nextCursor } = current;
    dispatch({ type: 'moreStart', requestId });
    repo
      .listFeed(
        {
          categorySlug,
          search: searchText,
          from: fromRef.current,
          until: untilTime === null ? null : new Date(untilTime),
        },
        nextCursor,
        pageSize,
      )
      .then(page => dispatch({ type: 'moreLoaded', requestId, page }))
      .catch(error => dispatch({ type: 'moreFailed', requestId, error: messageOf(error) }));
  }, [repo, categorySlug, searchText, untilTime, pageSize, offline]);

  const refresh = useCallback(() => bumpReload(), []);

  const events = useMemo(() => state.items.map(item => toFeedCardEvent(item, categoryForSlug(item.categorySlug))), [state.items]);

  return {
    events,
    status: state.status,
    error: state.error,
    loadingMore: state.loadingMore,
    loadMoreError: state.loadMoreError,
    hasMore: !offline && state.nextCursor !== null,
    loadMore,
    refresh,
    offline,
    cached: offline && cachedRequest.current === state.requestId,
  };
}
