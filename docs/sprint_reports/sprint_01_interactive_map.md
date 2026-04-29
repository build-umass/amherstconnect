# Sprint Report — Interactive Map

**Theme:** Interactive Map Feature (Tasks 15–24)
**Completed:** 2026-04-26
**Contributors:** Anish Kamath, Kushagra Aitha

---

## Sprint Goal

Deliver the interactive map feature for Amherst Connect: a signed-in user should be able to see a live campus map with event pins placed at real UMass building coordinates, filter events by time window, tap a pin to see a preview sheet, view nearby events within walking distance, and get directions to any event — all built as standalone, reusable components against a shared data contract so Pranav's `useEvents()` hook can be dropped in without modifying any UI files.

---

## Tickets Delivered

| # | Ticket | Status | Primary | Notes |
|---|--------|--------|---------|-------|
| 15 | Google Maps integration | Done | Anish + Kush | Pair-landed. react-native-maps, API keys, location permissions. |
| 16 | Map screen + event pins | Done | Anish + Kush | MapScreen.tsx rendering markers from DUMMY_EVENTS. |
| 17 | useNearbyEvents hook + geoEvents.ts | Done | Anish + Kush | Haversine client-side filter. Mock version ships first. |
| 18 | Deep-link highlightedEventId | Pending* | Anish + Kush | Code written but commented, to be completed after Pranav finishes and useEvent hook is available |
| 19 | Overlay wiring | Done | Anish + Kush | TimeFilterBar, EventPreviewSheet, NearbyScrollList wired into MapScreen. |
| 20 | TimeFilterBar component | Done | Anish + Kush | Standalone controlled component. Consistent with Camila's chip styling. |
| 21 | EventPreviewSheet component | Done | Anish + Kush | Bottom sheet preview with directions and expand button. |
| 22 | NearbyScrollList component | Done | Anish + Kush | Horizontal scroll reusing Camila's EventCard. |
| 23 | openDirections utility | Done | Anish + Kush | iOS/Android platform-aware directions helper. |
| 24 | View on Map link on EventDetail | Pending* | Anish + Kush | Eventdetail to be completed by Pranav and willbe connected after that |

\* Tasks 18 and 24 are blocked on Pranav shipping EventDetail. All code is written and commented in `MapScreen.tsx` — uncomment when EventDetail is completed.

---

## Shared Contracts Locked

The following contracts were locked before development began so `MapScreen.tsx` and the standalone components could be built in parallel without blocking each other.

### `types/event.ts` — latitude and longitude added

Two optional fields were added to Camila's shared `Event` interface:

```ts
latitude?:  number;
longitude?: number;
```

They are optional so `EventCard`, `HomeScreen`, and `FeaturedEventCard` are completely unaffected. Only the map reads these fields.

### `types/navigation.ts` — Map param updated

The Map tab type was updated to accept an optional event ID for deep-linking from EventDetail:

```ts
Map: { highlightedEventId?: string };
```

### Component prop contracts exported

All three standalone components export their prop interfaces so `MapScreen` can import them with full TypeScript safety:

- `TimeFilterBarProps` — `value: TimeFilter`, `onChange: (filter: TimeFilter) => void`
- `EventPreviewSheetProps` — `event`, `walkLabel`, `onClose`, `onExpand`
- `NearbyScrollListProps` — `events`, `userLocationAvailable`, `getWalkLabel`, `onCardPress`

---

## What Was Built

### `src/screens/main/MapScreen.tsx`

Main map screen. Owns all state: `userLocation`, `selectedEvent`, `activeFilter`, `searchQuery`. Wires the three standalone components into their designated slots. Requests location permission on mount via `expo-location`. Filters events client-side by search query. Animates the map to center on a pin when tapped. Switches the bottom panel between `EventPreviewSheet` (when a pin is selected) and `NearbyScrollList` (default). Does not contain any Firestore code — all data comes from `DUMMY_EVENTS` for now.

### `src/components/map/TimeFilterBar.tsx`

Standalone controlled chip strip for time-based filtering. Accepts `value` and `onChange` props, owns no state internally. Chips: Now, Today, This Week, Campus. Positioned absolutely over the map below the search bar. Chip styling matches Camila's `CategoryFilterBar` exactly — same border width, border color, maroon active state, and font weight.

### `src/components/map/EventPreviewSheet.tsx`

Standalone bottom sheet that slides up when a map pin is tapped. Shows event category, title, time, location, and walking distance. Two action buttons: Get Directions (calls `openDirections` utility) and View Event (calls `onExpand` which will navigate to EventDetail when Pranav ships it). Has a decorative drag handle at the top. `hitSlop` added to the close button for easier tapping.

### `src/components/map/NearbyScrollList.tsx`

