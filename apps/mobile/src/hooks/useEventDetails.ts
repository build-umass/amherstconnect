// E02: loads one event by its canonical ID for Event Details.
// 'not-found' covers deleted, hidden and old non-Supabase IDs.

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { getSupabase } from '../services/supabase';
import {
  createSupabaseEventRepository,
  type EventDetail,
  type EventRepository,
} from '../services/eventRepository';

export type EventDetailsStatus = 'loading' | 'ready' | 'not-found' | 'error';

export interface UseEventDetailsResult {
  event: EventDetail | null;
  status: EventDetailsStatus;
  error: string | null;
  retry: () => void;
}

export function useEventDetails(
  eventId: string | null | undefined,
  repository?: EventRepository,
): UseEventDetailsResult {
  const repo = useMemo(
    () => repository ?? createSupabaseEventRepository((fn, args) => getSupabase().rpc(fn, args)),
    [repository],
  );
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [status, setStatus] = useState<EventDetailsStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [retryKey, bumpRetry] = useReducer((n: number) => n + 1, 0);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    setEvent(null);
    setError(null);

    if (!eventId) {
      setStatus('not-found');
      return;
    }
    setStatus('loading');

    repo
      .getEventById(eventId)
      .then(result => {
        if (requestId !== requestIdRef.current) return;
        setEvent(result);
        setStatus(result ? 'ready' : 'not-found');
      })
      .catch(err => {
        if (requestId !== requestIdRef.current) return;
        setError(err instanceof Error ? err.message : 'Something went wrong loading this event.');
        setStatus('error');
      });
  }, [repo, eventId, retryKey]);

  const retry = useCallback(() => bumpRetry(), []);

  return { event, status, error, retry };
}
