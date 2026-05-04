# Sprint Report — Profile + Bookmarks

**Theme:** Profile screen, saved events, edit interests, settings, bookmarks, push notifications  
**Completed:** 2026-04-30  
**Contributors:** Sonny Zhang, Brian Nguyen

---

## Sprint Goal

Deliver the Profile section of Amherst Connect: a signed-in user should be able to view their identity and stats, browse saved events and RSVPs in tabbed lists, edit their interest tags, access a settings screen with persistent notification toggles and log out, bookmark events from Event Detail, and receive push notifications for new matching events and upcoming saved events — all wired to Firestore via a shared `useSavedEvents()` hook and `updateInterests()` service.

---

## Tickets Delivered

| # | Ticket | Status | Primary | Notes |
|---|--------|--------|---------|-------|
| 32 | Profile screen layout | Done | Sonny | Header, avatar, role badge, stats row, interests, tabs, settings gear. Consumes `useSavedEvents()` hook. |
| 33 | Saved Events list UI | Done | Sonny | Saved tab renders Camila's `<EventCard />` for each bookmark. Tap shows event info (EventDetail pending Pranav). |
| 34 | Edit Interests screen | Done | Sonny | Reuses onboarding interest tag selector. Calls `updateInterests()` service, refreshes user, navigates back. |
| 35 | Settings screen | Done | Sonny | Notification preference toggles now persist to Firestore via Brian's `saveNotificationPrefs()`. Edit Interests link, account info, Log Out with confirmation. |
| 36 | Bookmark service + `useSavedEvents` hook | Done | Brian | Real Firestore implementation. Batched `getDoc` per bookmark ID instead of full collection scan. Sort order preserved. |
| 37 | Bookmark button component | Done | Brian | Standalone `BookmarkButton.tsx` with optimistic toggle, revert on error, `BookmarkButtonProps` contract. Ready for Pranav's Event Detail slot. |
| 38 | Interest update service | Done | Sonny | `updateInterests()` implemented in `auth.ts` during Sonny's pass — no additional work needed. |
| 39 | Push notifications setup | Done | Brian | `services/notifications.ts` — permission request, Android channel, Expo push token stored in Firestore. Wired into AuthContext on sign-in. Notification prefs persisted from Settings toggles. |
| 40 | Notification triggers | Done | Brian | Server-side: Firestore event listener notifies matching users on new event; 15-min reminder job for saved events starting soon. Both write to `notifications` collection and send Expo push. |

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
- `useSavedEvents()` — fetches current user's bookmarks from Firestore (`bookmarks` collection, ordered by `createdAt` desc), resolves event IDs via batched `getDoc` calls (one per bookmark ID), preserves bookmark sort order after join, returns `{ savedEvents, loadingSaved, refetchSaved }`.
- `toggleBookmark(userId, eventId)` — checks if a bookmark exists; if not, creates one; if so, deletes it. Returns `true` if now bookmarked, `false` if removed.

### `src/types/bookmark.ts`

Shared type contract for the bookmarks collection: `Bookmark { userId, eventId, createdAt, remindedAt? }`. The optional `remindedAt` field is stamped by the server reminder job to prevent duplicate reminder notifications.

### `src/services/auth.ts` (updated)

Added `updateInterests(uid, interests)` — thin wrapper around `updateDoc` that writes the interests array and bumps `updatedAt`. Called by `EditInterestsScreen`.

### `src/types/navigation.ts` (updated)

Added `ProfileStackParamList` with routes `ProfileHome`, `Settings`, `EditInterests`.

### `src/navigation/MainTabs.tsx` (updated)

Profile tab now renders `ProfileStack` instead of `ProfileScreen` directly. `headerShown: false` so the custom maroon header renders without duplication.

---

## What Was Built — Brian Nguyen (Tasks 36–40)

### `src/components/BookmarkButton.tsx`

Standalone bookmark toggle component. Renders a ★/☆ star that flips state immediately on press (optimistic UI) and calls `toggleBookmark(userId, eventId)` from `services/bookmarks.ts`. Reverts to previous state if the Firestore write fails. Shows an `ActivityIndicator` during the in-flight request. Exports `BookmarkButtonProps` per the locked sprint contract. Sized and colored via props — defaults to maroon `#881c1c` at 24px. Ready to be dropped into Pranav's Event Detail slot.

### `src/services/notifications.ts`

Client-side notification service. Exports:
- `registerPushToken(uid)` — checks and requests permissions, sets up an Android notification channel, calls `getExpoPushTokenAsync({ projectId })` with the EAS project ID from `expo-constants`, and writes the token to `users/{uid}.expoPushToken` in Firestore. Skips on simulators (`Device.isDevice` guard).
- `saveNotificationPrefs(uid, prefs)` — writes `{ newEvents, savedReminders }` to `users/{uid}.notificationPrefs` in Firestore.
- `setNotificationHandler` configured at module load to show alerts and play sound for foreground notifications.

