import { useState } from 'react';
import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { buildAppleCredential, checkUserExists } from '../services/auth';

export function useAppleAuth() {
  const [loading, setLoading] = useState(false);

  const isAvailable = Platform.OS === 'ios';

  const signInWithApple = async (): Promise<{ isNewUser: boolean }> => {
    if (!isAvailable) {
      throw new Error('Apple Sign-In is only available on iOS');
    }

    setLoading(true);
    try {
      // Generate a random nonce for security
      const rawNonce = Crypto.randomUUID();
      const hashedNonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        rawNonce,
      );

      const appleCredential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });

      const idToken = appleCredential.identityToken;
      if (!idToken) throw new Error('No identity token received from Apple');

      const userCredential = await buildAppleCredential(idToken, rawNonce);
      const isNew = !(await checkUserExists(userCredential.user.uid));

      return { isNewUser: isNew };
    } finally {
      setLoading(false);
    }
  };

  return {
    signInWithApple,
    loading,
    isAvailable,
  };
}
