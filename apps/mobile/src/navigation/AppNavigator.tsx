import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import AuthStack from './AuthStack';
import MainTabs from './MainTabs';
import ProfileErrorScreen from '../screens/auth/ProfileErrorScreen';
import UpdatePasswordScreen from '../screens/auth/UpdatePasswordScreen';

export default function AppNavigator() {
  const { status, user, profile, onboardingData, passwordRecovery } = useAuth();

  // A password-reset link signed the user in: they set a new password before
  // anything else (the profile may still be loading behind this screen).
  if (passwordRecovery) {
    return <UpdatePasswordScreen />;
  }

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
  // NavigationContainer owns the retained route state. Reset it at account/phase
  // boundaries, including when a saved profile arrives after authentication.
  // A locally selected role is normal in-stack progress, not a new phase, so
  // RoleSelection -> InterestSelection retains its Back history.
  const hasRole = !!(profile?.role || onboardingData.role);
  const phase =
    status === 'signed_in'
      ? 'signed-in'
      : status === 'onboarding'
        ? (profile?.role ? 'onboarding-interests' : 'onboarding-role')
        : 'signed-out';
  const navigationKey = `${user?.id ?? 'guest'}:${phase}`;
  return (
    <NavigationContainer key={navigationKey}>
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
