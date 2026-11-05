import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { MapStackParamList } from '../types/navigation';
import MapScreen from '../screens/main/MapScreen';
import EventDetailScreen from '../screens/main/EventDetailScreen';

const Stack = createNativeStackNavigator<MapStackParamList>();

// E06: Event Details opened from a map pin lives in the Map tab, so Back
// returns to the map instead of jumping to Home.
export default function MapStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="MapScreen" component={MapScreen} options={{ title: 'Map' }} />
      <Stack.Screen
        name="EventDetail"
        component={EventDetailScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}
