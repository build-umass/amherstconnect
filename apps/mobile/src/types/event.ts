// ── Shared Event types ────────────────────────────────────────────────────────
// Single source of truth for the Event shape and component prop contracts.
// Both the data layer (useEvents hook, Firestore service) and UI components
// import from here. Do not redefine these inline in component files.

export type EventCategory =
  | 'All'
  | 'Campus'
  | 'Dining'
  | 'Sports'
  | 'Nightlife'
  | 'Arts & Music';

/** Core event shape — mirrors the Firestore `events` collection document. */
export interface Event {
  id: string;
  title: string;
  category: EventCategory;
  /** Display date string, e.g. "Sat, Apr 26" */
  date: string;
  /** Display time string, e.g. "6:00 PM" */
  time: string;
  location: string;
  /** Emoji used as a placeholder icon until real cover images are available. */
  emoji: string;
  interested?: number;
}

/** Props contract for <EventCard />. Locked so teammates can depend on it. */
export interface EventCardProps {
  event: Event;
  onPress?: () => void;
}

/** Props contract for <SearchBar /> (owned by Pranav — imported here for reference). */
export interface SearchBarProps {
  value: string;
  onChange: (text: string) => void;
  placeholder?: string;
}

/** Params for the useEvents hook. */
export interface UseEventsParams {
  category?: EventCategory;
  search?: string;
}
