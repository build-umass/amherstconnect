// ── Shared Event types ────────────────────────────────────────────────────────
// Single source of truth for the Event shape and component prop contracts.
// Events are read through the E02 repository (services/eventRepository.ts) and
// mapped into this display shape by eventFeed.ts, eventDetailsView.ts and
// mapEvents.ts. Do not redefine these inline in component files.

export type EventCategory =
  | 'All'
  | 'Campus'
  | 'Dining'
  | 'Sports'
  | 'Nightlife'
  | 'Arts & Music'
  | 'Talks & Lectures'
  | 'Workshops & Classes'
  | 'Arts & Culture'
  | 'Sports & Recreation'
  | 'Career & Networking'
  | 'Health & Wellness'
  | 'Social & Community'
  | 'Food & Drink';

/** Display shape for event cards, map pins and Event Details. `id` is the canonical event ID. */
export interface Event {
  id: string;
  title: string;
  category: EventCategory;
  /** Display date string, e.g. "Sat, Apr 26" */
  date: string;
  /** Display time string, e.g. "6:00 PM" */
  time: string;
  location: string;
  /** Category emoji, shown when the event has no image. */
  emoji: string;
  latitude?: number;
  longitude?: number;
  // Detail screen fields
  organizer?: string;
  description?: string;
  isFree?: boolean;
}

/**
 * Featured event variant. Renders with its own hero treatment, so it doesn't
 * carry a category or emoji. `interested` is required because the featured
 * card always shows the count.
 */
export interface FeaturedEvent extends Omit<Event, 'category' | 'emoji'> {
  interested: number;
}

/** Props contract for <EventCard />. Locked so teammates can depend on it. */
export interface EventCardProps {
  event: Event;
  onPress?: () => void;
}

/** Props contract for <SearchBar />. */
export interface SearchBarProps {
  value: string;
  onChange: (text: string) => void;
  placeholder?: string;
}
