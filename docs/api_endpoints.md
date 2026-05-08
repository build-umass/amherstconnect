# Amherst Connect — API Endpoints

REST endpoints exposed by the Express server in [server/](../server). Companion to [firestore_schema.md](firestore_schema.md), which describes the data these endpoints read and write.

**Base URL (local):** `http://localhost:3000`
**Base URL (deployed):** TBD
**Last updated:** May 2026 (end of Sprint 1)

---

## Conventions

- All `/api/*` routes require a Firebase ID token in the `Authorization` header:
  ```
  Authorization: Bearer <Firebase ID token>
  ```
  The token is verified by [requireAuth middleware](../server/middleware/auth.js); failures return `401`. The decoded token populates `req.user` (`uid`, `email`, etc.).
- Request and response bodies are JSON unless noted.
- All timestamps in responses are JSON-serialized Firestore `Timestamp` objects: `{ "_seconds": …, "_nanoseconds": … }`. Convert client-side via `new Date(t._seconds * 1000)`.
- Standard error shape:
  ```json
  { "error": "human-readable message" }
  ```

---

## Endpoint summary

| Method | Path | Purpose | Auth | Source |
|---|---|---|---|---|
| GET | `/health` | Liveness check | none | [index.js:13](../server/index.js#L13) |
| GET | `/api/users/:uid` | Fetch a user document | required | [users.js:6](../server/routes/users.js#L6) |
| PATCH | `/api/users/:uid` | Update own user document | required (self) | [users.js:7](../server/routes/users.js#L7) |
| POST | `/api/verification/send-edu-code` | Send 6-digit `.edu` verification code | required | [verification.js:6](../server/routes/verification.js#L6) |
| POST | `/api/verification/confirm-edu` | Confirm code, mark `eduVerified` | required | [verification.js:7](../server/routes/verification.js#L7) |
| GET | `/api/notifications` | List signed-in user's notifications | required | [notifications.js:8](../server/routes/notifications.js#L8) |
| PATCH | `/api/notifications/:id/read` | Mark one notification read | required (owner) | [notifications.js:10](../server/routes/notifications.js#L10) |
| PATCH | `/api/notifications/read-all` | Mark all notifications read | required | [notifications.js:9](../server/routes/notifications.js#L9) |

> Routes for `/api/events` and `/api/deals` are stubbed but commented out in [server/index.js:21-22](../server/index.js#L21-L22). The mobile app talks to Firestore directly for these collections.

---

## Health

### `GET /health`

Liveness check used by deployment infra. No auth.

**Response — 200**
```json
{ "status": "ok" }
```

---

## Users

### `GET /api/users/:uid`

Fetch a user document. Any authenticated user may read any user. Personal data leaks are not yet a concern at this stage.

**Path params**
| Name | Type | Notes |
|---|---|---|
| `uid` | string | Target user's Firebase UID |

**Response — 200**
Document body from [`users/{uid}`](firestore_schema.md#usersuid).
```json
{
  "uid": "abc123",
  "email": "student@umass.edu",
  "role": "student",
  "displayName": "Jane Doe",
  "photoURL": null,
  "eduVerified": true,
  "interests": ["Dining", "Sports"],
  "authProvider": "google",
  "onboardingComplete": true,
  "createdAt": { "_seconds": 1714500000, "_nanoseconds": 0 },
  "updatedAt": { "_seconds": 1714600000, "_nanoseconds": 0 },
  "expoPushToken": "ExponentPushToken[…]",
  "notificationPrefs": { "newEvents": true, "savedReminders": true }
}
```

**Errors**
| Status | When |
|---|---|
| 401 | Missing or invalid token |
| 404 | User document does not exist |
| 500 | Firestore failure |

---

### `PATCH /api/users/:uid`

Partial update on the caller's own user document. Sets `updatedAt` server-side.

**Path params**
| Name | Type | Notes |
|---|---|---|
| `uid` | string | Must equal `req.user.uid` |

**Request body** — any subset of the [`users/{uid}` schema](firestore_schema.md#usersuid). Common patches:
```json
{
  "displayName": "Jane D.",
  "interests": ["Sports", "Music"],
  "notificationPrefs": { "newEvents": true, "savedReminders": false }
}
```

**Response — 200**
```json
{ "success": true }
```

**Errors**
| Status | When |
|---|---|
| 401 | Missing or invalid token |
| 403 | Trying to update another user (`req.user.uid !== :uid`) |
| 500 | Firestore failure |

---

## Verification

Two-step `.edu` email verification. The current implementation logs the code to the server console in dev — wire `nodemailer` before public launch (see TODO in [verification.js:28](../server/controllers/verification.js#L28)).

### `POST /api/verification/send-edu-code`

Generates a 6-digit code, stores it in [`edu_verifications`](firestore_schema.md#edu_verificationsverificationid) with a 10-minute expiry, and (eventually) emails it to `eduEmail`.

**Request body**
```json
{ "eduEmail": "student@umass.edu" }
```
| Field | Type | Required | Notes |
|---|---|---|---|
| `eduEmail` | string | yes | Must end in `.edu` |

**Response — 200**
```json
{ "success": true, "message": "Verification code sent" }
```

**Errors**
| Status | When |
|---|---|
| 400 | `eduEmail` missing or not `.edu` |
| 401 | Missing or invalid token |
| 500 | Firestore failure |

---

### `POST /api/verification/confirm-edu`

Confirms the code emitted by `send-edu-code`. On success:
- Marks the `edu_verifications` doc as `verified: true`
- Sets `users/{uid}.eduVerified = true`
- Sets `student_profiles/{uid}.eduVerified = true` and `eduEmail`

**Request body**
```json
{ "code": "482917" }
```
| Field | Type | Required | Notes |
|---|---|---|---|
| `code` | string | yes | 6-digit numeric code from the sent email |

**Response — 200**
```json
{ "success": true }
```

**Errors**
| Status | When |
|---|---|
| 400 | Code not found, already used, or expired |
| 401 | Missing or invalid token |
| 500 | Firestore failure |

---

## Notifications

The signed-in user's in-app notification feed. Notifications are produced server-side by [eventListener.js](../server/services/eventListener.js) (new event match) and [reminderJob.js](../server/services/reminderJob.js) (saved-event reminder); the mobile app only reads and marks them.

### `GET /api/notifications`

Returns the 50 most recent notifications for the caller, newest first.

**Response — 200**
Array of [`notifications/{id}`](firestore_schema.md#notificationsnotificationid) docs:
```json
[
  {
    "id": "n_abc123",
    "userId": "u_xyz",
    "type": "new_event_match",
    "eventId": "e_123",
    "title": "New event for you",
    "body": "Lunar New Year Festival — Sat, May 2 4:30 PM",
    "read": false,
    "createdAt": { "_seconds": 1714600000, "_nanoseconds": 0 }
  }
]
```

**Errors**
| Status | When |
|---|---|
| 401 | Missing or invalid token |
| 500 | Firestore failure (e.g. missing composite index) |

---

### `PATCH /api/notifications/:id/read`

Marks one notification as read. The caller must own the notification.

**Path params**
| Name | Type | Notes |
|---|---|---|
| `id` | string | Notification document ID |

**Response — 200**
```json
{ "success": true }
```

**Errors**
| Status | When |
|---|---|
| 401 | Missing or invalid token |
| 403 | Notification belongs to another user |
| 404 | Notification does not exist |
| 500 | Firestore failure |

---

### `PATCH /api/notifications/read-all`

Marks all of the caller's unread notifications as read in a single batch.

**Response — 200**
```json
{ "updated": 7 }
```
`updated` = the number of docs flipped to `read: true`.

**Errors**
| Status | When |
|---|---|
| 401 | Missing or invalid token |
| 500 | Firestore failure |

---

## Background services (no HTTP surface)

These run alongside the Express server but are documented here because they own writes that show up in API responses.

### Event listener — [server/services/eventListener.js](../server/services/eventListener.js)

- **Trigger:** Firestore `onSnapshot` on the `events` collection.
- **Behavior:** when a new event is added (after server start), looks up users whose `interests` overlap with the event's category (see [interest mapping](firestore_schema.md#usersuid)) and have `onboardingComplete: true`. For each match that has not opted out via `notificationPrefs.newEvents`, writes a `notifications` doc and queues an Expo push if `expoPushToken` is set.

### Reminder job — [server/services/reminderJob.js](../server/services/reminderJob.js)

- **Trigger:** `setInterval` every 15 minutes (also runs once on boot).
- **Behavior:** finds events with `start_time` in the next hour, joins against `bookmarks`, and pushes a reminder to each owner who has not been reminded yet (`remindedAt` not set) and has not opted out via `notificationPrefs.savedReminders`. Stamps `remindedAt` on the bookmark to make the job idempotent across polling windows.

### Expo push — [server/services/expoPush.js](../server/services/expoPush.js)

Thin wrapper around `https://exp.host/--/api/v2/push/send`, batching to 100 messages per request as Expo recommends. Used by both background services above; not invoked from any HTTP route.

---

## Direct Firestore access from the mobile app

Not every read/write goes through this API. The mobile app talks to Firestore directly for:

| Collection | Operations | Code |
|---|---|---|
| `users` | sign-up create, profile edits, push token write | [services/auth.ts](../apps/mobile/src/services/auth.ts), [services/notifications.ts](../apps/mobile/src/services/notifications.ts) |
| `*_profiles` | sign-up create | [services/auth.ts:85](../apps/mobile/src/services/auth.ts#L85) |
| `events` | list-all read for the feed | [hooks/useEvents.ts](../apps/mobile/src/hooks/useEvents.ts) |
| `bookmarks` | list, toggle | [services/bookmarks.ts](../apps/mobile/src/services/bookmarks.ts) |

Firestore Security Rules (see the baseline in [firestore_schema.md](firestore_schema.md#firestore-security-rules-recommended-baseline)) enforce ownership for these direct paths; the API layer enforces it via `requireAuth` + explicit `req.user.uid` checks.
