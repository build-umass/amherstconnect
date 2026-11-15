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
const screens = Object.fromEntries(['Welcome', 'RoleSelection', 'SignUp', 'Login', 'ConfirmEmail', 'FinishOnboarding', 'InterestSelection']
  .map((name) => [`../screens/auth/${name}Screen`, { default: () => null, __esModule: true }]));
let auth;
const MainTabs = () => null;
const ProfileErrorScreen = () => null;
const UpdatePasswordScreen = () => null;
// interestsEnabled mirrors constants/features (INTERESTS_ENABLED).
function loadNavigators(interestsEnabled) {
  const features = { INTERESTS_ENABLED: interestsEnabled };
  const AuthStack = loadComponent('../src/navigation/AuthStack.tsx', {
    '@react-navigation/native-stack': {
      createNativeStackNavigator: () => ({ Navigator: NativeNavigator, Screen: NativeScreen }),
    }, ...screens, '../constants/features': features,
  });
  const AppNavigator = loadComponent('../src/navigation/AppNavigator.tsx', {
    '@react-navigation/native': { NavigationContainer: () => null },
    'react-native': { View: () => null, ActivityIndicator: () => null },
    '../contexts/AuthContext': { useAuth: () => auth },
    './AuthStack': { default: AuthStack, __esModule: true },
    './MainTabs': { default: MainTabs, __esModule: true },
    '../screens/auth/ProfileErrorScreen': { default: ProfileErrorScreen, __esModule: true },
    '../screens/auth/UpdatePasswordScreen': { default: UpdatePasswordScreen, __esModule: true },
    '../constants/features': features,
  });
  return { AuthStack, AppNavigator };
}
// The shipped setting: interest selection hidden, onboarding finishes after the role.
const { AuthStack, AppNavigator } = loadNavigators(false);
const FINISH = 'FinishOnboarding';
// AuthContext's session snapshot (services/authSession.ts).
const guest = { status: 'signed_out', user: null, profile: null, onboardingData: {}, passwordRecovery: false };
const signedIn = (profile = null, uid = 'test-user') => ({
  ...guest, user: { id: uid }, profile, status: profile?.onboardingComplete ? 'signed_in' : 'onboarding',
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
  assert.equal(h.render(signedIn(incomplete)), FINISH);
  assert.equal(h.back(), false);
});

test('late saved profile role resets pending-profile onboarding to the finishing step', () => {
  const h = harness();
  h.render(guest); h.navigate('Login');
  assert.equal(h.render(signedIn()), 'RoleSelection');
  assert.equal(h.render(signedIn(incomplete)), FINISH);
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
  h.navigate(FINISH); assert.equal(h.back(), true);
  assert.equal(h.current, 'RoleSelection');
  h.render(signedIn(incomplete)); h.navigate('RoleSelection');
  h.render(signedIn({ ...incomplete, interests: ['Music'] }));
  assert.equal(h.current, 'RoleSelection'); assert.equal(h.back(), true);
  assert.equal(h.current, FINISH);
});

test('completion, logout and account replacement reset boundaries; same-phase updates do not', () => {
  const onboarding = render(signedIn(incomplete));
  const complete = render(signedIn({ ...incomplete, onboardingComplete: true }));
  assert.equal(complete.props.children.type, MainTabs);
  assert.notEqual(onboarding.key, complete.key);
  assert.equal(complete.key, render(signedIn({ role: 'student', onboardingComplete: true, interests: ['Art'] })).key);
  assert.notEqual(complete.key, render(signedIn({ onboardingComplete: true }, 'other-test-user')).key);
  const h = harness(); h.render(signedIn(incomplete)); h.navigate('RoleSelection');
  assert.equal(h.render(signedIn(incomplete, 'other-test-user')), FINISH);
  assert.equal(h.render(guest), 'Welcome'); assert.equal(h.back(), false);
});

test('password recovery and profile errors render outside the navigators', () => {
  assert.equal(render({ ...signedIn(incomplete), passwordRecovery: true }).type, UpdatePasswordScreen);
  assert.equal(render({ ...signedIn(), status: 'loading_profile', passwordRecovery: true }).type, UpdatePasswordScreen);
  assert.equal(render({ ...signedIn(), status: 'profile_error' }).type, ProfileErrorScreen);
});

test('with interests enabled, onboarding resumes at InterestSelection and has 3 steps', () => {
  const nav = loadNavigators(true);
  auth = signedIn(incomplete);
  const stack = nav.AuthStack(nav.AppNavigator().props.children.props);
  assert.equal(stack.props.initialRouteName, 'InterestSelection');
  const titles = React.Children.toArray(stack.props.children).map((child) => child.props.options?.title);
  assert.ok(titles.includes('Step 1 of 3') && titles.includes('Step 2 of 3'));
});

test('with interests hidden, onboarding has 2 steps', () => {
  const titles = React.Children.toArray(AuthStack({}).props.children).map((child) => child.props.options?.title);
  assert.ok(titles.includes('Step 1 of 2') && titles.includes('Step 2 of 2'));
  assert.ok(!titles.includes('Step 1 of 3'));
});