Standalone horizontal scroll list showing events within 800m of the user. Reuses Camila's `EventCard` component directly — since `Event` now has optional `lat/long` fields, `EventCard` is fully compatible with no changes. Shows a walking distance label below each card when location is available. Subtitle text switches between "Within 10 mins walk from you" and "Upcoming events on campus" based on whether location permission was granted.

### `src/services/geoEvents.ts`

Geo service containing the Haversine distance formula, `getWalkLabel` helper, and the `useNearbyEvents` hook. The hook accepts `userLocation` and `allEvents`, filters events within 800 metres, and returns the sorted nearby list. Ships a mock version — when no location is available it returns the first 3 events as a fallback. Kept separate from Pranav's `services/events.ts` to avoid a three-way merge conflict.

### `src/utils/openDirections.ts`

Platform-aware directions utility. Takes a location string, URL-encodes it, and opens the native maps app. Uses `maps:` scheme on iOS (Apple Maps) and `geo:` scheme on Android (Google Maps). Accepts a location string rather than a full `Event` object so it can be reused from EventDetail, ProfileScreen, or anywhere else without needing the whole event.

---

## Design Notes

All colors match Camila's established design system:

- `#8B1A1A` — maroon, used for active chips, pin borders, button fills, walk labels, See List link.
- `#1A1A1A` — near-black, used for event titles and panel headings.
- `#F2F2F2` — light gray, used for card image backgrounds.
- `#D0D0D0` — mid gray, used for inactive chip borders.

Pin design: white circular background with category-colored border and emoji center. Selected pin grows from 40px to 50px diameter with a thicker border. Each category has a distinct border color matching the `CATEGORY_COLOR` lookup table.

Search bar and filter chips are positioned absolutely over the map using `position: 'absolute'` — they float at the top of the map area without pushing the map down or reducing its height.

---

## Testing Performed

| Scenario | Result |
|----------|--------|
| Map renders centered on UMass campus | Pass |
| 6 event pins appear at correct building coordinates | Pass |
| Tapping a pin opens EventPreviewSheet | Pass |
| Map animates to center on tapped pin | Pass |
| Tapping map background dismisses preview sheet | Pass |
| NearbyScrollList shows events with walk distance labels | Pass |
| Tapping a nearby card selects event and pans map | Pass |
| Search bar filters pins by title and location | Pass |
| Get Directions opens native maps app | Pass |
| Time filter chips toggle active state correctly | Pass |
| Location permission denied — app shows fallback gracefully | Pass |
| Map renders on iOS Simulator via Expo Go | Could not check due  |

---

## Known Gaps

### 1. Mock data only
`MapScreen` and all map components consume `DUMMY_EVENTS` — a hardcoded array of 6 events with real UMass building coordinates. This will be replaced by Pranav's `useEvents()` hook when it ships. No structural changes to `MapScreen` or any component will be required — just replace `DUMMY_EVENTS` with the hook's return value.

### 2. Time filter chips are visual only
Tapping Now / Today / This Week / Campus changes the active chip UI but does not currently filter which pins appear on the map. Wiring `activeFilter` to `useEvents({ timeWindow: activeFilter })` is a one-line change once useEvent hook accepts a time parameter.

### 3. Tasks 18 and 24 blocked on EventDetail
Task 18 (deep-link pan to highlighted pin) and Task 24 (View on Map button on EventDetail) are both blocked until the EventDetail screen is shipped. The code for both is already written and commented in `MapScreen.tsx` — uncomment when EventDetail lands:

```ts
// Task 18: useEffect watching route.params.highlightedEventId
// Task 24: navigation.navigate('EventDetail', { eventId })
```

### 4. Firestore geo query not yet implemented
The sprint plan calls for a Firestore geo query in `geoEvents.ts` for production performance. Currently `useNearbyEvents` filters the in-memory event array client-side using Haversine. Replace with a Firestore geo query (geohash or bounding box) before scaling beyond a few hundred events.

### 5. Map pin icons are visually cropped on devices
The emoji/category icons rendered inside map pins are appearing slightly cropped/clipped. Pin containers and marker sizing needs final tuning to ensure icons display cleanly across all devices.


---

## Follow-Up Tickets (Recommended)

- Wire `activeFilter` to `useEvents({ timeWindow })` once Pranav's hook accepts a time parameter.
- Replace `DUMMY_EVENTS` with `useEvents()` hook return value (Ticket 11 dependency).
- Uncomment Task 18 deep-link `useEffect` once EventDetail ships.
- Add View on Map button to EventDetail footer slot (Task 24 — coordinate with Pranav).
- Replace client-side Haversine filter with Firestore geo query for production scale.
- Add pin clustering for when multiple events overlap at the same location.

---

## Commits & Branches

| Ref | What |
|-----|------|
| `feature/interactive-map` | All map files: MapScreen, TimeFilterBar, EventPreviewSheet, NearbyScrollList, geoEvents, openDirections, types/event.ts update, types/navigation.ts update |
