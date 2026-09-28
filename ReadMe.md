# Amherst Connect

**Amherst Connect** is a mobile-first community platform for UMass Amherst students, faculty, alumni, and local residents. The app consolidates fragmented information currently scattered across Instagram pages, flyers, websites, and word-of-mouth into a single intuitive hub.

This is a collaborative initiative between two organizations: **BUILD UMass** is responsible for development, implementation, and maintenance of the app; **180 Degree Consulting** is responsible for research, content strategy, and community/business partnerships.

---

## Current feature status

| Area | Current status |
|---|---|
| Auth + onboarding | Authentication state, user profiles, interests, and notification preferences work with the configured Firebase project. |
| Event feed + search | Firestore reads and client-side search/filtering work. The current Firestore events are old test data, and a mock fallback remains in the client. |
| Event details | The screen works, but RSVP is temporary UI state. **View on Map** opens the general Map tab without selecting the event, and bookmark/share controls are not rendered. |
| Interactive map | The map renders, but its events are hardcoded and **View Event** is not connected. |
| Community deals | Five hardcoded deals render; code display and clipboard copying work, but claims are not persisted. |
| Resource directory / Discover | Discover opens but is empty; the resource directory is not implemented. |
| Bookmarks / profile | Profile and bookmark service code exist, but Event Details does not expose the bookmark control. |
| Notifications | Preference persistence works. End-to-end push delivery and the Firebase-backed server jobs are not verified for normal development. |

These are product limitations, not installation failures. See
[Development Setup](./docs/development_setup.md) for the verified development
workflow.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React Native (Expo) |
| Backend | Node.js + Express |
| Database | Firebase Firestore |
| Storage | Firebase Storage is initialized in code but is currently unavailable on the Spark plan |
| Maps | Google Maps API |
| Auth | Firebase Auth |
| Notifications | Expo Push (FCM + APNs) |
| Development distribution | Expo EAS internal Android development builds |

Current infrastructure ownership: the Expo project belongs to the
`amherstconnect` organization, with Kushagra Aitha as Owner. Kushagra also has
Owner access to Firebase/Google Cloud and Admin access to this GitHub repository.
Firebase is on Spark, Google Cloud has no billing account attached, and Firebase
Storage is currently unavailable. Brian Nguyen's Spring 2026 setup attribution
in this repository remains historical.

---

## Project Structure

