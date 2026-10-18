# Firebase Auth to Supabase Auth Cutover Strategy

**Decision:** Clean Supabase Auth cutover

**Status:** Architecture decision; implementation is not part of F04

**Inputs:** Verified repository state and completed F02 Firebase inventory

## 1. Executive decision

Amherst Connect will replace Firebase Authentication with Supabase Auth in one controlled pre-production cutover.

- Do not build a Firebase-to-Supabase Auth bridge.
- Do not export users, password hashes, provider tokens, or Firebase UIDs.
- Do not migrate the 12 clearly test accounts.
- The three likely-real historical/development users will register again through Supabase if they still need access.
- Continue supporting Email/Password and Google.
- Keep the existing Firebase implementation and project functional until the Supabase implementation passes the acceptance criteria in this document.
- Do not write identity or profile data to Firebase and Supabase in parallel.

This is a clean identity reset, not an account migration.

## 2. Why clean cutover was selected

F02 verified 15 Firebase Auth users: 12 clearly test, 3 likely-real historical/development accounts, and no uncertain accounts. The application has no public production users and Firestore has no valuable production data requiring identity preservation.

A bridge would add temporary token exchange, cross-provider identity mapping, dual authorization assumptions, rollback complexity, and eventual bridge removal. Those costs do not protect meaningful production continuity in this project. Re-registration is the safer and smaller operation.

The three likely-real accounts represent real people, but historical presence does not create a migration requirement. Their old passwords, Firebase UIDs, sessions, and provider links will not carry forward.

## 3. Verified current authentication boundaries

| Boundary | Current behavior | Cutover requirement |
|---|---|---|
| Mobile client initialization | `services/firebase.ts` initializes persistent Firebase Auth, Firestore, and Storage and requires all `FIREBASE_*` values. | Introduce one Supabase client with persistent React Native sessions. Firebase initialization remains until all authenticated Firestore paths in the cutover scope are replaced. |
| Email/Password | `services/auth.ts` signs up, signs in, resets passwords, and signs out through Firebase. | Replace with Supabase Auth calls and Supabase-compatible confirmation/reset callbacks. |
| Google | `useGoogleAuth.ts` obtains a Google ID token through Expo and exchanges it for a Firebase credential. | Replace with Supabase-hosted Google OAuth and an app deep-link callback. Do not pass the Google token to Firebase. |
| Session state | `AuthContext.tsx` uses `onAuthStateChanged`, Firebase `User`, and Firestore profile loading. | Use a provider-neutral auth user/session, restore the Supabase session, subscribe to Supabase auth changes, then load `profiles`. |
| Route guard | `AppNavigator.tsx` combines `firebaseUser`, Firestore `appUser`, and onboarding state. | Route from explicit Supabase session/profile states without rendering protected screens before initialization finishes. |
| Profile creation | Signup/onboarding writes `users` plus one role-profile collection in Firestore. | Insert one authenticated user's `profiles` row with `id = auth.uid()`. No Firebase UID mapping is created. |
| Express authentication | `server/middleware/auth.js` verifies Firebase ID tokens and exposes `req.user.uid`. | Verify a Supabase access token and expose a provider-neutral authenticated subject based on the verified `sub` claim. |
| Express data access | User and other controllers use Firebase Admin and Firebase document IDs. | Migrate or retire each affected controller with its data path. A Supabase identity must not be used against Firebase user documents. |
| Authorization | Firestore Rules use Firebase identity; PostgreSQL RLS uses `auth.uid()`. | Supabase Auth user UUID must equal `profiles.id`; client authorization is enforced by RLS. |

## 4. Account treatment

### Test accounts

All 12 clearly test Firebase Auth accounts and their test/mock Firestore data are discarded. They are not recreated automatically. Developers create fresh Supabase test accounts through normal application flows or deterministic local test setup.

### Historical/development accounts

The three likely-real users receive no automatic continuity. Any person who still needs access registers again through Email/Password or Google after the Supabase cutover. The new Supabase Auth UUID becomes the permanent application identity.

No password-reset message should imply that a Firebase account was migrated. If needed, the project team should communicate that development accounts were reset before public launch.

## 5. Identity and profile contract

The deployed schema fixes the identity relationship:

- `auth.users.id` is the Supabase Auth identity.
- `public.profiles.id` is both the profile primary key and a foreign key to `auth.users.id` with cascade deletion.
- RLS permits an authenticated user to insert, read, and update only a profile where `profiles.id = auth.uid()`.
- Mobile clients use the publishable key and the user's session. They never receive a secret/service-role key.
- Privileged backend work uses a separately protected server credential only when required; it must never be used to bypass user ownership for ordinary client operations.

Profile creation remains an explicit mobile operation because the deployed migration does not define an Auth trigger. After a new Supabase session exists:

