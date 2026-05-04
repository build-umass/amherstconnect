import { useState, useEffect, useCallback } from 'react';
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  setDoc,
  deleteDoc,
  serverTimestamp,
  orderBy,
} from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from '../contexts/AuthContext';
import type { Event } from '../types/event';

/**
 * Fetches the current user's bookmarked events from Firestore.
 * Returns the resolved Event objects (joined from the events collection)
 * plus a loading flag and a refetch callback.
 */
export function useSavedEvents() {
  const { appUser } = useAuth();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!appUser) {
      setEvents([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const q = query(
        collection(db, 'bookmarks'),
        where('userId', '==', appUser.uid),
        orderBy('createdAt', 'desc'),
      );
      const snap = await getDocs(q);
      const eventIds = snap.docs.map((d) => d.data().eventId as string);

      if (eventIds.length === 0) {
        setEvents([]);
        return;
      }

      const eventDocs = await Promise.all(
        eventIds.map((id) => getDoc(doc(db, 'events', id))),
      );
      const resolved = eventDocs
        .filter((d) => d.exists())
        .map((d) => ({ id: d.id, ...d.data() } as Event));
      // preserve bookmark order (createdAt desc from the query above)
      const order = new Map(eventIds.map((id, i) => [id, i]));
      resolved.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
      setEvents(resolved);
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [appUser]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { savedEvents: events, loadingSaved: loading, refetchSaved: refetch };
}

/**
 * Toggles bookmark state for an event. Returns `true` if the event
 * is now bookmarked, `false` if the bookmark was removed.
 */
export async function toggleBookmark(
  userId: string,
  eventId: string,
): Promise<boolean> {
  const q = query(
    collection(db, 'bookmarks'),
    where('userId', '==', userId),
    where('eventId', '==', eventId),
  );
  const snap = await getDocs(q);

  if (snap.empty) {
    const ref = doc(collection(db, 'bookmarks'));
    await setDoc(ref, { userId, eventId, createdAt: serverTimestamp() });
    return true;
  }

  await deleteDoc(snap.docs[0].ref);
  return false;
}
