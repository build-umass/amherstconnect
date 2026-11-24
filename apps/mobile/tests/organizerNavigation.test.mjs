import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import ts from 'typescript';
import { CommonActions, StackRouter } from '@react-navigation/routers';

// Same approach as authNavigation.test.mjs: transpile the navigator, stub its
// imports, and inspect the element tree plus the real React Navigation router.
function loadComponent(path, imports) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
  });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', outputText)((name) => {
    if (name === 'react') return React;
    assert.ok(name in imports, `Unexpected import: ${name}`);
    return imports[name];
  }, module, module.exports);
  return module.exports.default;
}

const Navigator = () => null;
const Screen = () => null;
const Lucide = () => null;
const stub = () => ({ default: () => null, __esModule: true });
const OrganizerStackStub = () => null;

function loadMainTabs(organizerEnabled) {
  return loadComponent('../src/navigation/MainTabs.tsx', {
    '@react-native-vector-icons/lucide': { Lucide },
    '@react-navigation/bottom-tabs': { createBottomTabNavigator: () => ({ Navigator, Screen }) },
    './ProfileStack': stub(),
    './MapStack': stub(),
    './HomeStack': stub(),
    '../screens/main/DealsScreen': stub(),
    './OrganizerStack': { default: OrganizerStackStub, __esModule: true },
    '../constants/features': { ORGANIZER_TAB_ENABLED: organizerEnabled, INTERESTS_ENABLED: false },
  });
}

const OrganizerHomeScreen = () => null;
const NewListingScreen = () => null;
const OrganizerStack = loadComponent('../src/navigation/OrganizerStack.tsx', {
  '@react-navigation/native-stack': { createNativeStackNavigator: () => ({ Navigator, Screen }) },
  '../screens/organizer/OrganizerHomeScreen': { default: OrganizerHomeScreen, __esModule: true },
  '../screens/organizer/NewListingScreen': { default: NewListingScreen, __esModule: true },
});

const screens = (navigator) => React.Children.toArray(navigator.props.children).map((child) => child.props);

test('the Organizer tab shows only when ORGANIZER_TAB_ENABLED is on', () => {
  assert.deepEqual(screens(loadMainTabs(true)()).map((s) => s.name), ['Home', 'Map', 'Deals', 'Organizer', 'Profile']);
  assert.deepEqual(screens(loadMainTabs(false)()).map((s) => s.name), ['Home', 'Map', 'Deals', 'Profile']);
});

test('the Organizer tab hosts the organizer stack with its own header', () => {
  const organizer = screens(loadMainTabs(true)()).find((s) => s.name === 'Organizer');
  assert.equal(organizer.component, OrganizerStackStub);
  assert.equal(organizer.options.headerShown, false);
});

test('the Organizer tab uses the megaphone icon', () => {
  const tabs = loadMainTabs(true)();
  const icon = tabs.props.screenOptions({ route: { name: 'Organizer' } }).tabBarIcon({ color: '#000', size: 20 });
  assert.equal(icon.type, Lucide);
  assert.equal(icon.props.name, 'megaphone');
});

test('ORGANIZER_TAB_ENABLED is tied to dev builds', () => {
  const source = readFileSync(new URL('../src/constants/features.ts', import.meta.url), 'utf8');
  assert.match(source, /export const ORGANIZER_TAB_ENABLED = __DEV__;/);
});

test('the organizer stack opens on the placeholder home, then New listing, and Back returns', () => {
  const stack = OrganizerStack();
  const props = screens(stack);
  assert.deepEqual(props.map((s) => s.name), ['OrganizerHome', 'NewListing']);
  assert.equal(props[0].component, OrganizerHomeScreen);
  assert.equal(props[1].component, NewListingScreen);
  assert.equal(props[1].options.title, '');

  const router = StackRouter({});
  const options = { routeNames: props.map((s) => s.name), routeParamList: {}, routeGetIdList: {} };
  let state = router.getInitialState(options);
  assert.equal(state.routes[state.index].name, 'OrganizerHome');

  state = router.getStateForAction(state, CommonActions.navigate('NewListing', { organizerId: 'org-1' }), options);
  assert.equal(state.routes[state.index].name, 'NewListing');
  assert.deepEqual(state.routes[state.index].params, { organizerId: 'org-1' });

  state = router.getStateForAction(state, CommonActions.goBack(), options);
  assert.equal(state.routes[state.index].name, 'OrganizerHome');
});
