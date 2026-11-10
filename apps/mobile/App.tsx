import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/contexts/AuthContext';
import { usePushDeviceRegistration } from './src/hooks/usePushDeviceRegistration';
import AppNavigator from './src/navigation/AppNavigator';

// Registers this device for push notifications while a user is signed in.
function PushDeviceRegistration() {
  usePushDeviceRegistration();
  return null;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <PushDeviceRegistration />
        <AppNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
