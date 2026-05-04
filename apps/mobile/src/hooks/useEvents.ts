import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../services/firebase';
import { Event, EventCategory, UseEventsParams } from '../types/event';

// ── Mock fallback data ────────────────────────────────────────────────────────
// Used when Firestore is empty or unavailable during development.

const MOCK_EVENTS: Event[] = [
  {
    id: '1',
    title: 'SASA Bollywood Night',
    category: 'Campus',
    date: 'Fri, May 1',
    time: '7:00 PM',
    location: 'Mullins Center',
    emoji: '💃',
    interested: 214,
    organizer: 'SASA',
    description: 'Join us for a night of Bollywood music, dance performances, and food!',
    isFree: true,
    isFeatured: true,
  },
  {
    id: '2',
    title: 'Lunar New Year Festival',
    category: 'Dining',
    date: 'Sat, May 2',
    time: '4:30 PM',
    location: 'Worcester Dining Commons',
    emoji: '🍜',
    organizer: 'Asian Student Association',
    description: 'Celebrate Lunar New Year with traditional food, performances, and activities.',
    isFree: true,
  },
  {
    id: '3',
    title: 'UMass vs. UConn Basketball',
    category: 'Sports',
    date: 'Sun, May 3',
    time: '7:00 PM',
    location: 'Mullins Center',
    emoji: '🏀',
    interested: 1200,
    organizer: 'UMass Athletics',
    description: 'Catch the Minutemen take on the Huskies in this exciting rivalry matchup.',
  },
  {
    id: '4',
    title: 'Fine Arts Gala 2026',
    category: 'Arts & Music',
    date: 'Sat, May 2',
    time: '5:00 PM',
    location: 'Fine Arts Center',
    emoji: '🎨',
    organizer: 'UMass Fine Arts',
    description: 'An evening showcasing student and faculty artwork across all mediums.',
    isFree: true,
  },
  {
    id: '5',
    title: "Campus Farmer's Market",
    category: 'Campus',
    date: 'Sat, May 2',
    time: '12:00 PM',
    location: 'Campus Pond',
    emoji: '🌿',
    organizer: 'UMass Sustainability',
    description: 'Shop fresh local produce, handmade goods, and artisan crafts from regional vendors.',
    isFree: true,
  },
  {
    id: '6',
    title: 'Late Night Comedy Show',
    category: 'Nightlife',
    date: 'Fri, May 1',
    time: '9:30 PM',
    location: 'Amherst Coffee',
    emoji: '🎤',
    organizer: 'UMass Stand-Up Club',
    description: 'Student comedians take the stage for a night of laughs. All are welcome!',
    isFree: true,
  },
];

// ── Filter helper ─────────────────────────────────────────────────────────────

function applyFilters(data: Event[], category?: EventCategory, search?: string): Event[] {
  if (category && category !== 'All') {
    data = data.filter((e) => e.category === category);
  }
  if (search && search.trim().length > 0) {
    const q = search.toLowerCase();
    data = data.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        e.location.toLowerCase().includes(q) ||
        (e.organizer?.toLowerCase().includes(q) ?? false),
    );
  }
  return data;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

interface UseEventsResult {
  events: Event[];
  loading: boolean;
  error: string | null;
}

export function useEvents({ category, search }: UseEventsParams = {}): UseEventsResult {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchEvents() {
      setLoading(true);
      setError(null);

      try {
        const snapshot = await getDocs(collection(db, 'events'));
        if (cancelled) return;

        let data: Event[] = snapshot.empty
          ? MOCK_EVENTS
          : (snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Event[]);

        // Client-side filtering — avoids composite index requirement
        if (category && category !== 'All') {
          data = data.filter((e) => e.category === category);
        }

        if (search && search.trim().length > 0) {
          const q = search.toLowerCase();
          data = data.filter(
            (e) =>
              e.title.toLowerCase().includes(q) ||
              e.location.toLowerCase().includes(q) ||
              (e.organizer?.toLowerCase().includes(q) ?? false),
          );
        }

        setEvents(data);
      } catch (err) {
        if (cancelled) return;
        // Firestore unavailable —> fall back to mock data and apply filters
        console.warn('[useEvents] Firestore unavailable, using mock data:', err);
        let data = MOCK_EVENTS;

        if (category && category !== 'All') {
          data = data.filter((e) => e.category === category);
        }

        if (search && search.trim().length > 0) {
          const q = search.toLowerCase();
          data = data.filter(
            (e) =>
              e.title.toLowerCase().includes(q) ||
              e.location.toLowerCase().includes(q) ||
              (e.organizer?.toLowerCase().includes(q) ?? false),
          );
        }

        setEvents(data);
        setError(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchEvents();
    return () => { cancelled = true; };
  }, [category, search]);

  return { events, loading, error };
}
