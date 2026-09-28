# Amherst Connect — Project Setup Reference

This document covers everything that was configured to set up this project from scratch. It is intended to help developers understand what exists, why it exists, and how the pieces connect.

> This is an April 2026 configuration reference. New contributors should use
> the current [Development Setup](./development_setup.md) for installation,
> credential handling, and verification.

**Setup completed by:** Brian Nguyen (Project Lead)
**Date:** April 2026

Brian's attribution above is historical. Current ownership and service status as
of September 28, 2026:

- Expo project: `amherstconnect` organization; Kushagra Aitha is an Owner.
- Firebase/Google Cloud project: Kushagra has Owner access.
- GitHub repository: Kushagra has Admin access.
- Firebase remains on Spark, the Google Cloud project has no billing account,
  and Firebase Storage is not currently usable.

---

## 1. GitHub Repository

**Repo:** [github.com/build-umass/amherstconnect](https://github.com/build-umass/amherstconnect)

### Branch Strategy
- `main` — protected, production-ready code only; requires PR + review to merge
- `dev` — all developer work lands here; create feature branches off of `dev`

Feature branches should follow the naming convention: `feature/your-feature-name`

### Folder Structure
```
amherstconnect/
├── apps/
│   └── mobile/          ← Expo React Native app
├── server/              ← Node.js + Express API
├── docs/                ← Project documentation
├── .github/
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── ISSUE_TEMPLATE/
│       ├── bug_report.md
│       └── feature_request.md
├── .gitignore
└── .env.example
```

### Security — What is Gitignored
The following files are **never committed**. Mobile development values must be
obtained securely from the current Project Lead. Firebase Admin service-account
keys must be limited to explicitly authorized backend operators and must not be
distributed to every developer:

| File | Purpose |
|------|---------|
| `apps/mobile/.env` | Firebase + Google Maps API keys for the mobile app |
| `apps/mobile/google-services.json` | Firebase config for Android native builds |
| `apps/mobile/GoogleService-Info.plist` | Firebase config for iOS native builds |
| `server/.env` | Server port and service account key path |
| `server/serviceAccountKey.json` | Optional Firebase Admin credential for explicitly authorized backend operators only |

---

## 2. Firebase

**Project:** `amherst-connect` on Google Firebase
**Console:** [console.firebase.google.com](https://console.firebase.google.com)
**Current owner access:** Kushagra Aitha

### Firebase Auth
Enabled providers:
- Email/Password
- Google OAuth

### Firestore
- **Edition:** Standard (not Enterprise)
- **Rules:** Authenticated, owner-restricted rules and six code-compatible composite indexes are deployed; the repository includes emulator coverage for the supported access patterns.
- **Location:** nam5 (us-central)

Initial collections created as placeholders with dummy documents (to be replaced by real data):
- `users`
- `events`
- `deals`
- `resources`
- `bookmarks`

### Firebase Storage
- The Firebase project remains on Spark, and no Google Cloud billing account is attached.
- The existing Storage bucket is not currently usable under this configuration.
- Storage initialization exists in the app, but completed event-image and profile-photo upload flows are not part of the verified product behavior.

### Firebase Apps Registered
Three apps were registered under the Firebase project:
1. **iOS app** — Bundle ID: `com.buildumass.amherstconnect` → generates `GoogleService-Info.plist`
2. **Android app** — Package: `com.buildumass.amherstconnect` → generates `google-services.json`
3. **Web app** — Used by the Expo JS SDK (React Native uses the web config, not native SDKs)

> **Why web config for React Native?** Expo uses the Firebase JavaScript SDK, which uses the web API key cross-platform. Expo Go is not supported by this project; Android development uses the verified EAS development APK documented in [Development Setup](./development_setup.md).

### Firebase Service Account
The Express server supports a service-account private key (`serviceAccountKey.json`) for Firebase Admin. This grants admin-level access to Firestore and Auth. A key is not normal developer onboarding material and must only be available to explicitly authorized backend operators through the approved secret-management process.

---

## 3. Google Maps

- **APIs enabled:** Maps SDK for Android, Maps SDK for iOS
- **API Key:** The current key is limited to the Maps SDK APIs but does not yet have Android/iOS application restrictions. Its value is stored in `apps/mobile/.env` as `GOOGLE_MAPS_API_KEY`.
- No Cloud billing account is attached, so Maps must not be treated as an operationally guaranteed service until billing ownership and key restrictions are deliberately resolved.
- The key is injected into both the iOS and Android native config in `app.config.js`

---

## 4. Mobile App (Expo)

**Location:** `apps/mobile/`
**Framework:** React Native with Expo (SDK 54)

### Key Files

#### `app.config.js`
Replaces the default `app.json`. Reads all environment variables from `.env` at build time via `dotenv/config`. Contains:
- App name, slug, version, orientation
- iOS bundle identifier + Google Maps API key injection
- Android package name + adaptive icon + Google Maps API key injection
- Splash screen and app icon references
- `extra` block that passes Firebase config to the app via `expo-constants`

#### `src/services/firebase.ts`
The single Firebase initialization file. Every developer imports `auth`, `db`, or `storage` from here — do not initialize Firebase anywhere else.

```ts
import { auth, db, storage } from '../services/firebase';
```

Firebase config is read from `Constants.expoConfig.extra` (set by `app.config.js` from `.env`), so no credentials are hardcoded anywhere in the source.

#### `src/navigation/AppNavigator.tsx`
Sets up the current authentication flow and main navigation. The main app exposes
Home, Map, Discover, Deals, and Profile. These are no longer placeholder imports,
although Discover is empty and several feature flows remain incomplete; see
[Development Setup](./development_setup.md#known-incomplete-features).

#### `App.tsx`
Entry point — simply renders `AppNavigator`. Keep it minimal.

### Installed Dependencies

| Package | Purpose |
|---------|---------|
| `firebase` | Firebase JS SDK (Auth, Firestore, Storage) |
| `expo-constants` | Access `app.config.js` extra values at runtime |
| `@react-navigation/native` | Navigation core |
| `@react-navigation/bottom-tabs` | Bottom tab bar |
| `react-native-screens` | Native screen performance |
| `react-native-safe-area-context` | Safe area handling |
| `react-native-maps` | Google Maps integration |
| `expo-location` | Device GPS |
| `expo-notifications` | Push notifications |
| `expo-image-picker` | Camera / photo library access |
| `expo-image` | Optimized image rendering |
| `expo-device` | Device info for push notification setup |
| `dotenv` | Load `.env` at build time in `app.config.js` |

### Folder Structure (inside `apps/mobile/src/`)
```
src/
├── screens/      ← One file per screen (e.g., HomeScreen.tsx)
├── components/   ← Reusable UI components
├── navigation/   ← AppNavigator.tsx and any sub-navigators
├── hooks/        ← Custom React hooks
├── utils/        ← Helper functions
├── services/     ← Firebase and any external API calls
├── types/        ← TypeScript type definitions
└── constants/    ← Colors, font sizes, route names, etc.
```

---

## 5. Server (Node.js + Express)

**Location:** `server/`

The server is scaffolded but not yet feature-complete. It is not required for mobile app development — the mobile app talks to Firebase directly via the client SDK. The server will be used when backend-specific logic is needed (push notifications, admin operations, etc.).

### Key Files

#### `server/index.js`
Express entry point. Includes a health check at `GET /health` and mounts the existing user, verification, and notification routes.

#### `server/config/firebase.js`
Attempts to initialize the Firebase Admin SDK using `serviceAccountKey.json`. Exports the Admin services and availability state for route handlers. Without an authorized key, the server still starts, `/health` remains available, Firebase-backed routes return `503`, and background Firebase services stay disabled. Import from here — do not initialize Admin SDK elsewhere.

### Running the Server
```bash
cd server
npm ci
npm run dev     # uses nodemon for auto-reload
# or
npm start       # production
```

No credential is required for `/health` or credential-free verification.
Firebase-backed routes require an authorized `server/.env` and service-account
key. Obtain those only if the Project Lead has explicitly authorized you as a
backend operator; do not distribute Admin keys to the full development team.

---

## 6. Environment Variables Reference

### `apps/mobile/.env`
```
FIREBASE_API_KEY=
FIREBASE_AUTH_DOMAIN=
FIREBASE_PROJECT_ID=
FIREBASE_STORAGE_BUCKET=
FIREBASE_MESSAGING_SENDER_ID=
FIREBASE_APP_ID=
GOOGLE_MAPS_API_KEY=
GOOGLE_WEB_CLIENT_ID=
GOOGLE_IOS_CLIENT_ID=
GOOGLE_ANDROID_CLIENT_ID=
```

> **Google OAuth client IDs** — all three come from **Google Cloud → APIs &
> Services → Credentials** on the `amherst-connect` project:
> - `GOOGLE_WEB_CLIENT_ID` — the Web-type client Firebase auto-creates when
>   Google sign-in is enabled. Required because Firebase validates the ID token
>   audience against it. Without this value, the "Continue with Google" button
>   is hidden at runtime.
> - `GOOGLE_IOS_CLIENT_ID` — the iOS-type client auto-created alongside the
>   Firebase iOS app. Used on-device when running the app on iPhone.
> - `GOOGLE_ANDROID_CLIENT_ID` — the Android-type client. Requires a SHA-1
>   certificate fingerprint from the signing keystore (get it via
>   `npx eas-cli credentials`). Used on-device when running on Android.
>
> Native Google sign-in requires an Expo **development build** — it does not
> work in Expo Go.

### `server/.env`
```
PORT=3000
FIREBASE_SERVICE_ACCOUNT_KEY_PATH=./serviceAccountKey.json
```

Obtain required mobile values securely from the current Project Lead. Firebase
Admin keys are restricted to explicitly authorized backend operators. Never
commit these files or share their values publicly.
