# Sprint Report — Authentication

**Theme:** Authentication, onboarding, and routing  
**Completed:** 2026-04-22  
**Contributors:** Shreyansh Misra, Brian Nguyen

---

## Sprint Goal

Deliver end-to-end authentication for Amherst Connect: a user should be able to sign up or log in with email/password or Google, move through role and interest onboarding, and be routed automatically between the login, onboarding, and main app based on their auth + profile state.

---

## Tickets Delivered

| # | Ticket | Status | Primary | Assist |
| --- | --- | --- | --- | --- |
| 1 | Firebase Auth integration | Done | Shreyansh | Brian |
| 2 | Login screen | Done | Shreyansh | Brian |
| 3 | Sign-up screen | Done* | Shreyansh | — |
| 4 | Role selection screen (onboarding 1) | Done | Shreyansh | Brian |
| 5 | Interest tag screen (onboarding 3) | Done | Shreyansh | Brian |
| 6 | Route guard logic | Done | Shreyansh | Brian |
| 7 | Firestore user + profile creation | Done | Shreyansh | — |

\* See [Known Gaps](#known-gaps) — Sign-up validation is minimal on the client side.

---

## What Shreyansh Built (commit `19073c3`)

Shreyansh delivered the full first pass of the auth flow as a single cohesive feature branch (`feature/auth`, merged via PR #2):

- **`services/auth.ts`** — `signUpWithEmail`, `loginWithEmail`, `resetPassword`, `logout`, `buildGoogleCredential`, `createUserDocument`, `createRoleProfile`, `getUserDocument`, `updateUserDocument`, `checkUserExists`.
- **`services/firebase.ts`** — Firebase app / auth / firestore / storage initialization pulling config from `Constants.expoConfig.extra`.
- **`contexts/AuthContext.tsx`** — `firebaseUser`, `appUser`, `onboardingData`, loading/initialization states, and the `onAuthStateChanged` listener that hydrates the user document from Firestore.
- **`hooks/useGoogleAuth.ts`** (first version) — wired up `expo-auth-session` / `GoogleAuthProvider`.
- **`navigation/AppNavigator.tsx` + `navigation/AuthStack.tsx`** — route-guard structure with three phases (logged-out, needs-onboarding, main app).
- **Screens** — `WelcomeScreen`, `LoginScreen`, `SignUpScreen`, `RoleSelectionScreen`, `InterestSelectionScreen`.
- **Firestore data model** — `users` doc + role-specific profile docs (`student_profiles`, `faculty_staff_profiles`, `alumni_profiles`, `resident_profiles`), each keyed by `uid`, with role-appropriate default fields.

---

## What Brian Built / Fixed (in the current working branch)

Infrastructure setup (pre-sprint, commit `10e13cb`): Firebase project provisioning, Expo account, `.env` plumbing through `app.config.js`, server scaffolding.

During this sprint, the following fixes and additions landed on top of Shrey's base to make auth actually work end-to-end on device:

### Firebase / Session

- **Fixed session persistence.** `services/firebase.ts` was using the default `getAuth` which falls back to in-memory persistence in React Native — users got logged out on every cold start (PRD violation). Switched to `initializeAuth` with `getReactNativePersistence(AsyncStorage)`.
- **Added error logging** in `AuthContext` for failed user-doc fetches so sign-ins that silently wedged the app in "onboarding" mode now surface the real error in Metro.

### Google OAuth (native)

- **Removed Apple Sign-In entirely** (code, plugin, types, UI, dependency) per scope decision.
- **Registered three Google OAuth clients** in GCP (Web, iOS, Android) and wired `GOOGLE_WEB_CLIENT_ID`, `GOOGLE_IOS_CLIENT_ID`, `GOOGLE_ANDROID_CLIENT_ID` through `app.config.js` into the hook.
- **Computed `reversedIosClientId`** dynamically and injected it into `ios.config.googleSignIn.reservedClientId` so Expo adds it to `Info.plist`.
- **Added Android intent filter** for the `com.buildumass.amherstconnect` scheme so Google's OAuth redirect (`<applicationId>:/oauthredirect`) actually routes back to the app.
- **Enabled Custom URI Scheme** on the Android OAuth client in GCP (new clients have this off by default).
- **Rewrote `useGoogleAuth`** to correctly handle the `expo-auth-session` code + PKCE flow on mobile: watch the `response` state via `useEffect`, extract the ID token after the auto-exchange, and hand it to Firebase. The original implementation looked for `id_token` on the `promptAsync` result, which only contains `code` on native — so Firebase sign-in was never actually completing.
- **Added a `signingIn` flag + loading overlay** on `LoginScreen` and `SignUpScreen` so users see "Signing in…" during the 2–3s round-trip instead of a stale-looking form.

### Onboarding flow correctness

- **Introduced `onboardingComplete`** as a boolean on `AppUser` and plumbed it through `createUserDocument` / new `completeOnboarding` helper. Routing now gates on this flag instead of inferring from interest length, which closed a race condition where a mid-onboarding email sign-up could skip `InterestSelectionScreen`.
- **`InterestSelectionScreen`** now handles both paths: new Google OAuth user (no Firestore doc yet → create one and mark complete) and email sign-up user (doc already exists → just call `completeOnboarding`).
- **`RoleSelectionScreen`** now skips `SignUpScreen` when the user is already authenticated (e.g. a new Google user who came in via Login) and routes straight to `InterestSelection`.
- **`AppNavigator`** — added distinct `key` props (`"preauth"` / `"onboarding"`) to the two `<AuthStack>` branches so React remounts the stack navigator when phases change. Without this, `initialRouteName` (e.g. `"RoleSelection"`) was ignored because React reused the mounted navigator whose internal state was still on `LoginScreen`.

### Build & tooling

- **Configured EAS** (`eas.json`, `projectId: 6bdab312-…`, `owner: briann923` in `app.config.js`).
- **Built and tested an Android development client** via EAS (keystore auto-managed, SHA-1 pulled from `eas credentials`, registered with the Android OAuth client in GCP).
- **Created `docs/credentials.md`** tracking ownership of every account, console, and env var used by the project, with a handoff checklist for personnel changes.
- **Updated `docs/setup.md`** to document the Google OAuth env vars and the requirement for a development build for native Google sign-in.

---

## Testing Performed

All scenarios tested on an Android emulator (API 36.1, Google Play system image) running the EAS development build:

| Scenario | Result |
| --- | --- |
| Email sign-up → onboarding → main app | Pass |
| Email login (returning user) → main app | Pass |
| Google sign-in, new user → role selection → interests → main app | Pass |
| Google sign-in, returning user → main app | Pass (brief ~500ms RoleSelection flash, noted below) |
| Cold start with persisted session → lands on correct screen | Pass |
| Logout → returns to Welcome cleanly | Pass |
| Google Sign-In in Expo Go | Fails gracefully (button hidden / blocks at Google "access blocked" — expected, requires dev build) |

---

## Known Gaps

1. **Sign-up client-side validation is minimal.** Only an empty-field check is performed client-side; Firebase's error messages (`auth/email-already-in-use`, `auth/weak-password`, `auth/invalid-email`) are surfaced to the user via `Alert`, but there's no live password-strength meter or email-format regex. ~20-line follow-up if the team wants it.
2. **Returning-user RoleSelection flash.** When a returning Google user signs in, there's a 200–500ms window between `setFirebaseUser` and `setAppUser` (the Firestore fetch) during which `AppNavigator` briefly renders the onboarding stack. Fixable by gating on a new `userDocLoading` flag in `AuthContext`. Not shipping-blocking.
3. **iOS Google Sign-In untested end-to-end.** Requires Apple Developer Program enrollment to produce an iOS development build. All code is in place (iOS client ID, reversed scheme in Info.plist via `ios.config.googleSignIn.reservedClientId`); just waiting on the paid account.
4. **Diagnostic `console.log`s** were added this sprint in `useGoogleAuth` and `AuthContext` to aid debugging. Safe to remove before merge if desired.

---

## Follow-Up Tickets (Recommended)

- Sign-up: add password-strength indicator + client-side email-format check.
- Auth: eliminate onboarding-screen flash for returning users.
- Apple Developer enrollment + iOS dev build + verify Google Sign-In on iPhone.
- Optional: remove diagnostic logs (`[useGoogleAuth]`, `[AuthContext]`) before production.

---

## Commits & Branches

| Ref | What |
| --- | --- |
| `19073c3` | Shrey's feature/auth base (merged as PR #2) |
| `10e13cb` | Brian's initial project configuration |
| `a173bd9` | Brian's auth fixes — Google OAuth end-to-end, remove Apple Sign-In, EAS config, sprint docs (merged as PR #3) |
