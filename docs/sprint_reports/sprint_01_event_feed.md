# Sprint Report — Event Feed

**Theme:** Event Feed + Search  
**Completed:** 2026-04-26  
**Contributors:** Camila Rivera de Jesus, Pranav Ravi Buregoni

---

## Sprint Goal

Deliver the Home screen UI for Amherst Connect: a signed-in user should be able to see a featured event for tonight, browse upcoming events grouped by category, and filter the list by category — all wired to a shared data contract so Pranav's `useEvents()` hook can be dropped in without touching any UI files.

---

## Tickets Delivered

| # | Ticket | Status | Primary | Assist |
| --- | --- | --- | --- | --- |
| 8 | Home screen layout | Done | Camila | — |
| 9 | Event card component | Done | Camila | — |
| 10 | Category filter UI | Done | Camila | — |
| 11 | Search bar slot wiring | Pending | Camila | Pranav |
| — | Shared type contracts (`types/event.ts`) | Done | Camila | — |

Ticket 11 is pending Pranav shipping `<SearchBar />` and `useEvents()`. The slot is reserved in `HomeScreen.tsx` — wiring it in requires no structural changes to the screen.

---

## What Was Built

### `src/screens/HomeScreen.tsx`
Main home screen layout. Renders the header, search bar, `FeaturedEventCard`, `CategoryFilterBar`, and the Upcoming This Week event list. Manages two pieces of local state: `selectedCategory` and `searchQuery`. Filters the mock `ALL_EVENTS` array client-side — will be replaced by `useEvents({ category, search })` once Pranav's hook is ready. Does not contain any Firestore code.

### `src/components/FeaturedEventCard.tsx`
Displays the highlighted event for the night. Navy image area with a TONIGHT badge, event title, date, time, location, and interested count. Accepts a `FeaturedEvent` prop — isolated from the main `Event` type so the featured slot can be independently managed (e.g. curated vs. algorithmic).

### `src/components/CategoryFilterBar.tsx`
Horizontally scrollable chip strip for category filtering. Categories: All, Campus, Dining, Sports, Nightlife, Arts & Music. Fully controlled — accepts `selected` and `onSelect` props, owns no state internally. Designed to be reusable on other screens (e.g. Deals tab).

### `src/components/EventCard.tsx`
Reusable event card used in the feed, and available for Sonny's saved events list on the Profile screen. Left side: emoji icon in a category-colored rounded square. Right side: category label (uppercase, color-coded), event title, date/time, location, and optional interested count. Imports its types from `src/types/event.ts`.

### `src/types/event.ts`
Shared type contracts for the Event Feed section. Contains:
- `EventCategory` — union type of all valid categories.
- `Event` — core event shape that Pranav's `useEvents()` hook must return.
- `EventCardProps` — locked prop contract for `<EventCard />` so others can import the component safely.
- `SearchBarProps` — Pranav's component contract documented here so both sides stay aligned.
- `UseEventsParams` — `{ category, search }` hook signature

### `src/navigation/MainTabs.tsx` (updated)
- Imported `HomeScreen` and replaced the `Placeholder('Home')` with it.
- `AppNavigator.tsx` was intentionally left untouched, auth entry point should notbe modified

---

## Design Notes

Colors match the wireframe for homescreen:
- `#8B1A1A` — maroon, used for "Connect" logotype, active filter chip, tab bar tint, and "See All" links.
- `#1E3263` — navy, used as the featured card image area background.
- `#F0A030` — amber, used for the TONIGHT badge.
- `#F2F2F2` — light gray page background.
- `#E87722` — orange, used for the user avatar.

---

## Testing Performed

| Scenario | Result |
| --- | --- |
| Home screen renders on iOS simulator | Pass |
| Home screen renders on Android emulator | Pass |
| Category chips filter the event list correctly | Pass |
| Search input filters by title and location | Pass |
| Empty state displays when no events match | Pass |
| "All" chip resets to full list | Pass |

---

## Known Gaps

1. **Mock data only.** `HomeScreen` and `EventCard` consume a hardcoded `ALL_EVENTS` array. This will be swapped for `useEvents({ category, search })` in ticket 11 once Pranav's hook is ready — no structural changes to the UI required.
2. **Search bar slot not yet wired.** The current search input is a local `TextInput`. It will be replaced by Pranav's `<SearchBar />` component (ticket 13) and connected to `useEvents({ search })`.
3. **Featured event is static.** `FEATURED_EVENT` is a hardcoded constant. Once the data layer is live, this should pull the top event for the current day from Firestore.
4. **No cover images.** Emoji placeholders are used in `EventCard` and a flat navy background in `FeaturedEventCard`. Real cover images will require Firestore `imageUrl` fields and `expo-image`.

---

## Follow-Up Tickets (Recommended)

- Wire `useEvents({ category, search })` once Pranav's hook is ready (ticket 11).
- Replace local `TextInput` with Pranav's `<SearchBar />` (ticket 13 dependency).
- Replace mock `ALL_EVENTS` and `FEATURED_EVENT` with live Firestore data.
- Add cover image support to `EventCard` and `FeaturedEventCard` via `expo-image`.

---

## Commits & Branches

| Ref | What |
| --- | --- |
| `feature/event-feed` | Home screen layout, EventCard, CategoryFilterBar, FeaturedEventCard, shared types, MainTabs wired, sprint report |
