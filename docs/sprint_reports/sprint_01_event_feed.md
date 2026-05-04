# Sprint Report — Event Feed

**Theme:** Event Feed + Search  
**Completed:** 2026-05-02  
**Contributors:** Camila Rivera de Jesus

---

## Sprint Goal

Deliver the Home screen UI for Amherst Connect: a signed-in user should be able to see a featured event for tonight, browse upcoming events grouped by category, filter the list by category, search live, and tap an event to view its full detail screen — all wired to Firestore with a shared data contract.

---

## Tickets Delivered

| # | Ticket | Status | Primary | Assist |
| --- | --- | --- | --- | --- |
| 8 | Home screen layout | Done | Camila | — |
| 9 | Event card component | Done | Camila | — |
| 10 | Category filter UI | Done | Camila | — |
| 11 | Search bar + useEvents wiring | Done | Camila | — |
| — | Shared type contracts (`types/event.ts`) | Done | Camila | — |
| — | `SearchBar` component | Done | Camila | — |
| — | `useEvents` hook (Firestore) | Done | Camila | — |
| — | `EventDetailScreen` | Done | Camila | — |
| — | `HomeStack` navigator | Done | Camila | — |
| — | Navigation types updated | Done | Camila | — |
| — | Firestore `events` collection seeded | Done | Camila | — |
| — | View on Map deep-link | Done | Camila | — |

---

## What Was Built

### `src/screens/HomeScreen.tsx`
Main home screen layout. Renders the header, search bar, `FeaturedEventCard`, `CategoryFilterBar`, and the Upcoming This Week event list. Manages two pieces of local state: `selectedCategory` and `searchQuery`. Wired to `useEvents({ category, search })` for live Firestore-backed filtering. Tapping any event card navigates to `EventDetailScreen` via the HomeStack.

### `src/components/FeaturedEventCard.tsx`
Displays the highlighted event for the night. Navy image area with a TONIGHT badge, event title, date, time, location, and interested count. Accepts a `FeaturedEvent` prop — isolated from the main `Event` type so the featured slot can be independently managed (e.g. curated vs. algorithmic).

### `src/components/CategoryFilterBar.tsx`
Horizontally scrollable chip strip for category filtering. Categories: All, Campus, Dining, Sports, Nightlife, Arts & Music. Fully controlled — accepts `selected` and `onSelect` props, owns no state internally. Designed to be reusable on other screens (e.g. Deals tab).

### `src/components/EventCard.tsx`
Reusable event card used in the feed, and available for the saved events list on the Profile screen. Left side: emoji icon in a category-colored rounded square. Right side: category label (uppercase, color-coded), event title, date/time, location, and optional interested count. Imports its types from `src/types/event.ts`. Null-safe category lookup added (`?? FALLBACK`) to prevent crashes on unexpected category values.

### `src/components/SearchBar.tsx`
Debounced search input (300ms). Controlled via `SearchBarProps` — `value`, `onChange`, `placeholder`. Shows a ✕ clear button when text is present. Clears the debounce timer on manual clear to avoid a stale empty-string callback firing after the instant clear.

### `src/hooks/useEvents.ts`
Fetches all documents from the Firestore `events` collection with a simple `getDocs` (no compound query — avoids composite index requirement). Falls back to 6 hardcoded mock events if the collection is empty or Firestore is unavailable. Applies category and search filtering client-side via an extracted `applyFilters()` helper. Uses a `cancelled` flag to prevent state updates after unmount.

### `src/screens/main/EventDetailScreen.tsx`
Full event detail screen matching the wireframe:
- Navy hero with category-colored emoji block, TONIGHT (amber) and FREE badges, back/share/bookmark icon buttons positioned below the notch via `useSafeAreaInsets`
- Category pill chip, title, "by **Organizer** · 👥 count" combined line
- Meta card with labeled DATE / TIME / LOCATION rows separated by dividers
- About this event and Getting There section cards
- Sticky two-button footer: "Going?" (green outline, toggles on tap) + "View on Map" (maroon filled, navigates to Map tab)

### `src/navigation/HomeStack.tsx`
Native stack navigator wrapping `HomeScreen` (no header) and `EventDetailScreen` (no header — screen manages its own back button in the hero).