1. Read `profiles` for the authenticated UUID.
2. If it exists, load it and continue according to `onboarding_complete`.
3. If it does not exist, route to onboarding.
4. After role/display-name collection, insert exactly one profile with `id` equal to the session user's UUID.
5. Treat a uniqueness conflict as a recoverable race: read the existing profile rather than creating a second identity.
6. Never accept a profile ID from form input.

The current `profiles` table contains display name, avatar URL, role, and onboarding state. It does **not** contain interests, notification preferences, education-verification fields, or the old role-profile fields. Those require separately reviewed schema/data tasks; Auth implementation must not silently store them in Auth metadata or invent columns.

## 6. Mobile migration sequence

The sequence is intentionally dependency ordered.

1. **Supabase client foundation.** Add `@supabase/supabase-js`, React Native URL support, validated public configuration, AsyncStorage persistence, automatic token refresh, and foreground/background refresh handling. Keep Firebase as the active runtime provider.
2. **Provider-neutral Auth types and service boundary.** Define session/user/error interfaces so screens and navigation do not import Firebase types. Do not add dual writes or a runtime Firebase/Supabase bridge.
3. **Profile repository and onboarding states.** Implement authenticated `profiles` read/insert/update behavior under existing RLS. Resolve the missing interests/profile-fields schema separately before claiming onboarding parity.
4. **Email/Password flows.** Implement signup, confirmation handling, password login, password-reset request, reset callback, password update, and sign-out through Supabase.
5. **Google OAuth flow.** Replace the Firebase credential exchange with Supabase Google OAuth and process the native callback into a Supabase session.
6. **Auth context and route guards.** Replace Firebase listeners with Supabase session restoration and auth-state subscription. Route among `initializing`, `signed_out`, `onboarding`, `signed_in`, and recoverable profile-error states.
7. **Authenticated mobile data paths.** Replace every client Firestore operation needed by the signed-in experience. Firestore Rules cannot recognize a Supabase session, so Auth cannot switch while required Firestore reads/writes remain.
8. **Push-token transition.** Store/remove device tokens through the approved Supabase schema while the user is authenticated. Remove the token before sign-out where policy requires ownership.
9. **Release-candidate verification.** Test a Supabase-only development build against local and development Supabase environments. The existing Firebase build remains the rollback baseline but does not receive mirrored writes.
10. **Atomic runtime cutover.** Merge and release Supabase Auth together with all required profile/data dependencies. There is no production phase where one user action writes both backends.

## 7. Email/Password flow

- Signup uses Supabase Email/Password and creates no Firebase account.
- The implementation must explicitly support the project's chosen email-confirmation policy. When confirmation is required, signup may return no active session; navigation must show a verification state rather than onboarding.
- Sign-in uses the confirmed email and Supabase password.
- Password reset sends a Supabase recovery link with an approved app redirect. The app exchanges the callback into a recovery session before allowing a password update.
- Error messages must distinguish invalid credentials, unconfirmed email, expired recovery link, offline failure, and configuration failure without revealing whether unrelated accounts exist.
- Production launch requires client-owned SMTP, sender-domain validation, approved templates, and tested delivery. Supabase's default development email service is not the production plan.

No Firebase password hash, reset state, or session is exported. Existing development users register again.

## 8. Google OAuth flow and redirects

Use Supabase-hosted Google OAuth for the mobile implementation. This provides one provider configuration and returns a Supabase session after Google succeeds.

Required flow:

1. Enable Google in Supabase Auth with a client-owned Google OAuth web client ID and secret.
2. Register the Supabase Google callback in Google Cloud: `https://<supabase-project-ref>.supabase.co/auth/v1/callback`.
3. Add the mobile callback to the Supabase Auth redirect allow list: `amherstconnect://auth/callback` (plus reviewed development variants if Expo generates a different URI).
4. Start `signInWithOAuth({ provider: 'google' })` with the callback as `redirectTo` and open the returned URL through the Expo web-browser session.
5. Parse the callback and establish the Supabase session using the supported PKCE/callback mechanism.
6. Route the new user to profile onboarding when no `profiles` row exists; otherwise restore the existing Supabase profile.

The existing Expo scheme is `amherstconnect`, but Android and iOS callback routing must be verified in a development build. Expo Go is not an acceptance environment. Any native intent-filter or associated configuration change requires a new development build.

Use only the scopes required for identity. Do not store Google access or refresh tokens because Amherst Connect does not currently call Google APIs on a user's behalf. Test cancellation, denied consent, duplicate-email/provider-linking behavior, callback replay, cold-start callbacks, and returning-user sign-in.

Official implementation references:

