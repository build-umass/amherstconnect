import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import * as feed from '../src/services/eventFeed.ts';
import * as cache from '../src/services/homeFeedCache.ts';

test('Home restores its saved page offline and reloads the real feed on reconnect', async () => {
  const slots = [];
  const storage = new Map();
  let slot = 0;
  let online = false;
  let calls = 0;
  const accountId = 'test-account';
  const disk = {
    getItem: async key => storage.get(key) ?? null,
    setItem: async (key, value) => { storage.set(key, value); },
  };
  await cache.createHomeFeedCache(disk).write(accountId, []);
  const imports = {
    react: {
      useRef(initial) {
        return slots[slot++] ??= { current: initial };
      },
      useReducer(reducer, initial) {
        const index = slot++;
        slots[index] ??= initial;
        return [slots[index], action => { slots[index] = reducer(slots[index], action); }];
      },
      useEffect(effect, deps) {
        const index = slot++;
        const previous = slots[index];
        if (previous && deps.every((value, i) => Object.is(value, previous.deps[i]))) return;
        previous?.cleanup?.();
        slots[index] = { deps, cleanup: effect() };
      },
      useMemo: make => make(),
      useCallback: callback => callback,
    },
    '@react-native-async-storage/async-storage': disk,
    'expo-network': { useNetworkState: () => ({ isConnected: online, isInternetReachable: online }) },
    '../services/supabase': {},
    '../services/mapEvents': {},
    '../services/homeFeedCache': cache,
    '../services/eventRepository': { DEFAULT_FEED_LIMIT: 20 },
    '../services/eventFeed': feed,
  };
  const source = readFileSync(new URL('../src/hooks/useEventFeed.ts', import.meta.url), 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const exports = {};
  new Function('require', 'exports', js)(name => {
    assert.ok(name in imports, name);
    return imports[name];
  }, exports);
  const repository = { async listFeed() { calls++; return { items: [], nextCursor: null }; } };
  const render = () => { slot = 0; return exports.useEventFeed({ repository, accountId }); };
  const settle = () => new Promise(resolve => setImmediate(resolve));

  render();
  await settle();
  const offline = render();
  assert.equal(offline.status, 'empty');
  assert.equal(offline.cached, true);
  assert.equal(offline.hasMore, false);
  assert.equal(calls, 0);

  online = true;
  render();
  await settle();
  assert.equal(render().cached, false);
  assert.equal(calls, 1);
});
