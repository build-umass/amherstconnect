# Sprint 1 — Plan

---

## Goal

- **Authentication & Onboarding:** Stand up authentication and onboarding so a user can create an account (email or Google), pick a role, pick their interests, and land in the main app — with the right guards keeping them out of screens they shouldn't see.
- **Event Feed + Search:** Ship a browsable home feed backed by Firestore so a signed-in user can see upcoming events, filter by category, search by title/location/category, and open an event detail view.
- **Interactive Map:** Ship a map view of events so a signed-in user can see event pins on Google Maps, filter by time (Now / Today / This Week / Campus), tap a pin to preview an event, browse a nearby-happenings list, get directions, and jump from Event Detail to the map with the right pin highlighted.
- **Deals Tab + Resource Directory:** Ship a Deals tab so a signed-in user can browse active business deals, filter by category, and claim a discount code — plus a searchable Community Resource Directory for non-event resources.
- **Profile + Bookmarks + Notifications:** Ship a profile screen with saved events, an edit-interests flow, a settings screen with log out, a bookmark toggle on Event Detail, and push notifications for new matching events and upcoming saved events.

---

## Tasks

### Authentication & Onboarding

| # | Task | Owner | Notes |
| --- | --- | --- | --- |
| 1 | Firebase Auth integration | Brian | Email/password, Google OAuth, session persistence across app restarts. |
| 2 | Route guard logic | Brian | Redirect unauthenticated users to login. Redirect users with incomplete onboarding into the onboarding flow. |
| 3 | Firestore user + profile creation | Brian | On sign-up, create `users` doc and the role-based profile doc (`student_profiles`, etc.). |
| 4 | Login screen | Shreyansh | Email/password fields, Google sign-in button, link to sign-up. |
| 5 | Sign-up screen | Shreyansh | Email/password fields, validation, error handling (email already exists, weak password, etc.). |
| 6 | Role selection screen (onboarding 1) | Shreyansh | Student / Faculty & Staff / Alumni / Local Resident. Saves role to `users` doc. |
| 7 | Interest tag screen (onboarding 3) | Shreyansh | Multi-select interest tags (Dining, Music, Sports, Cultural, RSO, etc.). Saves to Firestore. |

### Event Feed + Search

Split along **presentation vs data** to keep each person in their own files and minimize merge conflicts on `HomeScreen.tsx` and the query layer. Camila owns everything that renders on the Home screen; Pranav owns the data layer, the standalone `SearchBar` component, and the Event Detail screen.

| # | Task | Owner | Notes |
| --- | --- | --- | --- |
| 8 | Home screen layout | Camila | Featured event card, category filter bar (scrollable chips), Upcoming This Week list. Header with logo and profile avatar. Consumes `useEvents()` hook — does not query Firestore directly. |
| 9 | Event card component | Camila | Reusable card: cover image, category tag, title, date/time, location. Used in feed, map preview, and profile saved list. Props locked via `EventCardProps` contract. |
| 10 | Category filter UI | Camila | Chip strip on Home screen. Owns local `selectedCategory` state and passes it as a param into `useEvents({ category })`. No Firestore code in this task. |
| 11 | Search bar slot wiring | Camila | Imports Pranav's `<SearchBar />` into Home screen, lifts `search` state, passes it into `useEvents({ search })`. |
| 12 | Firestore event queries + `useEvents` hook | Pranav | Single owner of `services/events.ts`. Exposes `useEvents({ category, search })` — fetches events ordered by `start_time`, applies category filter, applies search filter. Paginates. Ships a mock/seed version on day 1 to unblock Camila. |
| 13 | Search bar component | Pranav | Standalone `SearchBar.tsx`: input + debounce + `onChange`. Lives in its own file; does not touch `HomeScreen.tsx`. Props locked via `SearchBarProps` contract. |
| 14 | Event Detail screen | Pranav | Full event view: cover image, title, organizer, date/time, location, getting there section, save/bookmark button, share button. Isolated route — no shared files with Camila. |

