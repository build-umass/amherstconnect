# Amherst Connect development setup

This guide describes the verified credential-free development workflow as of September 26, 2026. Feature gaps listed below are current product limitations, not setup failures.

## Prerequisites

- Git
- Node.js 24 and npm 11 (Node.js 20 or newer is required by the verification tooling)
- Java 21 for the local Firestore Emulator
- Android Studio with the Android SDK, platform tools, and an emulator using a Google Play system image
- macOS and full Xcode only if you need to run the iOS simulator

Expo Go is not supported because the application uses native modules. Use the Amherst Connect Expo development build.

## Clone the development branch

```bash
git clone https://github.com/build-umass/amherstconnect.git
cd amherstconnect
git checkout dev
git pull --ff-only origin dev
```

## Install dependencies

Use clean installs from the committed lockfiles:

```bash
npm ci
npm --prefix apps/mobile ci
npm --prefix server ci
```

The root installation provides Firestore Emulator testing tools. Mobile and server dependencies are installed independently.

## Mobile environment

Copy the committed variable-name template:

```bash
cp .env.example apps/mobile/.env
```

Obtain the actual development values securely from the current Project Lead. Never paste credentials into issues, pull requests, chat channels, documentation, screenshots, or committed files. Never commit `apps/mobile/.env`.

The required mobile variable names are:

- `FIREBASE_API_KEY`
- `FIREBASE_AUTH_DOMAIN`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_STORAGE_BUCKET`
- `FIREBASE_MESSAGING_SENDER_ID`
- `FIREBASE_APP_ID`
- `GOOGLE_MAPS_API_KEY`
- `GOOGLE_WEB_CLIENT_ID`
- `GOOGLE_IOS_CLIENT_ID`
- `GOOGLE_ANDROID_CLIENT_ID`

These Firebase client values identify the mobile project but should still be distributed through the team's approved secure channel. Platform API restrictions must remain configured in Google Cloud.

## Android Studio and emulator

1. Install Android Studio and its Android SDK/platform tools.
2. In Device Manager, create an Android virtual device with a Google Play system image. An AOSP-only image does not include the Google Play services needed by Maps.
3. Start the emulator and confirm that `adb devices` lists it.
4. Obtain the current Amherst Connect Android development-build APK from the Project Lead or approved organizational artifact store.
5. Install the APK by dragging it onto the running emulator, or use `adb install path/to/development-build.apk`.

Do not substitute Expo Go for the development build.

## Start the mobile app

With the emulator running and the development build installed:

```bash
cd apps/mobile
npx expo start --dev-client
```

Press `a` to open Android. Restart Metro with `--clear` after changing environment values. A new native development build is required after changing native dependencies or native configuration.

## Run the credential-free server

The server can start without Firebase administrator credentials:

```bash
cd server
npm start
```

`GET http://localhost:3000/health` returns `200`. Firebase-dependent API routes return a controlled `503 FIREBASE_UNAVAILABLE` response, and Firebase background jobs remain disabled.

The Firebase-dependent routes require Firebase Admin credentials. Service-account private keys grant broad administrative access and must not be distributed to every developer. Only an explicitly authorized backend operator should obtain a key from the Project Lead through the approved secret-management process, store it outside version control, and configure `server/.env` from `server/.env.example`. Never commit or paste service-account JSON.

When a valid authorized service-account file is configured, the existing authenticated routes and Firebase background services initialize normally.

## Verification

Run the complete credential-free verification from the repository root:

```bash
npm run verify
```

This runs Firestore security-rule emulator tests, the Expo SDK dependency compatibility check, mobile TypeScript, server syntax checks, and server tests. It requires Java 21 but does not require Firebase credentials or mobile `.env` values.

Native bundle exports can be checked separately:

```bash
cd apps/mobile
npx expo export --platform ios --output-dir /tmp/amherst-connect-ios
npx expo export --platform android --output-dir /tmp/amherst-connect-android
```

## Currently verified behavior

- Android development build installation and Metro connectivity
- Authentication state and user-profile loading
- Interest and notification-preference persistence
- Home and Firestore event reads
- Map rendering
- Deals UI
- Profile and Settings
- Credential-free server health endpoint
- Controlled `503` responses when Firebase Admin is unavailable
- Firestore security rules through the local emulator

## Known incomplete features

- Home still displays old mock/test event documents stored in Firestore.
- Map uses a separate hardcoded event dataset.
- Map **View Event** does nothing.
- Event Details **View on Map** opens the general Map tab without selecting the event.
- Discover opens but is empty.
- Deals are hardcoded and claim state is not persisted.
- RSVP state is temporary; no RSVP document is created and **Profile → My RSVPs** remains empty.
- Event Details does not render bookmark or share controls, although bookmark service code exists.
- iOS runtime has not been verified because full Xcode was unavailable during stabilization.
- Web remains unsupported because the native map import has no web implementation.

Do not treat these product gaps as evidence that local installation failed.
