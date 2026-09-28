# Amherst Connect development setup

This guide describes the verified development workflow without Firebase Admin credentials as of September 28, 2026. Feature gaps listed below are current product limitations, not setup failures. The mobile app still requires the client values in `apps/mobile/.env`.

## Prerequisites

- Git
- Node.js 24 and npm 11 (Node.js 20 or newer is required by the verification tooling)
- Java 21 for the local Firestore Emulator
- Android Studio with the Android SDK, platform tools, and an emulator using a Google Play system image
- macOS and full Xcode only if you need to run the iOS simulator

Expo Go is not supported because the application uses native modules. Use the Amherst Connect Expo development build.

## Current ownership and service constraints

- The Expo project belongs to the `amherstconnect` organization. Kushagra Aitha is an Owner.
- Kushagra has Owner access to the `amherst-connect` Firebase/Google Cloud project and Admin access to the GitHub repository.
- Firebase is on the Spark plan, and the Google Cloud project has no billing account attached.
- Firebase Storage is initialized by the app but is not currently usable under this configuration. Storage-dependent features are not part of the verified mobile workflow.
- Mobile `.env` values exist outside version control and must be obtained securely from the Project Lead.
- Firebase Admin credentials are not available to normal developers and are not required to run the mobile app, the server health endpoint, or the verification suite.

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
2. Make the Android SDK tools available to Expo and your shell:

   **macOS (`zsh`)** — add these lines to `~/.zshrc`, then open a new terminal:

   ```bash
   export ANDROID_HOME="$HOME/Library/Android/sdk"
   export PATH="$PATH:$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools"
   ```

   **Windows** — in **System Properties → Environment Variables**, create
   `ANDROID_HOME` with value `%LOCALAPPDATA%\Android\Sdk`, then add these two
   entries to the user `Path`:

   ```text
   %ANDROID_HOME%\platform-tools
   %ANDROID_HOME%\emulator
   ```

3. In Device Manager, create an Android virtual device with a Google Play system image. An AOSP-only image does not include the Google Play services needed by Maps.
4. Start the emulator and confirm that `adb devices` lists one device with status `device`. If `adb` is not found, reopen the terminal after setting the paths above.
5. Obtain the verified Amherst Connect development APK recorded below. The APK is not committed to Git. Use the EAS artifact link while it is active, or obtain the saved, checksum-verified APK from the Project Lead. Expiration of the EAS link does not invalidate or disable an APK that was already downloaded. A replacement build is required only if the verified APK was not retained, is incompatible, or native dependencies/native configuration changed.
6. Install it by dragging the APK onto the running emulator, or run `adb install -r path/to/amherst-connect-development.apk`.

Do not substitute Expo Go for the development build.

### Verified Android development APK

The current artifact metadata is recorded only after the APK has been built,
downloaded, checksum-verified, installed, and launched against this repository
revision. Do not substitute an older APK merely because it has the same app
version.

| Field | Verified value |
|---|---|
| EAS build | [`61c6d50c-f9c7-4c6b-a0d4-5458ebe1939b`](https://expo.dev/accounts/amherstconnect/projects/amherstconnect/builds/61c6d50c-f9c7-4c6b-a0d4-5458ebe1939b) |
| APK | [Download the signed development APK](https://expo.dev/artifacts/eas/UwSStdzWhqh8uDIHLiPQu3SWuI8YJgVEC_vEi8MRpWc.apk) |
| Source commit | `bf67c2f2daa9acbfe37c92b4fbf431b3dab2a50b` (`dev`) |
| Created | `2026-09-28T18:54:59.548Z` |
| Completed | `2026-09-28T19:52:58.171Z` |
| Artifact expiration | `2026-10-12T18:54:59.621Z` |
| SHA-256 | `7c569e21c6b10e421671094e892d545883ac40357ae4103c27de0c4066c62eea` |
| Size | `170,420,576` bytes |

This exact APK was downloaded, checksum-verified, installed over the existing
EAS-signed app on a Google Play `Pixel_10` emulator, connected to Metro from a
fresh clone, and launched successfully on September 28, 2026. EAS artifact
links expire, but expiration does not disable the downloaded APK. The Project
Lead may continue distributing the saved file after verifying its SHA-256
against this table. Produce and verify a replacement only if this APK was not
retained, becomes incompatible, or native dependencies/native configuration
changed.

## Start the mobile app

With the emulator running and the development build installed:

```bash
cd apps/mobile
npx expo start --dev-client
```

Press `a` to open Android. Restart Metro with `--clear` after changing environment values. A new native development build is required after changing native dependencies or native configuration.

## Run the server without Firebase Admin credentials

The server can start without Firebase administrator credentials:

```bash
cd server
npm start
```

`GET http://localhost:3000/health` returns `200`. Firebase-dependent API routes return a controlled `503 FIREBASE_UNAVAILABLE` response, and Firebase background jobs remain disabled.

The Firebase-dependent routes require Firebase Admin credentials. Service-account private keys grant broad administrative access and must not be distributed to every developer. Only an explicitly authorized backend operator should obtain a key from the Project Lead through the approved secret-management process, store it outside version control, and configure `server/.env` from `server/.env.example`. Never commit or paste service-account JSON.

When a valid authorized service-account file is configured, the existing authenticated routes and Firebase background services initialize normally.

## Verification

Run the complete verification without Firebase Admin credentials from the repository root:

```bash
npm run verify
```

This runs Firestore security-rule emulator tests, the Expo SDK dependency compatibility check, mobile TypeScript, server syntax checks, and server tests. It requires Java 21 but does not require Firebase credentials or mobile `.env` values.

Native bundle exports can be checked separately.

**macOS/Linux:**

```bash
cd apps/mobile
npx expo export --platform ios --output-dir /tmp/amherst-connect-ios
npx expo export --platform android --output-dir /tmp/amherst-connect-android
```

**Windows PowerShell:**

```powershell
cd apps/mobile
npx expo export --platform ios --output-dir "$env:TEMP\amherst-connect-ios"
npx expo export --platform android --output-dir "$env:TEMP\amherst-connect-android"
```

## Currently verified behavior

- Android development build installation and Metro connectivity
- Authentication state and user-profile loading
- Interest and notification-preference persistence
- Home and Firestore event reads
- Map rendering
- Deals UI
- Profile and Settings
- Server health endpoint without Firebase Admin credentials
- Controlled `503` responses when Firebase Admin is unavailable
- Firestore security rules through the local emulator

## Known incomplete features

- Home still displays old mock/test event documents stored in Firestore.
- Map uses a separate hardcoded event dataset.
- Map **View Event** does nothing.
- Event Details **View on Map** opens the general Map tab without selecting the event.
- Discover opens but is empty; the resource directory is not implemented.
- Deals are hardcoded and claim state is not persisted.
- RSVP state is temporary; no RSVP document is created and **Profile → My RSVPs** remains empty.
- Event Details does not render bookmark or share controls, although bookmark service code exists.
- End-to-end push delivery and the Firebase-backed background jobs remain unverified without authorized server credentials and a deployed server.
- Firebase Storage is unavailable on the current Spark/no-billing configuration.
- iOS runtime has not been verified because full Xcode was unavailable during stabilization.
- Web remains unsupported because the native map import has no web implementation.

Do not treat these product gaps as evidence that local installation failed.