#### Shared contracts (lock before either starts)

Land these in one small PR so both branches inherit them:

- `apps/mobile/src/types/event.ts` — `Event` shape.
- `useEvents({ category, search })` hook signature (mock return on day 1, real Firestore after).
- `EventCardProps`.
- `SearchBarProps` (`value`, `onChange`, `placeholder`).

#### Merge order (to avoid blocking)

1. Pranav: `types/event.ts` + `services/events.ts` stub + `useEvents` hook (mock data). **Unblocks Camila.**
2. Camila: Event card + Home screen layout, consuming the hook.
3. Pranav (parallel): real Firestore queries with category + search params, and `SearchBar` component.
4. Camila: wires category chips and `<SearchBar />` slot into Home screen.
5. Pranav: Event Detail screen.

### Interactive Map

Split along **canvas vs overlays** — every map task naturally lives on `MapScreen.tsx`, so one person owns the screen + the map engine and the other ships standalone overlay components that get dropped into designated slots. Anish owns the map canvas and the nearby-events data; Kush owns the overlay components and the cross-feature integrations (Get Directions, View on Map from Event Detail).

| # | Task | Owner | Notes |
| --- | --- | --- | --- |
| 15 | Google Maps integration | Anish + Kush | Set up `react-native-maps` with Google Maps provider. Handle iOS and Android config separately (API keys, permissions). **Pair-landed** in one PR before either person starts on downstream tasks. |
| 16 | Map screen + event pins | Anish | Owns `MapScreen.tsx`. Renders EVENTS as markers via Pranav's `useEvents()` hook. Category-based icons/colors. Cluster overlapping pins. Tap handler sets `selectedEventId` → opens Kush's preview sheet. |
| 17 | Nearby events service + `useNearbyEvents` hook | Anish | New file `services/geoEvents.ts` — Firestore geo query or Haversine filtering against user location. Exposes `useNearbyEvents(userLocation)`. Kept separate from Pranav's `services/events.ts` to avoid a three-way conflict. Ships a mock version day 1 to unblock Kush. |
| 18 | Deep-link handling on MapScreen | Anish | Reads `route.params.highlightedEventId` and pans/zooms to the matching pin with a highlighted state. |
| 19 | Overlay wiring | Anish | Imports Kush's `<TimeFilterBar />`, `<EventPreviewSheet />`, `<NearbyScrollList />` and places them in designated slots on MapScreen. Lifts `selectedTimeFilter` + `selectedEventId` state. |
| 20 | Time filter bar component | Kush | Standalone `TimeFilterBar.tsx`: scrollable chips (Now / Today / This Week / Campus). Controlled component (`value`, `onChange`). Does not touch `MapScreen.tsx`. |
| 21 | Tap-to-preview bottom sheet | Kush | Standalone `EventPreviewSheet.tsx`: bottom sheet with preview card (event name, time, distance) and "Expand" button that calls `onExpand(eventId)` to navigate to Event Detail. |
| 22 | Nearby Happenings scroll list | Kush | Standalone `NearbyScrollList.tsx`: horizontal scroll of events within walking distance. Consumes `useNearbyEvents`. Reuses Camila's `<EventCard />`. |
| 23 | Get Directions utility | Kush | `openDirections(event)` helper — opens the Google Maps app with the event location pre-filled as destination. Used by preview sheet and Event Detail. |
| 24 | "View on Map" link on Event Detail | Kush | Adds a button on Event Detail that calls `navigation.navigate('Map', { highlightedEventId })`. Coordinate with Pranav to leave a slot in the detail screen footer. |

#### Shared contracts (lock before either starts)

- `types/navigation.ts` — add `MapStackParamList` with `Map: { highlightedEventId?: string }`.
- `useNearbyEvents(userLocation)` hook signature (mock return on day 1, real geo query after).
- `TimeFilterBarProps`, `EventPreviewSheetProps`, `NearbyScrollListProps`.
- Agreement with Pranav: Event Detail leaves a footer slot for Kush's "View on Map" button.

