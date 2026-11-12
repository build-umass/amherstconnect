import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import ts from 'typescript';
import { MAP_CATEGORY_SLUGS, categoryForSlug } from '../src/services/mapEvents.ts';

// Render the actual screen JSX with native primitives and the E02 hook stubbed.
// Repository, reducer, RLS and native/runtime coverage run separately.
let states, stateIndex, feed, query, navigation, saved;
const react = { ...React,
  useState: initial => {
    const index = stateIndex++;
    if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
    return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
  },
  useCallback: fn => fn,
  useEffect: () => {},
  useRef: initial => ({ current: initial }),
};
const native = Object.fromEntries(['View','Text','ScrollView','FlatList','TouchableOpacity','ActivityIndicator','Image'].map(n => [n,n]));
native.StyleSheet = { create: value => value };
native.Alert = { alert: () => {} };
const component = name => ({ __esModule: true, default: name });
function load(path, imports) {
  const js = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  new Function('require','module','exports',js)(name => {
    if (name === 'react') return react;
    assert.ok(name in imports, `Unexpected screen dependency: ${name}`);
    return imports[name];
  }, module, module.exports);
  return module.exports.default;
}
const auth = { user: { id: 'user-a' }, profile: { displayName: 'Local Reader', role: 'student', interests: ['Music'] } };
const Home = load('../src/screens/HomeScreen.tsx', {
  'react-native': native,
  'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
  '@react-navigation/native': { useNavigation: () => navigation },
  '../components/CategoryFilterBar': component('CategoryFilterBar'),
  '../components/EventCard': component('EventCard'),
  '../components/SearchBar': component('SearchBar'),
  '../contexts/AuthContext': { useAuth: () => auth },
  '../hooks/useEventFeed': { useEventFeed: options => { query = options; return feed; } },
  '../services/mapEvents': { MAP_CATEGORY_SLUGS, categoryForSlug },
});
const Profile = load('../src/screens/main/ProfileScreen.tsx', {
  'react-native': native,
  'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0 }) },
  '@react-navigation/native': { useNavigation: () => navigation, useFocusEffect: () => {} },
  '../../contexts/AuthContext': { useAuth: () => auth },
  '../../hooks/useBookmarks': { useSavedEvents: () => saved },
  '../../components/EventCard': component('EventCard'),
});
function nodes(node) {
  if (!React.isValidElement(node)) return [];
  return [node, ...React.Children.toArray(node.props.children).flatMap(nodes)];
}
function text(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!React.isValidElement(node)) return '';
  return React.Children.toArray(node.props.children).map(text).join(' ');
}
function renderHome(overrides = {}, initial = []) {
  states = initial; stateIndex = 0;
  const calls = { refresh: 0, more: 0, navigation: [] };
  navigation = { navigate: (...args) => calls.navigation.push(args) };
  feed = { events: [], status: 'empty', error: null, loadingMore: false, loadMoreError: null,
    hasMore: false, refresh: () => calls.refresh++, loadMore: () => calls.more++, ...overrides };
  const screen = Home(); const tree = screen.type(screen.props); const list = nodes(tree).find(n => n.type === 'FlatList');
  return { tree, list, calls };
}

test('Home passes E02 canonical event and selected occurrence IDs into E06 Details', () => {
  const event = { id: '00000000-0000-4000-8000-000000000001', occurrenceId: '00000000-0000-4000-8000-000000000002', title: 'Real event' };
  const { list, calls } = renderHome({ events: [event], status: 'ready' });
  assert.deepEqual(list.props.data, [event]);
  list.props.renderItem({ item: event }).props.onPress();
  assert.deepEqual(calls.navigation, [['EventDetail', { eventId: event.id, occurrenceId: event.occurrenceId, event }]]);
  assert.doesNotMatch(text(list.props.ListHeaderComponent), /SASA|Featured Tonight/);
});

test('Home uses the approved category slugs and passes search to E02', () => {
  const { list } = renderHome({}, ['Food & Drink', 'tea']);
  assert.deepEqual(query, { categorySlug: 'food-drink', search: 'tea', accountId: 'user-a' });
  const filter = nodes(list.props.ListHeaderComponent).find(n => n.type === 'CategoryFilterBar');
  assert.deepEqual(filter.props.categories, ['All', ...MAP_CATEGORY_SLUGS.map(s => categoryForSlug(s).category)]);
  filter.props.onSelect('Talks & Lectures');
  stateIndex = 0; const next = Home(); next.type(next.props);
  assert.equal(query.categorySlug, 'talks-lectures');
});

