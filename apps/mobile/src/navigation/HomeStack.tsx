import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../types/navigation';
import HomeScreen from '../screens/HomeScreen';
import EventDetailScreen from '../screens/main/EventDetailScreen';

const Stack = createNativeStackNavigator<HomeStackParamList>();

export default function HomeStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="HomeScreen"
        component={HomeScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="EventDetail"
        component={EventDetailScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}
