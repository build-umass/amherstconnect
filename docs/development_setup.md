# Amherst Connect development setup

This guide describes development without Firebase Admin credentials. The Android development build was refreshed on October 30, 2026. Feature gaps listed below are current product limitations, not setup failures. The mobile app still requires the client values in `apps/mobile/.env`.

## Prerequisites

- Git
- Node.js 24 and npm 11 (older Node versions can't run the TypeScript tests; Expo SDK 58 needs at least 22.13)
- Java 21 for the local Firestore Emulator
- Docker Desktop for the verified local Supabase workflow
- Android Studio with the Android SDK, platform tools, and an emulator using a Google Play system image
- macOS and Xcode 26.4 or newer only if you need to run the iOS simulator

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

Obtain the actual development values securely from the current Technical Lead. Never paste credentials into issues, pull requests, chat channels, documentation, screenshots, or committed files. Never commit `apps/mobile/.env`.

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
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

These Firebase client values identify the mobile project but should still be distributed through the team's approved secure channel. Platform API restrictions must remain configured in Google Cloud.

The Supabase values are public client configuration; the committed `.env.example` leaves them blank. Use a Supabase publishable key, or a legacy `anon` key, and never use a `service_role` or `sb_secret_` key in the mobile app. The app reads these values from Expo config and creates its shared Supabase client only when `getSupabase()` is first called. Firebase Auth and existing screens continue to use their current implementation. Run the focused client tests with `npm --prefix apps/mobile test`; `npm run verify` includes them.

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

The dependency refresh uses Expo 58.0.21 and React Native 0.88.1. Install this
replacement APK after pulling the merged dependency update; the earlier SDK 58
APK was built with the previous native dependencies. Expo Go is not supported.

| Field | Verified value |
|---|---|
| EAS build | [`0e5075b3-cecd-4781-80b8-8ae1f4c4e7c5`](https://expo.dev/accounts/amherstconnect/projects/amherstconnect/builds/0e5075b3-cecd-4781-80b8-8ae1f4c4e7c5) |
| APK | [Download the signed development APK](https://expo.dev/artifacts/eas/G2nPbLHR6OMnHpMQLKqI_Y0Vk67uVlvGiAwm0w-EUq4.apk) (temporary EAS artifact link) |
| Downloaded filename | `amherst-connect-development-54a340c-0e5075b3.apk` |
| Source commit | `54a340c00b2a360ab1272884b45a81ac63330bf4` (`feature/a08-localist-mappings`, Expo SDK 58) |
| Created | `2026-10-30T07:08:42.083Z` |
| Completed | `2026-10-30T07:20:56.974Z` |
| Artifact expiration | `2026-11-13T07:08:42.176Z` |
| SHA-256 | `69cc391de7094c8c15a33846dbe29e6a7489a7c65d51d9dbefa5c6b654cfd3a1` |
| Size | `225,544,131` bytes |

Verified on October 30, 2026 on a Google Play `Pixel_10` emulator (Android API 37):
APK installation, Metro connection, restored existing Firebase session, Home,
Map basemap and mock markers, Deals, Profile, and the Discover placeholder.
These checks establish screen startup/rendering, not completeness of bookmarks,
RSVPs, deals, resources, notifications, Google login or the future Supabase Auth
cutover. Event Details was not independently confirmed in this runtime pass.
Home still shows existing test data and Map still uses mock events.

Installing over the exact previous verified APK succeeded with `adb install -r`;
the signing certificate matches, so uninstalling the old app is unnecessary.
The original saved emulator was preserved using a disposable read-only instance.
An initial missing GPS fix caused the existing Map location-request error. Set a
simulated position in Android Studio's Extended Controls > Location before Map
checks; location-error handling was not changed in this dependency update.

From the repository root, install the downloaded replacement with:

```sh
adb install -r path/to/amherst-connect-development-54a340c-0e5075b3.apk
```

Replace the example path with the actual download location. This command also
works in Windows PowerShell. The EAS link expires on November 13, 2026 at
07:08:42 UTC. Link expiration does not disable a downloaded APK. The Project Lead
may keep distributing the saved file after checking its SHA-256 against the table.
Keep a copy in a persistent team-controlled location; the APK is not committed.

## Start the mobile app

With the emulator running and the development build installed:

```bash
cd apps/mobile
npx expo start --dev-client
```

Press `a` to open Android. Restart Metro with `--clear` after changing environment values. A new native development build is required after changing native dependencies or native configuration.

## Rebuild and run iOS after native dependency changes

On a Mac with full Xcode installed, open Xcode once to finish setup and install
an iOS Simulator runtime. Command Line Tools alone are insufficient. Confirm
`xcodebuild -version` and `xcrun simctl list devices available` work before building.
Keep your existing private `apps/mobile/.env` in place. Preserve any custom native
changes before regenerating the local project.

From the repository root after pulling the merged `dev`:

```bash
npm --prefix apps/mobile ci
cd apps/mobile
npx expo prebuild --platform ios
npx expo run:ios
```

Prebuild refreshes the generated iOS project for the installed dependencies. The
run command rebuilds and installs the development app and starts Metro. A local
simulator build does not require EAS internal-distribution signing credentials. Generated
`ios/` files are ignored by Git. If you maintain custom native changes, preserve
them before regenerating a native project; do not blindly delete the directory.
For an already installed, compatible rebuild, start Metro with
`npx expo start --dev-client` and press `i`.

On 2026-10-30, the replacement iOS build and runtime check were **blocked**:
this verification Mac has only Command Line Tools, with no full Xcode or `simctl`.
The EAS `development` build attempt also found no existing credentials suitable
for iOS internal distribution. Credentials were kept frozen; none were created or
changed. A physical-device EAS build therefore needs the Project Lead to resolve
Apple signing separately. Android checks and iOS exports do not establish iOS
startup, Metro connectivity, or screen behavior. An iOS developer must perform
those runtime checks after rebuilding with full Xcode.

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

This runs Firestore security-rule emulator tests, mobile Supabase client tests, the Expo SDK dependency compatibility check, mobile TypeScript, server syntax checks, and server tests. It requires Java 21 but does not require Firebase credentials or mobile `.env` values.

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

## Local Supabase development

Docker Desktop is the verified default. Start it before continuing. On Linux,
start the Docker service. The same commands work in Windows PowerShell.

Run every command below from the repository root. The repository uses its
pinned Supabase CLI through `npx`. Cloud credentials, Dashboard access, and
remote project linking are not required for this local workflow.

### Start, reset, and verify

Start the local stack and check its status:

```bash
npx supabase start
npx supabase status
```

Reset the local database:

```bash
npx supabase db reset --local
```

**Warning:** this deletes all local database data, then reapplies the migrations
and reloads the seed data.

Check the generated seed, run the database tests, and lint the project-owned
`public` schema:

```bash
npm run db:seed:check
npx supabase test db --local
npx supabase db lint --local --schema public --fail-on error
```

Stop the local stack when finished:

```bash
npx supabase stop
```

### Fake local accounts and seed data

The seed contains fictional users, organizations, events, categories,
occurrences, bookmarks, and RSVPs with stable relationships and fixed dates.
Public Amherst-area venue names are used for realistic testing.

Use password `password123` with any local test account:

- `seed.student1@example.test`
- `seed.student2@example.test`
- `seed.student3@example.test`
- `seed.faculty@example.test`
- `seed.alumni@example.test`
- `seed.resident@example.test`

These accounts exist only in local Supabase. The mobile app still uses Firebase
Authentication, so it does not recognize these accounts yet.

To change the seed, edit `supabase/scripts/seed-data.mjs`. Do not edit the
generated SQL directly. Regenerate and check it with:

```bash
npm run db:seed:generate
npm run db:seed:check
```

### Optional `just` shortcuts

The root `Justfile` is optional. Developers can always use the commands above.

| Shortcut | Command run |
|---|---|
| `just db-start` | `npx supabase start` |
| `just db-start-native` | `npx supabase start --runtime native` |
| `just db-reset` | `npx supabase db reset` |
| `just db-test` | `npx supabase test db` |
| `just seed` | `npm run db:seed:generate` |
| `just seed-check` | `npm run db:seed:check` |
| `just db-stop` | `npx supabase stop` |

### Troubleshooting the runtime

If Docker is unavailable and the native runtime is supported on your system,
start a new stack with `npx supabase start --runtime native`. The CLI remembers
the runtime used to create a stack. If it reports a runtime mismatch, keep using
that stack's original runtime instead of deleting the stack to switch runtimes.

Generated Supabase state is ignored by `supabase/.gitignore` and must not be
committed.

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
- Web remains unsupported because the native map import has no web implementation.

Do not treat these product gaps as evidence that local installation failed.