```
amherstconnect/
├── apps/
│   └── mobile/                       ← Expo React Native app
│       ├── src/
│       │   ├── components/           ← Reusable UI components
│       │   ├── constants/
│       │   ├── contexts/             ← AuthContext, etc.
│       │   ├── hooks/                ← useEvents, useDeals, useGoogleAuth
│       │   ├── navigation/           ← AppNavigator, MainTabs, stacks
│       │   ├── screens/              ← Auth + main screens
│       │   ├── services/             ← Firebase, auth, bookmarks, notifications
│       │   ├── types/                ← Shared TS types
│       │   └── utils/
│       ├── android/                  ← Generated locally; not committed
│       ├── assets/
│       ├── app.config.js
│       └── package.json
├── server/                           ← Node.js + Express API
│   ├── config/                       ← Firebase Admin SDK init
│   ├── controllers/                  ← Route handlers
│   ├── middleware/                   ← requireAuth (Firebase ID token)
│   ├── routes/                       ← /api/users, /api/verification, /api/notifications
│   ├── services/                     ← eventListener, reminderJob, expoPush
│   └── index.js
├── docs/
│   ├── setup.md                      ← Project setup walkthrough
│   ├── credentials.md                ← Account ownership and credential boundaries
│   ├── firestore_schema.md           ← Firestore data structure
│   ├── api_endpoints.md              ← REST API reference
│   ├── sprint_plans/
│   └── sprint_reports/
├── .github/
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── ISSUE_TEMPLATE/
├── .gitignore
└── .env.example
```

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 24 with npm 11 (the verified toolchain)
- [Git](https://git-scm.com/)
- [Android Studio](https://developer.android.com/studio) (Windows or Mac — for Android emulator)
- [Xcode](https://developer.apple.com/xcode/) (Mac only — for iOS simulator)
- Java 21 (for Firestore Emulator tests)

> **Expo Go no longer works for this project.** We use native modules (`react-native-maps`, `expo-location`) that aren't bundled in Expo Go. You need a development build instead — instructions below.

### 1. Clone and install

```bash
git clone https://github.com/build-umass/amherstconnect.git
cd amherstconnect
git checkout dev
git pull --ff-only origin dev
npm ci
npm --prefix apps/mobile ci
npm --prefix server ci
```

### 2. Environment variables

Create `apps/mobile/.env` using the template:

```bash
cp .env.example apps/mobile/.env
```

Obtain the actual values securely from the current Project Lead. Never commit
`.env` values or paste them into issues, pull requests, documentation, or public
chat channels.

The server starts without administrator credentials and keeps `/health`
available. Firebase-dependent routes return `503` until an authorized backend
operator configures Firebase Admin. Service-account keys grant broad access and
must not be distributed to every developer. If you are explicitly authorized,
follow the Project Lead's approved secret-management process and use
`server/.env.example`; never commit the key or server `.env` file.

For the complete verified Android, development-build, Metro, server, and test
workflow, see [Development Setup](./docs/development_setup.md).

### 3. Build and run the app

This project requires a native **Expo development client** that includes the
project's native modules. Pick the section that matches your setup.

#### Android emulator (Windows or Mac)

**First time setup:**

1. Open Android Studio and create an emulator with a **Google Play** system image (not "AOSP" — Google Maps requires Play Services).
2. Download the verified development APK listed in
   [Development Setup](./docs/development_setup.md) through its EAS artifact
   link. If that artifact has expired, ask the Project Lead for a replacement
   built from the current `dev` revision.
3. Start the emulator and drag the APK file onto it to install.

**Daily development:**

1. Start the Android emulator from Android Studio.
2. Start the Metro dev server:
   ```bash
   cd apps/mobile
   npx expo start --dev-client
   ```
3. Press `a` to open the app on the emulator. Hot reload works — code changes appear instantly.

#### iOS simulator (Mac only)

No Apple Developer account is needed for the simulator.

1. Install [Xcode](https://developer.apple.com/xcode/) from the Mac App Store.
2. Build and run locally:
   ```bash
   cd apps/mobile
   npx expo run:ios
   ```
   This compiles the app using Xcode and launches it in the iOS simulator. First build takes ~5–10 min; subsequent builds are faster.
3. For daily development after the first build:
   ```bash
   npx expo start --dev-client
   ```
   Press `i` to open in the iOS simulator.

### 4. Create your feature branch

```bash
git checkout -b feature/your-feature-name
```

### 5. When to rebuild

| What changed | Rebuild needed? |
|---|---|
| TypeScript / React components / styles | No — just restart Metro |
| `.env` values used at runtime (Firebase, OAuth client IDs) | No — restart Metro with `--clear` |
| `.env` values baked into native config (`GOOGLE_MAPS_API_KEY`) | Yes — ask for a new APK |
| Added/removed a native package (`react-native-maps`, etc.) | Yes — ask for a new APK |
| Changed `app.config.js` native settings (plugins, permissions, intent filters) | Yes — ask for a new APK |

> **Note:** Never commit `.env`, `google-services.json`, `google-config.json`, or `GoogleService-Info.plist`. Obtain approved development values securely from the current Project Lead.

---

## Documentation

Comprehensive documentation is available in the [`/docs`](./docs) folder:

- [Setup Guide](./docs/setup.md) — Full walkthrough of how the project was configured (Firebase, Expo, server, environment variables)
- [Development Setup](./docs/development_setup.md) — Current credential-free onboarding, Android development-build, server, and verification workflow
- [Credentials Guide](./docs/credentials.md) — Current account ownership and safe handling boundaries. Firebase Admin keys are not normal developer onboarding material.
- [Firestore Schema](./docs/firestore_schema.md) — Source of truth for every Firestore collection, field, and index used by the app and server
- [API Endpoints](./docs/api_endpoints.md) — REST reference for the Express server (`/api/users`, `/api/verification`, `/api/notifications`) plus background services
- [Sprint Plans](./docs/sprint_plans/) — Sprint-by-sprint scope and task ownership
- [Sprint Reports](./docs/sprint_reports/) — End-of-sprint write-ups by feature area

---

## Links

- [Hi-Fi Wireframes](https://drive.google.com/file/d/1CARfxd_FG1gDr4EEEOgc0T25IKWsZUOw/view?usp=sharing)
- [Workflow Management Document](https://docs.google.com/document/d/1GmvhQZdf7W-1cp-iRpTnM89YjmaMQmY1Ihyxk9F1U8Q/edit?usp=sharing)
- [PRD](https://docs.google.com/document/u/2/d/1Pm-wB35ieWZV4EYcHT5suIrRBiGmVxadFgMVCgfLxs4/edit?usp=sharing)

---

## Resources for Developers

### React Native + Expo (Frontend)
- https://reactnative.dev/docs/getting-started
- https://docs.expo.dev
- https://docs.expo.dev/tutorial/introduction

### Firebase (Auth + Firestore + Storage)
- https://firebase.google.com/docs
- https://firebase.google.com/docs/firestore
- https://docs.expo.dev/guides/using-firebase
- https://rnfirebase.io/auth/usage
- https://rnfirebase.io/firestore/usage

### Google Maps (react-native-maps)
- https://docs.expo.dev/versions/latest/sdk/map-view
- https://www.applighter.com/blog/react-native-google-maps
- https://dev.to/dainyjose/seamless-map-integration-in-react-native-a-complete-guide-29o7
- https://dev.to/dainyjose/building-a-location-picker-in-react-native-maps-with-draggable-marker-address-lookup-1d00
- https://nicolalazzari.ai/articles/understanding-google-maps-apis-a-comprehensive-guide-to-uses-and-costs

### Node.js + Express (Backend)
- https://dev.to/anticoder03/building-restful-apis-with-nodejs-and-express-step-by-step-tutorial-2oc6
- https://blog.postman.com/how-to-create-a-rest-api-with-node-js-and-express

### Push Notifications (Expo + FCM)
- https://docs.expo.dev/push-notifications/push-notifications-setup
- https://docs.expo.dev/push-notifications/overview

---

## Development Team

Amherst Connect is being developed by [**BUILD UMass**](https://buildumass.com/), a student-led software development organization at the University of Massachusetts Amherst.

### Spring 2026

| Role | Name |
|------|------|
| Project Lead | Brian Nguyen |
| Project Managers | Shriya Sanas, Adya Joshi |
| Software Developers | Sonny Zhang, Camila Rivera de Jesus, Anish Kamath, Kushagra Aitha, Pranav Ravi Buregoni, Maya Nedkova |

---

## Acknowledgments

- **180 Degrees Consulting UMass** — Client and community partner
- **BUILD UMass** — Student development team

---

## License

This project is proprietary software developed for 180 Degrees Consulting UMass. All rights reserved.
