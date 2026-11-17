import { defineConfig, loadEnv } from 'vite';
import { isPublicClientKey } from './src/config.js';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_SUPABASE_');
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (key && !isPublicClientKey(key)) {
    throw new Error('Set VITE_SUPABASE_PUBLISHABLE_KEY to a publishable or legacy anon key.');
  }
  return { envPrefix: 'REVIEWER_PORTAL_UNUSED_', define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL ?? ''),
    'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(key ?? ''),
  } };
});
