import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

const supabaseConfig = {
  url:            Constants.expoConfig?.extra?.supabaseUrl,
  publishableKey: Constants.expoConfig?.extra?.supabasePublishableKey,
};

const missingSupabaseConfig = Object.entries(supabaseConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missingSupabaseConfig.length > 0) {
  throw new Error(
    `Missing Supabase config: ${missingSupabaseConfig.join(', ')}. ` +
    'Create apps/mobile/.env with SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY and restart Expo.'
  );
}

// Single shared client. Only the publishable key belongs in the app; access to
// data is enforced by the database's row-level security, never by this key.
export const supabase = createClient(supabaseConfig.url, supabaseConfig.publishableKey, {
  auth: {
    // Persist the session across app restarts via AsyncStorage.
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    // There is no browser URL to parse in React Native; auth callbacks are
    // handled explicitly from deep links.
    detectSessionInUrl: false,
  },
});

// Only refresh tokens while the app is in the foreground.
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
