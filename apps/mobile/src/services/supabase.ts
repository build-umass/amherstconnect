import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readSupabaseConfig, SUPABASE_AUTH_OPTIONS } from './supabaseConfig';

let client: SupabaseClient | null = null;

// Created on first use, so the app still starts for anyone whose .env
// does not have Supabase values yet.
export function getSupabase(): SupabaseClient {
  if (client) return client;

  const { url, publishableKey } = readSupabaseConfig(Constants.expoConfig?.extra);
  client = createClient(url, publishableKey, {
    auth: { ...SUPABASE_AUTH_OPTIONS, storage: AsyncStorage },
  });
  return client;
}