### `src/contexts/AuthContext.tsx` (updated)

Calls `registerPushToken(uid)` fire-and-forget after a fully onboarded user's doc loads on sign-in. Only runs when `onboardingComplete === true` so the permission prompt does not appear during the onboarding flow.

### `src/screens/main/SettingsScreen.tsx` (updated)

Notification preference toggles now read initial state from `appUser.notificationPrefs` (with `true` defaults for new users). A `useEffect` syncs state if `appUser` loads after mount. Each toggle calls `saveNotificationPrefs` on change and then `refreshUser()` to keep local state consistent with Firestore.

### `src/types/auth.ts` (updated)

Added `NotificationPrefs` interface `{ newEvents: boolean, savedReminders: boolean }`. Added optional `expoPushToken?: string` and `notificationPrefs?: NotificationPrefs` fields to `AppUser`.

### `src/types/notification.ts`

New type file. Defines `AppNotification { id, userId, type, eventId, title, body, read, createdAt }` and `NotificationType = 'new_event_match' | 'saved_event_reminder'`. Mirrors the server-side `notifications` collection schema.

### `apps/mobile/app.config.js` (updated)

Added `expo-notifications` plugin with maroon `#881c1c` icon color. Requires an EAS rebuild to take effect on native.

### `server/services/expoPush.js`

Utility for sending Expo push messages. Chunks outgoing messages into batches of 100 (Expo's recommended limit) and POSTs to the Expo Push API. Handles empty arrays with an early return.

### `server/services/eventListener.js`

Attaches a Firestore `onSnapshot` listener to the `events` collection on server start. Skips documents that existed before the server booted (via a `startedAt` timestamp guard). When a new event is added, maps the event's category to matching user interest labels via a `CATEGORY_TO_INTERESTS` lookup (bridges the mismatch between `EventCategory` values and the labels stored in user interest arrays), queries users with `array-contains-any`, filters out opted-out users, batch-writes to `notifications`, and sends Expo pushes.

### `server/services/reminderJob.js`

Polls every 15 minutes for events with `start_time` in the next hour. Finds bookmarks for those events, filters out any bookmark already stamped with `remindedAt` (prevents double-firing across poll cycles), fetches the relevant user docs, respects opt-out, batch-writes to `notifications`, stamps `remindedAt` on each bookmark, and sends Expo pushes. Runs once immediately on startup.

### `server/controllers/notifications.js` + `server/routes/notifications.js`

REST API for the notifications collection. Three endpoints, all behind `requireAuth`:
- `GET /api/notifications` — returns the user's 50 most recent notifications ordered by `createdAt` desc.
- `PATCH /api/notifications/:id/read` — marks a single notification as read (ownership-checked).
- `PATCH /api/notifications/read-all` — marks all unread notifications as read.

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

### 3. ~~Notification toggles are local-only~~ — Resolved
Notification preference toggles now persist to Firestore via `saveNotificationPrefs()` and are read back from `appUser.notificationPrefs` on mount.

### 4. ~~Bookmark query fetches all events~~ — Resolved
`useSavedEvents()` now uses batched `getDoc` calls per bookmark ID instead of fetching the full `events` collection.

### 5. Camera/edit overlay is decorative only
The camera icon on the avatar does not trigger an image picker. Photo upload can be wired to `expo-image-picker` + Firebase Storage in a follow-up ticket.

---

## Follow-Up Tickets (Recommended)

- Wire event card tap → EventDetail navigation once Pranav ships task 14.
- Wire `<BookmarkButton />` into Pranav's Event Detail screen slot.
- Add avatar photo upload via `expo-image-picker` + Firebase Storage.
- Wire "Following" stat once a follow/unfollow feature is built.
- Optional: add pull-to-refresh on the Saved Events / RSVPs tabs.
- EAS rebuild required for `expo-notifications` plugin to take effect on native (push notifications will not work until then).

---

## Commits & Branches

| Ref | What |
|-----|------|
| `c807ea6` on `feature/mapfeature` | Profile screen rewrite, SettingsScreen, EditInterestsScreen, ProfileStack navigator, bookmarks service, bookmark type, auth updateInterests, navigation types update |
| `89a5a23` on `feature/profile_page` | BookmarkButton component, notifications service, AuthContext push token wiring, SettingsScreen prefs persistence, batched useSavedEvents, notification types, server event listener, reminder job, notifications API |
