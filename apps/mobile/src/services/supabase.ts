import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { AppState, Platform } from 'react-native';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readSupabaseConfig, SUPABASE_AUTH_OPTIONS } from './supabaseConfig';
import { createSupabaseGetter } from './supabaseClientFactory';

// Created on first use, so the app still starts for anyone whose .env
// does not have Supabase values yet.
export const getSupabase = createSupabaseGetter<SupabaseClient>({
  readConfig: () => readSupabaseConfig(Constants.expoConfig?.extra),
  createClient: (url, key, options) => createClient(url, key, options as Parameters<typeof createClient>[2]),
  authOptions: SUPABASE_AUTH_OPTIONS,
  storage: Platform.OS === 'web' ? undefined : AsyncStorage,
  platform: Platform.OS,
  appState: AppState,
});