### `src/types/event.ts`
Shared type contracts for the Event Feed section. Contains:
- `EventCategory` — union type of all valid categories.
- `Event` — core event shape returned by `useEvents()`. Added detail fields: `organizer?`, `description?`, `isFree?`, `isFeatured?`.
- `EventCardProps` — locked prop contract for `<EventCard />` so others can import the component safely.
- `SearchBarProps` — component contract documented here so both sides stay aligned.
- `UseEventsParams` — `{ category, search }` hook signature

### `src/types/navigation.ts`
Added `HomeStackParamList` (`HomeScreen: undefined`, `EventDetail: { event: Event }`). Updated `MainTabParamList.Home` from `undefined` to `NavigatorScreenParams<HomeStackParamList>`.

### `src/navigation/MainTabs.tsx` (updated)
Swapped `HomeScreen` for `HomeStack` on the Home tab so `EventDetailScreen` is reachable within the stack. `AppNavigator.tsx` was intentionally left untouched — auth entry point should not be modified.

### `scripts/seedEvents.mjs` *(not committed)*
One-time Node script using the Firebase JS SDK. Deletes all existing documents in the `events` collection and writes 6 canonical events with all required fields. Run with `node scripts/seedEvents.mjs` from `apps/mobile/`.

---

## Design Notes

Colors match the wireframe for homescreen:
- `#8B1A1A` — maroon, used for "Connect" logotype, active filter chip, tab bar tint, and "See All" links.
- `#1A2B4A` — navy, used as the featured card and EventDetail hero background.
- `#F59E0B` — amber, used for the TONIGHT badge.
- `#2D7A45` — green, used for the Going button border and active state.
- `#F2F2F2` — light gray page background.
- `#E87722` — orange, used for the user avatar.

Category colors consistent across EventCard, EventDetailScreen, and MapScreen:
- Campus `#98190b` / `#E8F5EE` · Dining `#C45C00` / `#FFF0E0` · Sports `#2e61c7` / `#FFF3E0`
- Nightlife `#5B2A8A` / `#F3EDF9` · Arts & Music `#bd1479` / `#F9EDF5`

---

## Testing Performed

| Scenario | Result |
| --- | --- |
| Home screen renders on iOS simulator | Pass |
| Home screen renders on Android emulator | Pass |
| All 6 Firestore events appear on All tab | Pass |
| Category chips filter the event list correctly | Pass |
| Search filters live across title, location, organizer | Pass |
| Empty state displays when no events match | Pass |
| "All" chip resets to full list | Pass |
| Tapping an event card opens EventDetailScreen | Pass |
| Detail screen hero buttons sit below notch | Pass |
| TONIGHT and FREE badges display correctly | Pass |
| Going? button toggles green on tap | Pass |
| View on Map navigates to Map tab | Pass |
| Back button returns to Home | Pass |

---

## Known Gaps

1. **Featured event is static.** `FEATURED_EVENT` is a hardcoded constant. Should eventually pull the top `isFeatured` event from Firestore.
2. **No cover images.** Emoji placeholders are used in `EventCard` and `FeaturedEventCard`. Real cover images will require Firestore `imageUrl` fields and `expo-image`.
3. **View on Map ID mismatch.** Map tab's `DUMMY_EVENTS` uses different IDs than Firestore. Resolved once MapScreen migrates to `useEvents()`.
4. **Share button is decorative.** The 📤 icon in the EventDetail hero has no handler yet — wire with React Native's `Share` API.

---

## Follow-Up Tickets (Recommended)

- Pull `isFeatured` event dynamically from Firestore for the Featured Tonight slot.
- Add cover image support to `EventCard` and `FeaturedEventCard` via `expo-image`.
- Wire the share button on EventDetail using React Native's `Share` API.
- Migrate MapScreen from `DUMMY_EVENTS` to `useEvents()` so View on Map highlights correctly end-to-end.

---

## Commits & Branches

| Ref | What |
| --- | --- |
| `feature/event-feed` | Home screen layout, EventCard, CategoryFilterBar, FeaturedEventCard, SearchBar, useEvents, HomeStack, EventDetailScreen, navigation types, MainTabs wired, shared types updated, Firestore seeded |