#### Merge order (to avoid blocking)

1. Anish + Kush together: Google Maps integration (env config, API keys, iOS/Android permissions). **Single PR, lands first.**
2. Anish: MapScreen with pins rendered from Pranav's existing `useEvents()` hook. No filter, no sheet yet — just a working map.
3. Kush (parallel): ships `TimeFilterBar`, `EventPreviewSheet`, `NearbyScrollList` as standalone components with mock props.
4. Anish: adds `useNearbyEvents` service + wires all three of Kush's components into MapScreen slots + handles `highlightedEventId` param.
5. Kush: adds `openDirections` utility + "View on Map" button on Event Detail.

### Deals Tab + Resource Directory

Split along **UI owner vs data owner** — two distinct surfaces (Deals and Resource Directory) are bundled together, so Maya owns the entire Deals UI and Damian owns the data layer for both features plus the standalone Resource Directory screen. No shared files except contracts.

| # | Task | Owner | Notes |
| --- | --- | --- | --- |
| 25 | Deals tab layout | Maya | Owns `DealsScreen.tsx`. Category filter bar, Trending Deals section header, deal card list. Match Figma styling. Consumes `useDeals()` hook — does not query Firestore directly. |
| 26 | Deal card component | Maya | Reusable `DealCard.tsx`: business name, offer title, category tag, expiry time, Claim button. Props locked via `DealCardProps` contract. |
| 27 | Deals category filter UI | Maya | Chip strip on Deals screen (All / Dining / Coffee / Retail / Nightlife). Owns local `selectedCategory` state and passes it into `useDeals({ category })`. No Firestore code in this task. |
| 28 | Claim discount code flow (UI) | Maya | Tap handler on Claim button + `ClaimCodeModal.tsx` (or inline reveal) with copy-to-clipboard. Calls Damian's `claimDeal(dealId)` service. |
| 29 | Firestore deals + resources queries | Damian | Single owner of `services/deals.ts` and `services/resources.ts`. Exposes `useDeals({ category })` (fetches active deals: `is_active=true`, `expiry > now`, category filter) and `useResources({ search, category })`. Ships mock versions day 1 to unblock Maya. |
| 30 | Claim discount code service | Damian | `claimDeal(dealId): Promise<string>` — reads `discount_code` from Firestore. Consider one-time reveal vs simple display (decide with Maya). |
| 31 | Community Resource Directory | Damian | Owns `ResourcesScreen.tsx` + `ResourceCard.tsx`. Searchable list of community resources (separate from events, no dates). Resource card: name, category, description, external link. Reuses Pranav's `<SearchBar />` component. Isolated screen — no shared files with Maya. |

#### Shared contracts (lock before either starts)

- `apps/mobile/src/types/deal.ts` — `Deal` shape (business, offer, category, expiry, discount_code).
- `apps/mobile/src/types/resource.ts` — `Resource` shape (name, category, description, external link).
- `useDeals({ category })` hook signature (mock return on day 1, real Firestore after).
- `useResources({ search, category })` hook signature.
- `claimDeal(dealId): Promise<string>` signature.
- `DealCardProps`, `ResourceCardProps`.
- Dependency on Event Feed section: Damian's `ResourcesScreen` imports Pranav's `<SearchBar />` — coordinate a stable export path.

#### Merge order (to avoid blocking)

1. Damian: `types/deal.ts` + `types/resource.ts` + service stubs + hooks (mock data). **Unblocks Maya.**
2. Maya (parallel): `DealCard` + `DealsScreen` layout consuming mock `useDeals()`.
3. Damian: `ResourcesScreen` + `ResourceCard` + real Firestore queries for both deals and resources.
4. Maya: category chips on DealsScreen + Claim flow UI calling mocked `claimDeal`.
5. Damian: real `claimDeal` service implementation.

### Profile + Bookmarks + Notifications

