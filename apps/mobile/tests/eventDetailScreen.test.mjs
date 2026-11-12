import test, { after, before, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import ts from 'typescript';
import * as detailsView from '../src/services/eventDetailsView.ts';
import { categoryForSlug } from '../src/services/mapEvents.ts';

// E03: render the actual Event Details JSX with native primitives and the E02
// hook stubbed, and check that the screen shows what E02 returned. Formatting
// rules are covered in eventDetailsView.test.mjs.

// The screen checks whether the shown time is over, so pin "now".
before(() => mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-09T17:00:00Z') }));
after(() => mock.timers.reset());

let current;
const hooks = {
  useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: () => {},
  useRef: initial => ({ current: initial }),
  useCallback: fn => fn,
};
const native = Object.fromEntries(
  ['View', 'Text', 'ScrollView', 'TouchableOpacity', 'ActivityIndicator', 'Image'].map(n => [n, n]),
);
native.StyleSheet = { create: value => value };
native.Share = { share: async () => ({ action: 'sharedAction' }) };
native.Linking = { openURL: url => { current.links.push(url); return Promise.resolve(); } };

function load(path, imports) {
  const js = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', js)(name => {
    if (name === 'react') return { ...React, ...hooks };
    assert.ok(name in imports, `Unexpected screen dependency: ${name}`);
    return imports[name];
  }, module, module.exports);
  return module.exports.default;
}

const EventDetailScreen = load('../src/screens/main/EventDetailScreen.tsx', {
  'react-native': native,
  'expo-clipboard': { setStringAsync: async () => {} },
  'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ top: 0 }) },
  '../../components/BookmarkButton': { __esModule: true, default: 'BookmarkButton' },
  '../../services/eventShare': { shareEvent: async () => 'shared' },
  '../../hooks/useEventDetails': {
    useEventDetails: (eventId, repository, occurrenceId) => {
      current.query = { eventId, occurrenceId };
      return current.details;
    },
  },
  '../../services/mapEvents': { categoryForSlug },
  '../../utils/openDirections': { openDirections: query => current.directions.push(query) },
  '../../services/eventDetailsView': detailsView,
});

/** Calls function components (hooks are stubbed) so the tree holds only native elements. */
function expand(node) {
  if (Array.isArray(node)) return node.map(expand);
  if (!React.isValidElement(node)) return node;
  if (typeof node.type === 'function') return expand(node.type(node.props));
  if (node.props.children === undefined) return node;
  return React.cloneElement(node, undefined, ...React.Children.toArray(node.props.children).map(expand));
}
function nodes(node) {
  if (!React.isValidElement(node)) return [];
  return [node, ...React.Children.toArray(node.props.children).flatMap(nodes)];
}
function text(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!React.isValidElement(node)) return '';
  return React.Children.toArray(node.props.children).map(text).join('');
}
function press(tree, label) {
  const button = nodes(tree).find(n => n.type === 'TouchableOpacity' && text(n) === label);
  assert.ok(button, `expected a "${label}" button`);
  return button.props.onPress();
}
const labels = tree => nodes(tree).filter(n => n.type === 'TouchableOpacity').map(text);

const EVENT_ID = 'e0000000-0000-4000-8000-000000000004';
const OCCURRENCE_ID = 'f0000000-0000-4000-8000-000000000403';
const occurrence = (overrides = {}) => ({
  id: OCCURRENCE_ID,
  startsAt: '2026-12-03T23:00:00Z',
  endsAt: '2026-12-04T00:30:00Z',
  allDay: false,
  status: 'scheduled',
  locationType: 'hybrid',
  locationName: 'Campus Center',
  venueName: 'Campus Center',
  room: 'Auditorium',
  address: 'Amherst, MA 01003',
  latitude: 42.3917,
  longitude: -72.5275,
  virtualUrl: 'https://stream.example.test/sustainability-series',
  ...overrides,
});
const detail = (overrides = {}) => ({
  eventId: EVENT_ID,
  title: 'Sustainability Speaker Series',
  description: 'Monthly talks from researchers and practitioners.',
  imageUrl: null,
  status: 'published',
  timezone: 'America/New_York',
  isFree: true,
  officialUrl: null,
  registrationUrl: null,
  categoryName: 'Talks & Lectures',
  categorySlug: 'talks-lectures',
  organizerName: 'Campus Sustainability Circle',
  organizerUrl: null,
  occurrences: [
    occurrence(),
    occurrence({ id: 'f0000000-0000-4000-8000-000000000404', startsAt: '2027-02-04T23:00:00Z', endsAt: '2027-02-05T00:30:00Z' }),
  ],
  ...overrides,
});

function render(loaded, params = { eventId: EVENT_ID, occurrenceId: OCCURRENCE_ID }, status = loaded ? 'ready' : 'not-found') {
  current = { links: [], directions: [], tabs: [], back: 0, query: null,
    details: { event: loaded, status, error: null, retry: () => {} } };
  const navigation = {
    goBack: () => current.back++,
    getState: () => ({ routeNames: ['HomeScreen', 'EventDetail'] }),
    getParent: () => ({ navigate: (...args) => current.tabs.push(args) }),
  };
  return expand(EventDetailScreen({ route: { params }, navigation }));
}

