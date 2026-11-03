import type { SupabaseConfig } from './supabaseConfig';

type AuthOptions = {
  persistSession: true;
  autoRefreshToken: true;
  detectSessionInUrl: false;
  flowType: 'pkce';
};

type AuthStorage = {
  getItem(key: string): unknown;
  setItem(key: string, value: string): unknown;
  removeItem(key: string): unknown;
};

type ClientOptions = {
  auth: AuthOptions & { storage?: AuthStorage };
};

type ClientWithAuthRefresh = {
  auth: {
    startAutoRefresh(): void;
    stopAutoRefresh(): void;
  };
};

type AppStateSource = {
  currentState: string | null | undefined;
  addEventListener(event: 'change', listener: (state: string) => void): { remove(): void };
};

// After Google sign-in the session also carries Google's access (and possibly
// refresh) token. The app never calls Google APIs, so they are not persisted.
function stripProviderTokens(value: string): string {
  if (!value.includes('"provider_')) return value;
  try {
    const session = JSON.parse(value);
    if (session && typeof session === 'object') {
      delete session.provider_token;
      delete session.provider_refresh_token;
      return JSON.stringify(session);
    }
  } catch {
    // Not JSON (e.g. a PKCE verifier); store it unchanged.
  }
  return value;
}

export function withoutProviderTokens(storage: AuthStorage): AuthStorage {
  return {
    getItem: (key) => storage.getItem(key),
    setItem: (key, value) => storage.setItem(key, stripProviderTokens(value)),
    removeItem: (key) => storage.removeItem(key),
  };
}

export function createSupabaseGetter<TClient extends ClientWithAuthRefresh>(options: {
  readConfig: () => SupabaseConfig;
  createClient: (url: string, key: string, options: ClientOptions) => TClient;
  authOptions: AuthOptions;
  storage?: AuthStorage;
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
        ? { storage: withoutProviderTokens(options.storage) }
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
