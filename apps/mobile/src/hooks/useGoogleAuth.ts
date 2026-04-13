import { useState, useCallback } from 'react';
import { makeRedirectUri } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import { buildGoogleCredential, checkUserExists } from '../services/auth';

WebBrowser.maybeCompleteAuthSession();

const googleWebClientId = Constants.expoConfig?.extra?.googleWebClientId;

/**
 * Google sign-in hook. Returns ready: false when GOOGLE_WEB_CLIENT_ID is not
 * configured in .env, so the button can be hidden or disabled.
 */
export function useGoogleAuth() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ isNewUser: boolean } | null>(null);

  const promptGoogleSignIn = useCallback(async () => {
    if (!googleWebClientId) return;

    setLoading(true);
    setResult(null);
    try {
      const redirectUri = makeRedirectUri({ scheme: 'amherstconnect' });

      const authUrl =
        `https://accounts.google.com/o/oauth2/v2/auth` +
        `?client_id=${googleWebClientId}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&response_type=id_token` +
        `&scope=openid%20profile%20email` +
        `&nonce=${Date.now()}`;

      const authResult = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);

      if (authResult.type === 'success' && authResult.url) {
        const params = new URLSearchParams(authResult.url.split('#')[1]);
        const idToken = params.get('id_token');
        if (idToken) {
          const userCredential = await buildGoogleCredential(idToken);
          const isNew = !(await checkUserExists(userCredential.user.uid));
          setResult({ isNewUser: isNew });
        }
      }
    } catch (error) {
      console.error('Google sign-in error:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    promptGoogleSignIn,
    loading,
    result,
    ready: !!googleWebClientId,
  };
}
