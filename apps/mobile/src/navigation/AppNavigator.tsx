import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import AuthStack from './AuthStack';
import MainTabs from './MainTabs';

export default function AppNavigator() {
  const { appUser, firebaseUser, initialized } = useAuth();

  if (!initialized) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color="#881c1c" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {appUser ? (
        <MainTabs />
      ) : firebaseUser ? (
        // OAuth user who hasn't finished onboarding
        <AuthStack initialRoute="InterestSelection" />
      ) : (
        <AuthStack />
      )}
    </NavigationContainer>
  );
}
