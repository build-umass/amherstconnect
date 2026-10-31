import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import AuthStack from './AuthStack';
import MainTabs from './MainTabs';

export default function AppNavigator() {
  const { appUser, firebaseUser, onboardingData, initialized } = useAuth();

  if (!initialized) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color="#881c1c" />
      </View>
    );
  }

  // Routing rules:
  //   - firebaseUser + appUser.onboardingComplete → MainTabs
  //   - firebaseUser but onboarding unfinished    → AuthStack starting at either
  //       InterestSelection (role already chosen) or RoleSelection (role not
  //       chosen — e.g. new Google user who came in via the Login screen, or
  //       a user whose app restarted mid-onboarding and lost the in-memory
  //       onboardingData).
  //   - no firebaseUser                           → AuthStack at Welcome
  const needsOnboarding = firebaseUser && (!appUser || !appUser.onboardingComplete);
  const hasRole = !!(appUser?.role || onboardingData?.role);

  // NavigationContainer owns the retained route state. Reset it at account/phase
  // boundaries, including when a saved profile arrives after authentication.
  // A locally selected role is normal in-stack progress, not a new phase, so
  // RoleSelection -> InterestSelection retains its Back history.
  const phase = needsOnboarding
    ? (appUser?.role ? 'onboarding-interests' : 'onboarding-role')
    : appUser ? 'signed-in' : 'signed-out';
  const navigationKey = `${firebaseUser?.uid ?? 'guest'}:${phase}`;
  return (
    <NavigationContainer key={navigationKey}>
      {needsOnboarding ? (
        <AuthStack
          key="onboarding"
          initialRoute={hasRole ? 'InterestSelection' : 'RoleSelection'}
        />
      ) : appUser ? (
        <MainTabs />
      ) : (
        <AuthStack key="preauth" />
      )}
    </NavigationContainer>
  );
}
