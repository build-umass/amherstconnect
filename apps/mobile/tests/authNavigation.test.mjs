import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import ts from 'typescript';
import { CommonActions, StackRouter } from '@react-navigation/routers';

// Exercise the real JSX boundaries with native views stubbed, and the installed
// React Navigation router for retained state and Back behavior. No Auth/network.
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
const NativeNavigator = () => null;
const NativeScreen = () => null;
const screens = Object.fromEntries(['Welcome', 'RoleSelection', 'SignUp', 'Login', 'InterestSelection']
  .map((name) => [`../screens/auth/${name}Screen`, { default: () => null, __esModule: true }]));
const AuthStack = loadComponent('../src/navigation/AuthStack.tsx', {
  '@react-navigation/native-stack': {
    createNativeStackNavigator: () => ({ Navigator: NativeNavigator, Screen: NativeScreen }),
  }, ...screens,
});
let auth;
const MainTabs = () => null;
const AppNavigator = loadComponent('../src/navigation/AppNavigator.tsx', {
  '@react-navigation/native': { NavigationContainer: () => null },
  'react-native': { View: () => null, ActivityIndicator: () => null },
  '../contexts/AuthContext': { useAuth: () => auth },
  './AuthStack': { default: AuthStack, __esModule: true },
  './MainTabs': { default: MainTabs, __esModule: true },
});
const guest = { initialized: true, firebaseUser: null, appUser: null, onboardingData: null };
const signedIn = (profile = null, uid = 'test-user') => ({
  ...guest, firebaseUser: { uid }, appUser: profile,
});
const incomplete = { role: 'student', onboardingComplete: false };
function render(value) {
  auth = value;
  return AppNavigator();
}
function stackConfig(container) {
  const stack = AuthStack(container.props.children.props);
  return {
    router: StackRouter({ initialRouteName: stack.props.initialRouteName }),
    options: {
      routeNames: React.Children.toArray(stack.props.children).map((child) => child.props.name),
      routeParamList: {}, routeGetIdList: {},
    },
  };
}
function harness() {
  let key, state, router, options;
  return {
    render(value) {
      const element = render(value);
      ({ router, options } = stackConfig(element));
      if (element.key !== key) state = router.getInitialState(options);
      else state = router.getRehydratedState({ ...state, stale: true }, options);
      key = element.key;
      return state.routes[state.index].name;
    },
    navigate(name) { state = router.getStateForAction(state, CommonActions.navigate(name), options); },
    back() {
      const next = router.getStateForAction(state, CommonActions.goBack(), options);
      if (next) state = next;
      return next !== null;
    },
    get current() { return state.routes[state.index].name; },
  };
}

test('sign-in resets retained Login state into required onboarding, not MainTabs', () => {
  const h = harness();
  h.render(guest); h.navigate('Login');
  // Reproduce the original bug: changing initialRoute alone preserves Login.
  const { router, options } = stackConfig(render(signedIn(incomplete)));
  const retained = router.getRehydratedState({ stale: true, index: 1,
    routes: [{ name: 'Welcome' }, { name: 'Login' }] }, options);
  assert.equal(retained.routes[retained.index].name, 'Login');
  assert.equal(h.render(signedIn(incomplete)), 'InterestSelection');
  assert.equal(h.back(), false);
});

test('late saved profile role resets pending-profile onboarding to interests', () => {
  const h = harness();
  h.render(guest); h.navigate('Login');
  assert.equal(h.render(signedIn()), 'RoleSelection');
  assert.equal(h.render(signedIn(incomplete)), 'InterestSelection');
});

test('local guest role selection and signup preserve normal Back navigation', () => {
  const h = harness(); h.render(guest); h.navigate('RoleSelection');
  h.render({ ...guest, onboardingData: { role: 'student' } });
  assert.equal(h.current, 'RoleSelection');
  h.navigate('SignUp'); assert.equal(h.back(), true);
  assert.equal(h.current, 'RoleSelection'); assert.equal(h.back(), true);
  assert.equal(h.current, 'Welcome');
  h.navigate('Login'); assert.equal(h.back(), true); assert.equal(h.current, 'Welcome');
});

test('local authenticated onboarding progress preserves Back and profile refresh preserves history', () => {
  const h = harness(); h.render(signedIn());
  h.render({ ...signedIn(), onboardingData: { role: 'student' } });
  h.navigate('InterestSelection'); assert.equal(h.back(), true);
  assert.equal(h.current, 'RoleSelection');
  h.render(signedIn(incomplete)); h.navigate('RoleSelection');
  h.render(signedIn({ ...incomplete, interests: ['Music'] }));
  assert.equal(h.current, 'RoleSelection'); assert.equal(h.back(), true);
  assert.equal(h.current, 'InterestSelection');
});

test('completion, logout and account replacement reset boundaries; same-phase updates do not', () => {
  const onboarding = render(signedIn(incomplete));
  const complete = render(signedIn({ ...incomplete, onboardingComplete: true }));
  assert.equal(complete.props.children.type, MainTabs);
  assert.notEqual(onboarding.key, complete.key);
  assert.equal(complete.key, render(signedIn({ role: 'student', onboardingComplete: true, interests: ['Art'] })).key);
  assert.notEqual(complete.key, render(signedIn({ onboardingComplete: true }, 'other-test-user')).key);
  const h = harness(); h.render(signedIn(incomplete)); h.navigate('RoleSelection');
  assert.equal(h.render(signedIn(incomplete, 'other-test-user')), 'InterestSelection');
  assert.equal(h.render(guest), 'Welcome'); assert.equal(h.back(), false);
});
