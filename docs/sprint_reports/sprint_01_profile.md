# Sprint Report — Profile + Bookmarks

**Theme:** Profile screen, saved events, edit interests, settings  
**Completed:** 2026-04-28  
**Contributors:** Sonny Zhang

---

## Sprint Goal

Deliver the Profile section of Amherst Connect: a signed-in user should be able to view their identity and stats, browse saved events and RSVPs in tabbed lists, edit their interest tags, access a settings screen with notification toggles and log out, and navigate between these surfaces — all wired to Firestore via a shared `useSavedEvents()` hook and `updateInterests()` service so Brian's bookmark/notification backend can be dropped in without touching any UI files.

---

## Tickets Delivered

| # | Ticket | Status | Primary | Notes |
|---|--------|--------|---------|-------|
| 32 | Profile screen layout | Done | Sonny | Header, avatar, role badge, stats row, interests, tabs, settings gear. Consumes `useSavedEvents()` hook. |
| 33 | Saved Events list UI | Done | Sonny | Saved tab renders Camila's `<EventCard />` for each bookmark. Tap shows event info (EventDetail pending Pranav). |
| 34 | Edit Interests screen | Done | Sonny | Reuses onboarding interest tag selector. Calls `updateInterests()` service, refreshes user, navigates back. |
| 35 | Settings screen | Done | Sonny | Notification preference toggles, Edit Interests link, account info, Log Out with confirmation. |

---

## What Was Built

### `src/screens/main/ProfileScreen.tsx`

Full profile screen rewrite. Dark maroon header with "My Profile" title and settings gear icon (navigates to Settings). Circular avatar showing user's initial letter (falls back from `photoURL`) with a camera/edit overlay. Display name and translucent role badge pill. Stats row (Events from RSVP count, Following placeholder, Saved from bookmarks). My Interests section with emoji-prefixed chips and Edit link. Tabbed content switching between Saved Events and My RSVPs, each rendering `<EventCard />` with `onPress` handlers. Consumes `useSavedEvents()` hook from `services/bookmarks.ts`. Does not own any Firestore query logic directly for bookmarks.

### `src/screens/main/SettingsScreen.tsx`

Grouped card layout with three sections. Account section shows name, email (read-only), and an "Edit Interests" row that navigates to `EditInterestsScreen`. Notifications section has two `Switch` toggles: "New events for you" and "Saved event reminders" (local state — will be persisted once Brian ships notification preferences in Firestore). Log Out button with a destructive confirmation dialog calling `logout()` from `services/auth.ts`. App version footer.

### `src/screens/main/EditInterestsScreen.tsx`

Reuses the exact `INTERESTS` array and toggle chip pattern from Shreyansh's `InterestSelectionScreen`. Pre-populates with the user's current interests from `appUser.interests`. Save button calls `updateInterests(uid, interests)` → writes to Firestore → calls `refreshUser()` to update local state → navigates back. Cancel button discards changes. Loading indicator on save. Styling matches the onboarding screen (maroon chips, same border radius and font sizes).

### `src/navigation/ProfileStack.tsx`

Nested native stack navigator for the Profile tab. Three screens: `ProfileHome` (no header — uses custom maroon header), `Settings` (standard header with title), `EditInterests` (standard header with title). This allows push navigation within the Profile tab without leaving the bottom tab context.

### `src/services/bookmarks.ts`

Shared data layer for bookmarks. Exports:
- `useSavedEvents()` — fetches current user's bookmarks from Firestore (`bookmarks` collection, ordered by `createdAt` desc), resolves event IDs against the `events` collection, returns `{ savedEvents, loadingSaved, refetchSaved }`.
- `toggleBookmark(userId, eventId)` — checks if a bookmark exists; if not, creates one; if so, deletes it. Returns `true` if now bookmarked, `false` if removed.

### `src/types/bookmark.ts`

Shared type contract for the bookmarks collection: `Bookmark { userId, eventId, createdAt }`.

### `src/services/auth.ts` (updated)

Added `updateInterests(uid, interests)` — thin wrapper around `updateDoc` that writes the interests array and bumps `updatedAt`. Called by `EditInterestsScreen`.

### `src/types/navigation.ts` (updated)

Added `ProfileStackParamList` with routes `ProfileHome`, `Settings`, `EditInterests`.