Split along **screens vs services + notification backend** — three surfaces (Profile, Bookmarks, Notifications) are bundled together, so Sonny owns all user-facing screens in this section and Brian owns the data layer, the standalone `BookmarkButton` that lives on Event Detail, and the entire notification backend. This leverages Brian's existing ownership of the auth/infra layer.

| # | Task | Owner | Notes |
| --- | --- | --- | --- |
| 32 | Profile screen layout | Sonny | Owns `ProfileScreen.tsx`. Name, role badge, stats row (events, following, saved), Saved Events + My RSVPs tabs, Settings gear icon. Consumes `useSavedEvents()` hook. |
| 33 | Saved Events list UI | Sonny | Saved tab inside ProfileScreen. Renders Camila's `<EventCard />` for each bookmark. Tap navigates to Event Detail. |
| 34 | Edit Interests screen | Sonny | Owns `EditInterestsScreen.tsx`. Reuses Shreyansh's interest tag selector from onboarding. Calls `updateInterests(interests)` service. |
| 35 | Settings screen | Sonny | Owns `SettingsScreen.tsx`. Notification preference toggles, Edit Profile link, Log Out button (calls Brian's existing `signOut()` from `services/auth.ts`). |
| 36 | Bookmark service + `useSavedEvents` hook | Brian | Single owner of `services/bookmarks.ts`. Reads BOOKMARKS for current user, orders by `createdAt`, joins with events. Exposes `toggleBookmark(eventId)` and `useSavedEvents()`. Ships mock version day 1 to unblock Sonny. |
| 37 | Bookmark button component | Brian | Standalone `BookmarkButton.tsx`. Optimistic UI, calls `toggleBookmark(eventId)`. Dropped into Event Detail via a slot (coordinate with Pranav). Props locked via `BookmarkButtonProps` contract. |
| 38 | Interest update service | Brian | `updateInterests(interests: string[]): Promise<void>` — writes to the user's profile doc in Firestore. Called by Sonny's Edit Interests screen. |
| 39 | Push notifications setup | Brian | Owns `services/notifications.ts`. Expo Push Notifications + Firebase Cloud Messaging. Register device token on login. Store token in USERS doc. |
| 40 | Notification triggers | Brian | Cloud Functions (or equivalent) for "new event matching user interests" and "saved event starting soon". Writes to NOTIFICATIONS collection. |

#### Shared contracts (lock before either starts)

- `apps/mobile/src/types/bookmark.ts` — `Bookmark` shape (userId, eventId, createdAt).
- `useSavedEvents()` hook signature (mock return day 1, real Firestore after).
- `toggleBookmark(eventId): Promise<boolean>` — returns new bookmarked state.
- `BookmarkButtonProps` — standalone component contract.
- `updateInterests(interests: string[]): Promise<void>` signature.
- `registerPushToken(): Promise<void>` signature.
- **Cross-section dependencies:**
  - Pranav: Event Detail leaves a slot for Brian's `<BookmarkButton />` (header or title row).
  - Shreyansh: exports the onboarding `<InterestTagSelector />` from a stable path so Sonny can reuse it in Edit Interests.
  - Camila: `<EventCard />` exported from a stable path so Sonny's Saved Events list can render it.

#### Merge order (to avoid blocking)

1. Brian: `types/bookmark.ts` + `services/bookmarks.ts` stub + `useSavedEvents()` hook (mock) + `BookmarkButton.tsx` with mocked toggle. **Unblocks Sonny and Pranav.**
2. Sonny (parallel): `ProfileScreen.tsx` layout with tabs, consuming mock `useSavedEvents()`.
3. Brian: real bookmark Firestore writes/reads + drops `<BookmarkButton />` onto Event Detail slot.
4. Sonny: `SettingsScreen.tsx` + `EditInterestsScreen.tsx` (reuses onboarding selector, calls mocked `updateInterests`).
5. Brian: `updateInterests` service + push notifications setup + notification triggers.
