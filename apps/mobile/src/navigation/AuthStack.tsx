import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../types/navigation';
import WelcomeScreen from '../screens/auth/WelcomeScreen';
import RoleSelectionScreen from '../screens/auth/RoleSelectionScreen';
import SignUpScreen from '../screens/auth/SignUpScreen';
import LoginScreen from '../screens/auth/LoginScreen';
import InterestSelectionScreen from '../screens/auth/InterestSelectionScreen';

const Stack = createNativeStackNavigator<AuthStackParamList>();

export default function AuthStack({ initialRoute }: { initialRoute?: keyof AuthStackParamList }) {
  return (
    <Stack.Navigator initialRouteName={initialRoute ?? 'Welcome'} screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="RoleSelection" component={RoleSelectionScreen} options={{ headerShown: true, title: 'Step 1 of 3' }} />
      <Stack.Screen name="SignUp" component={SignUpScreen} options={{ headerShown: true, title: 'Step 2 of 3' }} />
      <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: true, title: 'Log In' }} />
      <Stack.Screen name="InterestSelection" component={InterestSelectionScreen} options={{ headerShown: true, title: 'Step 3 of 3' }} />
    </Stack.Navigator>
  );
}