- [Supabase React Native Auth](https://supabase.com/docs/guides/auth/quickstarts/react-native)
- [Supabase native mobile deep linking](https://supabase.com/docs/guides/auth/native-mobile-deep-linking)
- [Supabase Google sign-in](https://supabase.com/docs/guides/auth/social-login/auth-google)

## 9. Session restoration and sign-out

Initialize the React Native Supabase client with persistent storage, `persistSession: true`, `autoRefreshToken: true`, and `detectSessionInUrl: false`. Start token refresh while the app is active and stop it while backgrounded, following the current [Supabase React Native guidance](https://supabase.com/docs/guides/auth/quickstarts/react-native).

Startup order:

1. Enter `initializing`; render no authenticated navigation.
2. Restore the persisted Supabase session.
3. Subscribe once to Supabase auth-state changes.
4. If no session exists, clear profile/onboarding state and route signed out.
5. If a session exists, load the matching `profiles` row under RLS.
6. Route to onboarding for a missing/incomplete profile, or the main app for a complete profile.
7. Surface profile network/configuration errors separately; do not misclassify them as missing profiles or destroy a valid session.

Sign-out must remove any user-owned device-token registration that should not survive logout, call Supabase sign-out, clear in-memory profile/onboarding state, and return to the signed-out stack. A failed token cleanup must not leave the user trapped in an authenticated UI, but should be logged for server-side cleanup.

## 10. Express token-verification sequence

The Express server must never decode a JWT without cryptographic verification.

1. Add a Supabase server configuration module that fails safely when required configuration is unavailable.
2. Replace Firebase middleware with middleware that accepts a Bearer Supabase access token and verifies it using Supabase Auth's supported claims/user verification or the project's JWKS.
3. Validate signature, issuer, expiry, and authenticated role. Use the verified `sub` as the application user ID.
4. Expose a provider-neutral request identity such as `req.auth.userId`; do not preserve Firebase-specific `req.user.uid` in new controllers.
5. Return `401` for missing, invalid, expired, wrong-project, or signed-out tokens. Preserve a controlled configuration-unavailable response when the server cannot verify tokens safely.
6. Migrate each protected controller to Supabase/PostgreSQL or retire it before switching its middleware. A new Supabase UUID will not match an old Firebase document ID.
7. Add tests for valid ownership, cross-user access, expiry, malformed tokens, wrong issuer/audience, missing configuration, and health-route independence.
8. Switch all protected routes together only after controller authorization tests pass.

For current Supabase projects using asymmetric signing keys, verified claims/JWKS can avoid an Auth-server request on every call. The implementation must use an official client method or maintained JWT library and handle key rotation; it must not implement signature algorithms manually. See [Supabase JWT verification](https://supabase.com/docs/guides/auth/jwts).

## 11. Environment-variable transition

### Mobile public configuration

Add these public values to the canonical mobile template and Expo configuration during implementation:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

The publishable key is intended for client use and relies on RLS for authorization. A secret/service-role key must never appear in the mobile environment, bundle, Expo configuration, logs, or documentation values.

The existing `FIREBASE_*` variables remain required only while executable mobile Firebase dependencies remain. Remove them from mobile configuration and onboarding documentation in the final cutover PR, not earlier. Google provider secrets belong in the Supabase dashboard/local secret environment, not the mobile `.env`.

### Server configuration

The server implementation must define names for:

- Supabase project URL;
- a publishable key when an official client needs it for token validation;
- a protected server secret only for explicitly privileged database operations.

The server secret must remain server-only. Remove `FIREBASE_SERVICE_ACCOUNT_KEY_PATH` only after every Firebase Admin controller/job has been migrated or retired and rollback signoff is complete.

No environment value is changed by F04.

## 12. Runtime acceptance criteria

The cutover is not verified until all applicable checks pass in a development build and automated tests:

### Mobile

- A new Email/Password user can sign up, complete required confirmation, create exactly one owned profile, finish onboarding, and reach the main app.
- A returning Email/Password user can sign in, cold-start the app, restore the session/profile, refresh a token, and sign out.
- Password-reset links open the installed app, establish the correct recovery state, and permit a password change; expired/replayed links fail safely.
- A new and returning Google user can sign in on Android through the development client; cancellation and denied consent recover cleanly.
- iOS Google/callback behavior is separately verified before an iOS release.
- A missing profile routes to onboarding; a database/network error does not masquerade as a missing profile.
- Route guards never flash protected screens while initialization is unresolved.
- Cross-user profile reads/writes fail under RLS, and no client can choose another profile UUID.
- No required signed-in feature still depends on a Firebase-authenticated Firestore client.

### Server

- `/health` remains credential-independent.
- A valid Supabase access token authenticates the correct subject.
- Missing, expired, malformed, wrong-project, and tampered tokens receive controlled failures.
- Ownership checks use the verified Supabase UUID.
- Protected routes no longer assume Firebase document IDs or Firebase token claims.
- No secret/service-role value is exposed to clients or logs.

### Regression and operations

- Auth, RLS, mobile TypeScript, server tests, CI, Android build, deep links, and credential scans pass.
- The project team records the exact tested development build and Supabase environment.
- The three historical/development users can create fresh accounts; no continuity claim is made.

## 13. Rollback procedure

Rollback is release rollback, not dual writing.

1. Before cutover, retain the last verified Firebase-based commit/build and keep the Firebase project/providers unchanged.
2. Perform the cutover before public enrollment and in a controlled test window.
3. If acceptance fails, stop the Supabase release and restore the last verified Firebase app/server version.
4. Discard Supabase test accounts/data created only during the failed test window according to an approved cleanup procedure; do not copy them into Firebase.
5. Fix forward in the Supabase branch and repeat the full acceptance suite.

Once public users are allowed to register through Supabase, rollback to Firebase would lose new account continuity and therefore requires a separate incident/data decision. This is why all cutover acceptance must finish before public launch.

## 14. Exact Firebase removal point

Firebase Auth may be removed from the active application code only when all of the following are true:

1. Supabase Email/Password, Google, session restoration, sign-out, recovery, profile creation, route guards, RLS, and Express verification pass the acceptance criteria.
2. Every mobile Firestore path required by authenticated screens has been migrated or removed; no feature expects a Firebase token for Firestore Rules.
3. Every protected Express route has a Supabase-compatible controller and authorization test, or has been retired.
4. Notification/device-token behavior no longer writes identity-owned Firebase documents.
5. A verified development build passes Android runtime testing; iOS passes before any iOS release.
6. The Technical Lead approves the cutover and rollback artifact.

At that point, one cutover PR removes Firebase Auth imports, Firebase-specific Auth types, Firebase token verification, and obsolete mobile Auth variables. The remote Firebase Auth providers and Firebase Admin credentials remain unchanged during a short, explicitly approved rollback observation window. They may be disabled and credentials retired only after the window closes and no Firebase data/job dependency remains.

## 15. Follow-on implementation tasks

| Implementation task | Required result | Prerequisites |
|---|---|---|
| Supabase mobile client foundation | Validated public client configuration, persistent session storage, refresh lifecycle, and configuration tests | F04 decision; existing Supabase project |
| Provider-neutral Auth domain | Firebase-free user/session/error interfaces and an Auth service boundary | Client foundation |
| Profile/onboarding repository | Own-profile read/insert/update under RLS, race handling, and explicit missing/error states | Client foundation; approved profile fields |
| Email/Password implementation | Signup, confirmation, login, recovery callback, password update, sign-out, and tests | Auth domain; redirect and SMTP decisions |
| Google OAuth implementation | Supabase provider flow, deep-link callback, new/returning-user handling, and Android runtime tests | Google/Supabase dashboard configuration; Auth domain |
| AuthContext and navigation conversion | Supabase session restoration and deterministic route-state machine | Email/Google services; profile repository |
| Authenticated data-path migration | Required signed-in screens no longer depend on Firebase Auth/Firestore | Supabase repositories and schemas for those features |
| Express verifier and controller conversion | Verified Supabase Bearer tokens, provider-neutral request identity, migrated controllers, and negative tests | Server configuration; relevant PostgreSQL repositories |
| Notification identity conversion | Supabase-owned device-token/preferences lifecycle and sign-out cleanup | Approved notification schema/RLS |
| Cutover and rollback verification | Supabase-only release candidate, full acceptance evidence, retained Firebase rollback artifact | All preceding implementation tasks |
| Firebase removal | Remove obsolete code/config only after cutover signoff; later disable remote providers after observation window | Verified cutover; no remaining Firebase dependencies |

These tasks can be developed on separate branches where interfaces do not overlap, but the runtime provider switch, AuthContext/navigation change, authenticated data-path migration, and Express middleware switch must be integrated and released in dependency order.

## 16. External configuration still required

Before implementation can be accepted, an authorized project operator must provide or confirm:

- Email/Password and Google enabled in the correct Supabase development project;
- the email-confirmation policy for development and production;
- the Supabase Site URL and exact redirect allow list;
- a client-owned Google OAuth web client ID and secret configured in Supabase;
- the Supabase callback registered in Google Cloud;
- Android custom-scheme callback behavior in the development build;
- iOS bundle/callback configuration before iOS testing;
- production SMTP provider, sending domain, sender identity, templates, and recovery/confirmation URLs;
- the server's JWT verification method based on the project's active signing-key system;
- the rollback observation-window length and explicit shutdown approval.

None of these settings are changed by F04.
