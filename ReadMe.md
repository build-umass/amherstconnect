# Amherst Connect

**Amherst Connect** is a mobile-first community platform for UMass Amherst students, faculty, alumni, and local residents. The app consolidates fragmented information currently scattered across Instagram pages, flyers, websites, and word-of-mouth into a single intuitive hub.

This is a collaborative initiative between two organizations: **BUILD UMass** is responsible for development, implementation, and maintenance of the app; **180 Degree Consulting** is responsible for research, content strategy, and community/business partnerships.

---

## Features

- **Auth + Onboarding** — Role-based sign-up (Student, Faculty, Alumni, Local Resident) with interest tag personalization
- **Event Feed + Search** — Browse and search upcoming campus and community events with category filters
- **Interactive Campus Map** — Google Maps integration with event pins, time filters, and tap-to-preview
- **Community Deals** — Discover and claim local business discounts
- **Resource Directory** — Browse community organizations and services
- **Bookmarks** — Save events and access them from your profile
- **Push Notifications** — Stay updated on events and announcements relevant to your interests

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React Native (Expo) |
| Backend | Node.js + Express |
| Database & Storage | Firebase (Firestore + Storage) |
| Maps | Google Maps API |
| Auth | Firebase Auth |
| Notifications | Expo Push (FCM + APNs) |
| Hosting / Deployment | Firebase Hosting + App Distribution |

---

## Project Structure

```
amherstconnect/
├── apps/
│   └── mobile/          ← Expo React Native app
├── server/              ← Node.js + Express API
├── docs/                ← PRD, ERD, workflow docs
├── .github/
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── ISSUE_TEMPLATE/
├── .gitignore
└── .env.example
```

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- [Git](https://git-scm.com/)
- [Android Studio](https://developer.android.com/studio) (Windows or Mac — for Android emulator)
- [Xcode](https://developer.apple.com/xcode/) (Mac only — for iOS simulator)

> **Expo Go no longer works for this project.** We use native modules (`react-native-maps`, `expo-location`) that aren't bundled in Expo Go. You need a development build instead — instructions below.

### 1. Clone and install

```bash
git clone https://github.com/build-umass/amherstconnect.git
cd amherstconnect
git checkout dev
cd apps/mobile
npm install
```

### 2. Environment variables

Create `apps/mobile/.env` using the template:

```bash
cp ../../.env.example .env
```

Fill in the values (via Slack for the actual keys).

*(Backend work only)* Also set up server env:

```bash
cp ../../server/.env.example ../../server/.env
# Add serviceAccountKey.json to server/ (received via Slack)
```

### 3. Build and run the app

This project requires a **development build** (a custom version of Expo Go that includes our native modules). Pick the section that matches your setup.

#### Android emulator (Windows or Mac)

**First time setup:**

1. Open Android Studio and create an emulator with a **Google Play** system image (not "AOSP" — Google Maps requires Play Services).
2. Download the latest dev build APK via Slack.
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

> **Note:** Never commit `.env`, `google-services.json`, `google-config.json`, or `GoogleService-Info.plist`. These are in `.gitignore` and must be shared privately via Slack DM only.

---

## Documentation

Comprehensive documentation is available in the [`/docs`](./docs) folder:

- [Setup Guide](./docs/setup.md) — Full walkthrough of how the project was configured (Firebase, Expo, server, environment variables)

---

## Links

- [Figma](https://www.figma.com/design/g4aenc7jjiKSMHfS8hwFWU/Amherst-Connect?node-id=0-1&t=DfYE6wG8cJliXXEi-1)
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
| Software Developers | Sonny Zhang, Camila Rivera de Jesus, Anish Kamath, Kushagra Aitha, Damian Phimister, Pranav Ravi Buregoni, Maya Nedkova |

---

## Acknowledgments

- **180 Degrees Consulting UMass** — Client and community partner
- **BUILD UMass** — Student development team

---

## License

This project is proprietary software developed for 180 Degrees Consulting UMass. All rights reserved.
