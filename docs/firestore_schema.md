# Amherst Connect — Firestore Data Structure

This document describes the Firestore collections used by the Amherst Connect mobile app and Node/Express API server. It is the source of truth for the shape of data on the wire and at rest. When schemas change, update this file and the matching TypeScript types in [apps/mobile/src/types/](../apps/mobile/src/types/).

**Project:** Amherst Connect
**Last updated:** May 2026 (end of Sprint 1)
**Firestore project ID:** see [docs/credentials.md](credentials.md)

---

## Conventions

- **Document IDs**
  - `users`, `*_profiles` — keyed by Firebase Auth `uid`
  - `bookmarks`, `notifications`, `edu_verifications` — Firestore auto-generated IDs
  - `events`, `deals` — auto-generated IDs (created by admin tooling / future ingestion job)
- **Timestamps** — all `createdAt` / `updatedAt` / `expiresAt` / `start_time` fields are Firestore `Timestamp` objects. The mobile app writes them with `serverTimestamp()`; the server writes plain `new Date()`, which the SDK converts to `Timestamp`.
- **Ownership** — every user-scoped document carries a `userId` (or `uid`) field equal to the owning user's Firebase Auth UID.
- **Mirrored fields** — `eduVerified` lives on both `users/{uid}` and `student_profiles/{uid}`. The verification flow updates both in the same request ([server/controllers/verification.js:64-65](../server/controllers/verification.js#L64-L65)).

---

## Collection map

| Collection | Doc ID | Owner | Written by | Read by |
|---|---|---|---|---|
| `users` | `uid` | self | mobile (sign-up, profile edits, push token), server (verification, push) | mobile, server |
| `student_profiles` | `uid` | self | mobile (sign-up), server (verification) | mobile |
| `faculty_staff_profiles` | `uid` | self | mobile (sign-up) | mobile |
| `alumni_profiles` | `uid` | self | mobile (sign-up) | mobile |
| `resident_profiles` | `uid` | self | mobile (sign-up) | mobile |
| `events` | auto | admin | admin tooling (manual seed for now) | mobile, server (listener + reminder job) |
| `deals` | auto | admin | admin tooling (planned) | mobile (currently mocked in [useDeals.ts](../apps/mobile/src/hooks/useDeals.ts)) |
| `bookmarks` | auto | self | mobile (toggle), server (stamp `remindedAt`) | mobile, server |
| `notifications` | auto | self | server only | mobile (read), server (write + mark read) |
| `edu_verifications` | auto | self | server only | server only |

---

## `users/{uid}`

The canonical user record. Created on first sign-in by [createUserDocument()](../apps/mobile/src/services/auth.ts#L48). The `role` field determines which role-specific profile collection holds the rest of the user's data.

```ts
{
  uid: string;                              // matches Firebase Auth UID and doc ID
  email: string;                            // primary login email
  role: 'student' | 'faculty_staff' | 'alumni' | 'local_resident';
  displayName: string;
  photoURL: string | null;
  eduVerified: boolean;                     // mirrored from student_profiles
  interests: string[];                      // see Interests labels below
  authProvider: 'email' | 'google';
  onboardingComplete: boolean;              // gates the new-event push fan-out
  createdAt: Timestamp;
  updatedAt: Timestamp;

  // Optional — populated after first push registration
  expoPushToken?: string;
  notificationPrefs?: {
    newEvents: boolean;                     // opt out of "new event for you"
    savedReminders: boolean;                // opt out of saved-event reminders
  };
}
```

**Interest labels** are written by [InterestSelectionScreen / EditInterestsScreen](../apps/mobile/src/screens) and consumed by the server-side fan-out in [eventListener.js](../server/services/eventListener.js#L12-L19). Keep them in sync with `CATEGORY_TO_INTERESTS`:

| Event category | Interest labels that match |
|---|---|
| `Dining` | `Dining` |
| `Sports` | `Sports` |
| `Nightlife` | `Nightlife` |
| `Arts & Music` | `Arts`, `Music`, `Theater` |
| `Campus` | `Academic`, `RSO Events`, `RSO`, `Cultural` |
| `All` | (UI-only filter — never matched) |

**Indexes used**
- `interests` (array) + `onboardingComplete` (==) — server fan-out query

---

## Role profile collections

One document per user, keyed by `uid`. Created alongside `users/{uid}` by [createRoleProfile()](../apps/mobile/src/services/auth.ts#L85). The role on `users/{uid}.role` chooses which collection holds the profile.

### `student_profiles/{uid}`

```ts
{
  uid: string;
  eduVerified: boolean;                     // mirrored to users/{uid}.eduVerified
  eduEmail: string | null;                  // .edu address used for verification
  major: string | null;
  gradYear: number | null;
  createdAt: Timestamp;
}
```

### `faculty_staff_profiles/{uid}`

```ts
{
  uid: string;
  department: string | null;
  title: string | null;
  createdAt: Timestamp;
}
```

### `alumni_profiles/{uid}`

```ts
{
  uid: string;
  gradYear: number | null;
  major: string | null;
  createdAt: Timestamp;
}
```

### `resident_profiles/{uid}`

```ts
{
  uid: string;
  neighborhood: string | null;
  createdAt: Timestamp;
}
```

---

## `events/{eventId}`

Public events surfaced on the feed and map. Document IDs are auto-generated. Currently seeded manually; an ingestion job is planned for Sprint 2.

```ts
{
  title: string;
  category: 'Campus' | 'Dining' | 'Sports' | 'Nightlife' | 'Arts & Music';
  date: string;                             // display string, e.g. "Sat, Apr 26"
  time: string;                             // display string, e.g. "6:00 PM"
  start_time: Timestamp;                    // machine-readable; powers reminderJob window
  location: string;
  emoji: string;                            // placeholder icon until cover images land
  latitude?: number;
  longitude?: number;

  // Detail-screen fields
  organizer?: string;
  description?: string;
  isFree?: boolean;
  isFeatured?: boolean;
  interested?: number;                      // running counter, currently display-only

  createdAt: Timestamp;                     // used by eventListener to skip pre-existing docs
}
```

**Listeners**
- [eventListener.js](../server/services/eventListener.js) — onSnapshot on the whole collection; fans out a notification to every user whose interests match the new event's category.
- [reminderJob.js](../server/services/reminderJob.js) — every 15 min, queries `start_time` between `now` and `now + 1 hr` to send saved-event reminders.

**Indexes used**
- `start_time` (range) — reminder job
- (collection scan currently acceptable for the listener — the snapshot is filtered in-process)

---

## `deals/{dealId}`

Local business deals shown on the Deals tab. **Currently mocked client-side** in [useDeals.ts](../apps/mobile/src/hooks/useDeals.ts); production schema below is the planned shape.

```ts
{
  // Business
  businessName: string;
  businessLogoURL?: string | null;

  // Offer
  offerTitle: string;
  offerDescription?: string;
  discountCode?: string;

  // Classification
  category: 'dining' | 'coffee' | 'retail' | 'nightlife';
  tags?: string[];
  trendingScore: number;                    // sort key on the deals feed

  // Expiry
  expiresAt: string;                        // ISO-8601 (note: string, not Timestamp)
  isExpiringSoon: boolean;

  // Redemption
  location: string;
  requiresStudentId: boolean;
  requirements?: string;
  maxClaimsPerUser?: number;

  // Metadata
  createdAt: string;                        // ISO-8601
  updatedAt: string;                        // ISO-8601
}
```

> **Note:** `deals` uses ISO-8601 strings rather than Firestore Timestamps. This is a deliberate choice for the third-party ingestion path planned in Sprint 2. Other collections should keep using `Timestamp`.

---

## `bookmarks/{bookmarkId}`

Join table between users and the events they've saved. Created on tap of the bookmark icon ([toggleBookmark()](../apps/mobile/src/services/bookmarks.ts#L77)). The reminder job stamps `remindedAt` so the same bookmark is not re-notified across polling windows.

```ts
{
  userId: string;
  eventId: string;
  createdAt: Timestamp;
  remindedAt?: Timestamp;                   // set by reminderJob after a push fires
}
```

**Indexes used**
- `userId` (==) + `createdAt` (desc) — saved-events list
- `userId` (==) + `eventId` (==) — bookmark toggle lookup
- `eventId` (in) — reminder job batch query

---

## `notifications/{notificationId}`

In-app notification feed. **Server-write only** — the mobile app never creates these directly.

```ts
{
  userId: string;
  type: 'new_event_match' | 'saved_event_reminder';
  eventId: string;                          // deep-link target
  title: string;
  body: string;
  read: boolean;
  createdAt: Timestamp;
}
```

**Indexes used**
- `userId` (==) + `createdAt` (desc) — feed query (limit 50)
- `userId` (==) + `read` (==) — mark-all-read batch

---

## `edu_verifications/{verificationId}`

Short-lived verification codes for `.edu` email confirmation. **Server-only** (never read by the mobile app). Cleaned up by expiry rather than deletion — `verified: true` and a 10-minute `expiresAt` are sufficient to prevent reuse.

```ts
{
  uid: string;                              // owner
  eduEmail: string;
  code: string;                             // 6-digit numeric
  verified: boolean;
  createdAt: Timestamp;
  expiresAt: Timestamp;                     // createdAt + 10 minutes
}
```

**Indexes used**
- `uid` (==) + `code` (==) + `verified` (==) — confirmation lookup

---

## Firestore Security Rules (recommended baseline)

The repo does not yet ship a `firestore.rules` file; the rules below match the access patterns in the app and should be added before public launch.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isSignedIn() { return request.auth != null; }
    function isOwner(uid) { return isSignedIn() && request.auth.uid == uid; }

    match /users/{uid} {
      allow read: if isSignedIn();
      allow create, update: if isOwner(uid);
      allow delete: if false;
    }

    match /{role}_profiles/{uid} {
      allow read: if isSignedIn();
      allow write: if isOwner(uid);
    }

    match /events/{eventId} {
      allow read: if isSignedIn();
      allow write: if false;                // admin SDK only
    }

    match /deals/{dealId} {
      allow read: if isSignedIn();
      allow write: if false;                // admin SDK only
    }

    match /bookmarks/{id} {
      allow read, delete: if isSignedIn() && resource.data.userId == request.auth.uid;
      allow create: if isSignedIn() && request.resource.data.userId == request.auth.uid;
      allow update: if false;               // remindedAt is server-only (Admin SDK bypasses rules)
    }

    match /notifications/{id} {
      allow read: if isSignedIn() && resource.data.userId == request.auth.uid;
      allow update: if isSignedIn()
        && resource.data.userId == request.auth.uid
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['read']);
      allow create, delete: if false;       // server-only
    }

    match /edu_verifications/{id} {
      allow read, write: if false;          // server-only
    }
  }
}
```
