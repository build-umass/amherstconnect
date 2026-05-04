import { useCallback, useEffect, useRef, useState } from 'react';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import { buildGoogleCredential } from '../services/auth';

WebBrowser.maybeCompleteAuthSession();

const webClientId = Constants.expoConfig?.extra?.googleWebClientId as string | undefined;
const iosClientId = Constants.expoConfig?.extra?.googleIosClientId as string | undefined;
const androidClientId = Constants.expoConfig?.extra?.googleAndroidClientId as string | undefined;

if (__DEV__ && !webClientId) {
  console.warn(
    '[useGoogleAuth] GOOGLE_WEB_CLIENT_ID is not set in apps/mobile/.env — ' +
    'the "Continue with Google" button will be hidden.',
  );
}

/**
 * Google sign-in hook. Uses `expo-auth-session/providers/google`, which picks
 * the right OAuth client per platform (iOS / Android / Web) and handles the
 * redirect-URI scheme Google requires for each.
 *
 * On native, the library runs an authorization-code + PKCE flow: `promptAsync`
 * resolves with `{ code }` first, then the library asynchronously exchanges
 * the code for an `id_token` and surfaces it on the `response` state. We
 * therefore drive Firebase sign-in from a `useEffect` that watches `response`,
 * not from the `promptAsync` promise directly.
 *
 * AppNavigator reacts to Firebase `onAuthStateChanged` and Firestore user-doc
 * presence to route the user to onboarding or the main app — this hook just
 * has to complete the Firebase sign-in.
 *
 * Exposes `signingIn` so the screen can show a loading overlay while the
 * Google code-exchange and Firebase sign-in are in flight (~1–3s total).
 *
 * Note: native Google sign-in does not work in Expo Go — you need a
 * development build (`expo-dev-client` + `eas build --profile development`).
 */
export function useGoogleAuth() {
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId: webClientId,
    iosClientId,
    androidClientId,
  });

  const [signingIn, setSigningIn] = useState(false);

  // Guard against handling the same response twice (StrictMode, re-renders).
  const handledResponseRef = useRef<typeof response | null>(null);

  useEffect(() => {
    if (!response || response === handledResponseRef.current) return;
    handledResponseRef.current = response;

    if (response.type !== 'success') {
      // User dismissed the Google picker, or an error — clear loading state.
      setSigningIn(false);
      return;
    }

    const idToken =
      (response.params as { id_token?: string }).id_token ??
      response.authentication?.idToken;

    if (!idToken) {
      console.warn('[useGoogleAuth] Google returned success but no id_token was present.');
      setSigningIn(false);
      return;
    }

    console.log('[useGoogleAuth] Got id_token, calling Firebase signInWithCredential...');
    buildGoogleCredential(idToken)
      .then((cred) => {
        console.log('[useGoogleAuth] Firebase sign-in succeeded. uid:', cred.user.uid);
        // We intentionally leave `signingIn` true: AppNavigator is about to
        // unmount this screen as the auth state propagates. Clearing it here
        // would just cause a brief flicker of the un-overlayed login screen.
      })
      .catch((err) => {
        console.error('[useGoogleAuth] Firebase sign-in from Google credential failed:', err);
        setSigningIn(false);
      });
  }, [response]);

  const promptGoogleSignIn = useCallback(async (): Promise<void> => {
    if (!request) return;
    setSigningIn(true);
    try {
      const result = await promptAsync();
      // If the user dismissed the Google account picker, clear loading now.
      // If it succeeded, the response effect takes over and keeps the overlay
      // up through the Firebase step.
      if (result?.type !== 'success') {
        setSigningIn(false);
      }
    } catch (error) {
      console.error('[useGoogleAuth] Google sign-in prompt error:', error);
      setSigningIn(false);
      throw error;
    }
  }, [request, promptAsync]);

  return {
    promptGoogleSignIn,
    signingIn,
    ready: !!webClientId && !!request,
  };
}
