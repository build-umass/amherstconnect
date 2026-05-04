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

  // `key` matters: without distinct keys, React treats both <AuthStack>
  // elements as the same node and reuses the mounted stack navigator —
  // meaning `initialRouteName` changes are ignored and the visible screen
  // stays wherever it was (e.g. LoginScreen) when the phase changed.
  // Swapping keys forces a clean remount into the right starting route.
  return (
    <NavigationContainer>
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