### `src/navigation/MainTabs.tsx` (updated)

Profile tab now renders `ProfileStack` instead of `ProfileScreen` directly. `headerShown: false` so the custom maroon header renders without duplication.

---

## Shared Contracts Locked

The following contracts were established so Brian's bookmark/notification backend (tasks 36–40) can be integrated without modifying any UI files:

- `types/bookmark.ts` — `Bookmark` shape (`userId`, `eventId`, `createdAt`).
- `useSavedEvents()` hook signature — returns `{ savedEvents: Event[], loadingSaved: boolean, refetchSaved: () => void }`.
- `toggleBookmark(userId, eventId): Promise<boolean>` — returns new bookmarked state.
- `updateInterests(uid, interests): Promise<void>` — writes interests to user doc.
- `ProfileStackParamList` — navigation types for the Profile tab stack.

---

## Design Notes

Colors match the established design system:

- `#881c1c` — maroon, used for header background, active tab underline, edit link, interest chip selected state, loading indicator, settings switch track.
- `#E8A838` — gold, used for camera/edit overlay on avatar.
- `#F2F2F2` — light gray page background (consistent with HomeScreen).
- `#1A1A1A` — near-black for titles and stat numbers.
- `#E8E8E8` — light borders for chips, tab divider, stat divider.
- `#e53e3e` — red for log out text (consistent with original ProfileScreen).

Stats row uses a `transform: [{ translateY: -14 }]` technique to overlap the maroon header, creating a floating card effect that matches the Figma reference.

---

## Testing Performed

| Scenario | Result |
|----------|--------|
| Profile screen renders with user data (name, role, interests) | Pass |
| Settings gear navigates to Settings screen | Pass |
| Edit link navigates to Edit Interests screen | Pass |
| Interest chips reflect current user interests from Firestore | Pass |
| Edit Interests saves changes to Firestore and reflects immediately | Pass |
| Cancel on Edit Interests discards changes | Pass |
| Saved Events tab shows empty state when no bookmarks exist | Pass |
| My RSVPs tab shows empty state when no RSVPs exist | Pass |
| Log Out on Settings triggers confirmation and signs out | Pass |
| Notification toggles switch state | Pass |
| Avatar shows initial letter for users without photoURL | Pass |
| TypeScript compiles with zero errors (`tsc --noEmit`) | Pass |

---

## Known Gaps

### 1. Event Detail navigation is a placeholder
Tapping an event card in the Saved/RSVP tabs shows an alert with event info rather than navigating to Event Detail. This is blocked on Pranav shipping the EventDetail screen (task 14). Once it lands, replace the `Alert` in `handleEventPress` with `navigation.navigate('EventDetail', { eventId })`.

### 2. Stats row partially hardcoded
"Events" shows the RSVP count and "Saved" shows the bookmark count, but "Following" is fixed at 0. No `following` collection or concept exists in the codebase yet — will be wired when a follow/unfollow feature is built.

### 3. Notification toggles are local-only
The two notification switches in Settings store state in component memory only. They will be persisted to the user's Firestore doc once Brian ships the notification preferences backend (task 39).

### 4. Bookmark query fetches all events
`useSavedEvents()` fetches the full `events` collection and filters client-side by bookmark IDs. This works for the current scale (~50 events) but should be replaced with batched `getDoc` calls or a Firestore `in` query when the events collection grows beyond a few hundred documents.

### 5. Camera/edit overlay is decorative only
The camera icon on the avatar does not trigger an image picker. Photo upload can be wired to `expo-image-picker` + Firebase Storage in a follow-up ticket.

---

## Follow-Up Tickets (Recommended)

- Wire event card tap → EventDetail navigation once Pranav ships task 14.
- Persist notification preference toggles to Firestore (Brian's task 39 dependency).
- Replace full-collection event fetch with batched `getDoc` or Firestore `in` query.
- Add avatar photo upload via `expo-image-picker` + Firebase Storage.
- Wire "Following" stat once a follow/unfollow feature is built.
- Optional: add pull-to-refresh on the Saved Events / RSVPs tabs.

---

## Commits & Branches

| Ref | What |
|-----|------|
| `c807ea6` on `feature/mapfeature` | Profile screen rewrite, SettingsScreen, EditInterestsScreen, ProfileStack navigator, bookmarks service, bookmark type, auth updateInterests, navigation types update |
