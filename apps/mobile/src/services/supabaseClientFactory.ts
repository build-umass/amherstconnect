import type { SupabaseConfig } from './supabaseConfig';

type AuthOptions = {
  persistSession: true;
  autoRefreshToken: true;
  detectSessionInUrl: false;
};

type ClientOptions = {
  auth: AuthOptions & { storage?: unknown };
};

type ClientWithAuthRefresh = {
  auth: {
    startAutoRefresh(): void;
    stopAutoRefresh(): void;
  };
};

type AppStateSource = {
  currentState: string | null;
  addEventListener(event: 'change', listener: (state: string) => void): { remove(): void };
};

export function createSupabaseGetter<TClient extends ClientWithAuthRefresh>(options: {
  readConfig: () => SupabaseConfig;
  createClient: (url: string, key: string, options: ClientOptions) => TClient;
  authOptions: AuthOptions;
  storage?: unknown;
  platform: string;
  appState: AppStateSource;
}): () => TClient {
  let client: TClient | null = null;

  return function getSupabase(): TClient {
    if (client) return client;

    const { url, publishableKey } = options.readConfig();
    const auth = {
      ...options.authOptions,
      ...(options.platform !== 'web' && options.storage !== undefined
        ? { storage: options.storage }
        : {}),
    };
    client = options.createClient(url, publishableKey, { auth });

    if (options.platform !== 'web') {
      const updateAutoRefresh = (state: string) => {
        if (state === 'active') client?.auth.startAutoRefresh();
        else client?.auth.stopAutoRefresh();
      };
      options.appState.addEventListener('change', updateAutoRefresh);
      updateAutoRefresh(options.appState.currentState ?? 'active');
    }

    return client;
  };
}
