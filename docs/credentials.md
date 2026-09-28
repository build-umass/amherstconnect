# Credentials & Account Ownership

This document tracks who currently owns or has primary access to each third-party account, API key, and service used by Amherst Connect.

**Do not paste secrets here.** Mobile values live in `apps/mobile/.env`
(gitignored). If an authorized backend environment uses a Firebase Admin key,
it must also remain outside version control. This file only tracks ownership,
access boundaries, and console locations.

Last updated: 2026-09-28

---

## Ownership Legend

| Role | Responsibility |
| --- | --- |
| **Owner** | Has admin-level access; can add/remove team members. |
| **Backup** | Has access but not primary; can step in if owner is unavailable. |
| **Users** | Read or limited access appropriate to their development role. |

---

## Cloud & Backend

### Firebase Project — `amherst-connect`

| Field | Value |
| --- | --- |
| Project ID | `amherst-connect` |
| Console | https://console.firebase.google.com/project/amherst-connect |
| Owner | Kushagra Aitha |
| Backup | _TBD — add a second admin_ |
| What's stored | Auth users and Firestore collections (`users`, `student_profiles`, `faculty_staff_profiles`, `alumni_profiles`, `resident_profiles`, events, bookmarks, notifications, and related app data) |
| Notes | Spark plan. Auth → Sign-in method has Email/Password and Google enabled. Authenticated Firestore rules and indexes are deployed. Storage is currently unavailable. |

### Google Cloud Platform — `amherst-connect`

Firebase and GCP share the underlying project. OAuth clients are managed here.

| Field | Value |
| --- | --- |
| Console | https://console.cloud.google.com/apis/credentials?project=amherst-connect |
| Owner | Kushagra Aitha |
| OAuth clients | Web, iOS, Android (see `apps/mobile/.env`) |
| Maps API key | `GOOGLE_MAPS_API_KEY` in `apps/mobile/.env` |
| Billing | No billing account is attached |
| Notes | Android client has **Enable Custom URI Scheme** toggled on (required by `expo-auth-session`). SHA-1 on the Android client must match the EAS-managed Android keystore. The Maps key is API-restricted but still needs platform application restrictions before production use. |

### Firebase Admin SDK service account (`server/serviceAccountKey.json`)

| Field | Value |
| --- | --- |
| Used by | `server/` backend for admin-level Firestore / Auth operations |
| Access | Restricted to explicitly authorized backend operators; not available to normal developers |
| File location | `server/serviceAccountKey.json` (gitignored) |
| Rotation | _TBD — set a rotation cadence; rotate immediately if leaked_ |

---

## Mobile Build & Distribution

### Expo / EAS

| Field | Value |
| --- | --- |
| Expo organization | `amherstconnect` |
| Owner | Kushagra Aitha |
| EAS project slug | `amherstconnect` |
| EAS project ID | `6bdab312-be70-4f12-a2de-c138acf27809` |
| Dashboard | https://expo.dev/accounts/amherstconnect/projects/amherstconnect |
| Notes | Manages Android keystore and (eventually) iOS signing credentials. Android keystore's SHA-1 must stay in sync with the Google Android OAuth client. |

### Apple Developer Program

| Field | Value |
| --- | --- |
| Status | **Not enrolled** (paid account required for EAS iOS builds / TestFlight / App Store) |
| Owner | _TBD — whoever enrolls pays the $99/yr or uses university program_ |
| Notes | Not needed for Android development. Google Sign-In on iOS requires a native build, which in turn requires enrollment. |

### Google Play Developer account

| Field | Value |
| --- | --- |
| Status | _Not yet created_ |
| Owner | _TBD_ |
| Notes | Required for Play Store distribution ($25 one-time). Not required for dev builds installed via EAS. |

---

## Source Control & Project Management

### GitHub repository

| Field | Value |
| --- | --- |
| Repo | https://github.com/build-umass/amherstconnect |
| Owner (org or user) | BUILD UMass |
| Admins | Kushagra Aitha |

---

## Environment Variable Ownership

Every variable in `apps/mobile/.env` is represented by a blank placeholder in
the repository-root `.env.example`. The mobile `.env` is distributed privately
by the Project Lead and is never committed. If a variable needs rotation or
re-issue, the person below is responsible:

| Variable | Source console | Owner |
| --- | --- | --- |
| `FIREBASE_API_KEY` | Firebase → Project Settings → General | Kushagra Aitha |
| `FIREBASE_AUTH_DOMAIN` | Firebase → Project Settings → General | Kushagra Aitha |
| `FIREBASE_PROJECT_ID` | Firebase → Project Settings → General | Kushagra Aitha |
| `FIREBASE_STORAGE_BUCKET` | Firebase → Project Settings → General | Kushagra Aitha |
| `FIREBASE_MESSAGING_SENDER_ID` | Firebase → Project Settings → Cloud Messaging | Kushagra Aitha |
| `FIREBASE_APP_ID` | Firebase → Project Settings → Your apps | Kushagra Aitha |
| `GOOGLE_MAPS_API_KEY` | GCP → APIs & Services → Credentials | Kushagra Aitha |
| `GOOGLE_WEB_CLIENT_ID` | GCP → APIs & Services → Credentials (OAuth 2.0 Client, type: Web) | Kushagra Aitha |
| `GOOGLE_IOS_CLIENT_ID` | GCP → APIs & Services → Credentials (OAuth 2.0 Client, type: iOS) | Kushagra Aitha |
| `GOOGLE_ANDROID_CLIENT_ID` | GCP → APIs & Services → Credentials (OAuth 2.0 Client, type: Android) | Kushagra Aitha |

The server's Firebase Admin service-account key is intentionally excluded from
this table. Ordinary developers should not request, receive, or share it.

---

## Handoff Checklist

When ownership of any of the above changes (someone leaves the team, graduates, etc.), do the following:

1. Add the incoming owner to the relevant console as an admin.
2. Verify they can log in and make a benign change (e.g. view credentials).
3. Remove the outgoing owner's admin access.
4. Rotate any long-lived secrets the outgoing owner may have exported (service account keys especially).
5. Update this document.