test('Home loading, genuine empty and backend errors are distinct and retryable', () => {
  let view = renderHome({ status: 'loading' });
  assert.ok(nodes(view.list.props.ListEmptyComponent).some(n => n.type === 'ActivityIndicator'));
  assert.doesNotMatch(text(view.list.props.ListEmptyComponent), /No upcoming/);
  view = renderHome();
  assert.match(text(view.list.props.ListEmptyComponent), /No upcoming events found/);
  view = renderHome({ status: 'error', error: 'Permission denied' });
  assert.match(text(view.list.props.ListEmptyComponent), /Couldn't load events.*Permission denied/);
  assert.doesNotMatch(text(view.list.props.ListEmptyComponent), /No upcoming/);
  nodes(view.list.props.ListEmptyComponent).find(n => n.type === 'TouchableOpacity').props.onPress();
  assert.equal(view.calls.refresh, 1);
});

test('Home labels cached rows as offline and shows missing-cache recovery', () => {
  let view = renderHome({ offline: true, cached: true });
  assert.match(text(view.list.props.ListHeaderComponent), /Offline · Showing saved events/);
  view = renderHome({ offline: true, status: 'error', error: 'No saved results for this feed. Reconnect to load events.' });
  assert.match(text(view.list.props.ListHeaderComponent), /Offline/);
  assert.match(text(view.list.props.ListEmptyComponent), /Reconnect to load events/);
});

test('Home exposes load-more errors/retry and refresh without replacing loaded events', () => {
  const event = { id: 'event-a' };
  const { list, calls } = renderHome({ events: [event], status: 'ready', hasMore: true, loadMoreError: 'Offline' });
  assert.deepEqual(list.props.data, [event]);
  assert.match(text(list.props.ListFooterComponent), /Offline.*Retry loading more/);
  nodes(list.props.ListFooterComponent).find(n => n.type === 'TouchableOpacity').props.onPress();
  list.props.onRefresh();
  assert.equal(calls.more, 1); assert.equal(calls.refresh, 1);
});

function renderProfile(savedOverrides = {}, initial = []) {
  states = initial; stateIndex = 0;
  const calls = { refetch: 0, navigation: [] };
  navigation = { navigate: (...args) => calls.navigation.push(args) };
  saved = { savedEvents: [], loadingSaved: false, savedEventsError: null,
    refetchSaved: async () => { calls.refetch++; }, ...savedOverrides };
  return { tree: Profile(), calls };
}

test('Profile Saved Events lists bookmarks and opens E06 Details by canonical ID', () => {
  const event = { id: '00000000-0000-4000-8000-000000000001', title: 'Saved event' };
  const { tree, calls } = renderProfile({ savedEvents: [event] });
  const cards = nodes(tree).filter(n => n.type === 'EventCard');
  assert.equal(cards.length, 1);
  cards[0].props.onPress();
  assert.deepEqual(calls.navigation, [['EventDetail', { eventId: event.id, event }]]);
  assert.match(text(tree), /Music/);
});

test('Profile Saved Events separates loading, genuine empty and retryable errors', () => {
  let view = renderProfile({ loadingSaved: true });
  assert.ok(nodes(view.tree).some(n => n.type === 'ActivityIndicator'));
  assert.doesNotMatch(text(view.tree), /No saved events yet/);
  view = renderProfile();
  assert.match(text(view.tree), /No saved events yet/);
  view = renderProfile({ savedEventsError: 'Sign in to manage bookmarks.' });
  assert.match(text(view.tree), /Sign in to manage bookmarks.*Try again/);
  assert.doesNotMatch(text(view.tree), /No saved events yet/);
  nodes(view.tree).filter(n => n.type === 'TouchableOpacity').at(-1).props.onPress();
  assert.equal(view.calls.refetch, 1);
});

test('Profile does not pretend the excluded RSVP feature has loaded empty data', () => {
  const { tree } = renderProfile({}, ['rsvps']);
  assert.match(text(tree), /In-app RSVPs are not available/);
  assert.ok(!nodes(tree).some(n => n.type === 'EventCard' || n.type === 'ActivityIndicator'));
});