test('a loading preview cannot share, bookmark, or navigate using stale event details', () => {
  const tree = render(null, { eventId: EVENT_ID, occurrenceId: OCCURRENCE_ID, event: {
    id: EVENT_ID, title: 'Preview', category: 'Talks & Lectures', latitude: 42, longitude: -72,
  } }, 'loading');
  assert.match(text(tree), /Preview/);
  assert.ok(!labels(tree).includes('View on Map'));
  assert.ok(!nodes(tree).some(node => node.props.accessibilityLabel === 'Share event' || node.type === 'BookmarkButton'));
});

test('Event Details loads the canonical event and shows E02 data instead of placeholders', () => {
  const tree = render(detail());
  assert.deepEqual(current.query, { eventId: EVENT_ID, occurrenceId: OCCURRENCE_ID });
  const all = text(tree);
  assert.match(all, /6:00 PM – 7:30 PM/);
  assert.match(all, /Campus Center, Auditorium/);
  assert.match(all, /Amherst, MA 01003/);
  assert.match(all, /More dates.*Thu, Feb 4 · 6:00 PM/);
  assert.doesNotMatch(all, /RSVP|Going|UMass Amherst|interested|TONIGHT/);
  // No registration or event page for this event: only the map button.
  assert.deepEqual(labels(tree).filter(l => ['Register', 'Get tickets', 'Event page', 'View on Map'].includes(l)), ['View on Map']);
});

test('Join online and Get directions use the event\'s own link and address', () => {
  const tree = render(detail());
  press(tree, 'Join online');
  press(tree, 'Get directions');
  assert.deepEqual(current.links, ['https://stream.example.test/sustainability-series']);
  assert.deepEqual(current.directions, ['Campus Center, Amherst, MA 01003']);
});

test('the footer opens the registration page, or the official page when there is none', () => {
  let tree = render(detail({ registrationUrl: 'https://register.example.test/talks', officialUrl: 'https://calendar.example.test/talks' }));
  press(tree, 'Register');
  assert.deepEqual(current.links, ['https://register.example.test/talks']);

  tree = render(detail({ isFree: false, registrationUrl: 'https://tickets.example.test/concert' }));
  press(tree, 'Get tickets');
  assert.deepEqual(current.links, ['https://tickets.example.test/concert']);

  tree = render(detail({ officialUrl: 'https://calendar.example.test/talks' }));
  press(tree, 'Event page');
  assert.deepEqual(current.links, ['https://calendar.example.test/talks']);
});

test('a cancelled event shows its banner and only the event page', () => {
  const tree = render(detail({
    status: 'cancelled',
    registrationUrl: 'https://register.example.test/talks',
    officialUrl: 'https://calendar.example.test/talks',
  }));
  assert.match(text(tree), /This event has been cancelled\./);
  assert.ok(!labels(tree).some(l => ['Register', 'View on Map', 'Join online'].includes(l)));
  press(tree, 'Event page');
  assert.deepEqual(current.links, ['https://calendar.example.test/talks']);
});

test('an event that is over says so and drops its sign-up and join links', () => {
  const tree = render(detail({
    registrationUrl: 'https://register.example.test/talks',
    officialUrl: 'https://calendar.example.test/talks',
    occurrences: [occurrence({ startsAt: '2026-10-01T22:00:00Z', endsAt: '2026-10-01T23:30:00Z' })],
  }));
  assert.match(text(tree), /This event has ended\./);
  assert.ok(!labels(tree).some(l => l === 'Register' || l === 'Join online'));
  assert.ok(labels(tree).includes('Event page'));
  assert.ok(labels(tree).includes('View on Map'), 'the map can still show where it was');
});

test('an online event has a join link and no directions or map', () => {
  const tree = render(detail({
    occurrences: [occurrence({ locationType: 'virtual', locationName: null, venueName: null, room: null, address: null, latitude: null, longitude: null, virtualUrl: 'https://meet.example.test/x' })],
  }));
  assert.match(text(tree), /Online/);
  assert.ok(labels(tree).includes('Join online'));
  assert.ok(!labels(tree).some(l => l === 'Get directions' || l === 'View on Map'));
});

test('the event image replaces the category emoji in the hero', () => {
  const tree = render(detail({ imageUrl: 'https://img.example.test/talk.jpg' }));
  const image = nodes(tree).find(n => n.type === 'Image');
  assert.equal(image.props.source.uri, 'https://img.example.test/talk.jpg');
  assert.doesNotMatch(text(tree), /🎤/);
  assert.match(text(render(detail())), /🎤/, 'no image: the category emoji');
});

test('View on Map from Home switches to the Map tab on the shown occurrence', () => {
  const tree = render(detail());
  press(tree, 'View on Map');
  assert.equal(current.tabs.length, 1);
  const [tab, { screen, params }] = current.tabs[0];
  assert.equal(tab, 'Map');
  assert.equal(screen, 'MapScreen');
  assert.equal(params.highlightedEventId, EVENT_ID);
  assert.equal(params.highlightedOccurrenceId, OCCURRENCE_ID);
  assert.equal(params.latitude, 42.3917);
});
