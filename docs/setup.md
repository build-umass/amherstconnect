# Amherst Connect — Project Setup Reference

This document covers everything that was configured to set up this project from scratch. It is intended to help developers understand what exists, why it exists, and how the pieces connect.

**Setup completed by:** Brian Nguyen (Project Lead)
**Date:** April 2026

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
The following files are **never committed** and must be shared via Slack:

| File | Purpose |
|------|---------|
| `apps/mobile/.env` | Firebase + Google Maps API keys for the mobile app |
| `apps/mobile/google-services.json` | Firebase config for Android native builds |
| `apps/mobile/GoogleService-Info.plist` | Firebase config for iOS native builds |
| `server/.env` | Server port and service account key path |
| `server/serviceAccountKey.json` | Firebase Admin SDK credentials for the server |

---

## 2. Firebase

**Project:** `amherst-connect` on Google Firebase
**Console:** [console.firebase.google.com](https://console.firebase.google.com)
**Owner:** Brian Nguyen (personal Google account — transfer to a BUILD UMass org account is recommended long-term)

### Firebase Auth
Enabled providers:
- Email/Password
- Google OAuth

### Firestore
- **Edition:** Standard (not Enterprise)
- **Mode:** Started in test mode (rules expire 30 days from creation — write proper security rules before launch)
- **Location:** nam5 (us-central)

Initial collections created as placeholders with dummy documents (to be replaced by real data):
- `users`
- `events`
- `deals`
- `resources`
- `bookmarks`

### Firebase Storage
- Requires Blaze (pay-as-you-go) plan — upgraded during setup
- The free tier limits still apply; no charges are expected at beta scale
- Used for storing event images and user profile photos

### Firebase Apps Registered
Three apps were registered under the Firebase project:
1. **iOS app** — Bundle ID: `com.buildumass.amherstconnect` → generates `GoogleService-Info.plist`
2. **Android app** — Package: `com.buildumass.amherstconnect` → generates `google-services.json`
3. **Web app** — Used by the Expo JS SDK (React Native uses the web config, not native SDKs)

> **Why web config for React Native?** Expo uses the Firebase JavaScript SDK, which uses the web API key cross-platform. The native credential files (`google-services.json` / `GoogleService-Info.plist`) are only needed for native builds (EAS Build), not for running in Expo Go.

### Firebase Service Account
A service account private key (`serviceAccountKey.json`) was generated for the Express server to use the Firebase Admin SDK. This gives the server admin-level access to Firestore and Auth. It is gitignored and must be shared privately.

---

## 3. Google Maps

- **APIs enabled:** Maps SDK for Android, Maps SDK for iOS
- **API Key:** Single unrestricted key stored in `apps/mobile/.env` as `GOOGLE_MAPS_API_KEY`
- Google provides a $200/month free credit shared across both SDKs — no charges expected at beta scale
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
Sets up the bottom tab navigator with 5 placeholder screens:
- Home, Map, Discover, Deals, Profile

Developers building screens should replace the placeholder components with real screen imports. Do not modify the tab structure without discussing with the team first.

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
Express entry point. Includes a health check at `GET /health`. Route files are commented in and ready to be uncommented as features are built.

#### `server/config/firebase.js`
Initializes the Firebase Admin SDK using `serviceAccountKey.json`. Exports `admin`, `db`, and `auth` for use in route handlers. Import from here — do not initialize Admin SDK elsewhere.

### Running the Server
```bash
cd server
npm install
npm run dev     # uses nodemon for auto-reload
# or
npm start       # production
```

Requires `server/.env` and `server/serviceAccountKey.json` — get both via Slack.

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
```

### `server/.env`
```
PORT=3000
FIREBASE_SERVICE_ACCOUNT_KEY_PATH=./serviceAccountKey.json
```

All values are shared privately via Slack. Never commit these files or share values publicly.
