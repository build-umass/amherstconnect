import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import AuthStack from './AuthStack';
import MainTabs from './MainTabs';
import ProfileErrorScreen from '../screens/auth/ProfileErrorScreen';

export default function AppNavigator() {
  const { status, profile, onboardingData } = useAuth();

  // Never render navigation (and so never flash protected screens) until the
  // persisted session is restored and the matching profile has been read.
  if (status === 'initializing' || status === 'loading_profile') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color="#881c1c" />
      </View>
    );
  }

  if (status === 'profile_error') {
    return <ProfileErrorScreen />;
  }

  // Routing rules:
  //   - signed_in  (completed profile)            → MainTabs
  //   - onboarding (no profile, or incomplete)    → AuthStack at InterestSelection
  //       when a role is known (saved profile or chosen before signup), else
  //       RoleSelection (e.g. app restarted before the profile was created).
  //   - signed_out                                → AuthStack at Welcome
  //
  // `key` matters: without distinct keys, React reuses the mounted stack
  // navigator and ignores the new `initialRouteName`.
  const hasRole = !!(profile?.role || onboardingData.role);
  return (
    <NavigationContainer>
      {status === 'signed_in' ? (
        <MainTabs />
      ) : status === 'onboarding' ? (
        <AuthStack key="onboarding" initialRoute={hasRole ? 'InterestSelection' : 'RoleSelection'} />
      ) : (
        <AuthStack key="preauth" />
      )}
    </NavigationContainer>
  );
}
