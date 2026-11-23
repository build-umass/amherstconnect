import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { OrganizerStackParamList } from '../types/navigation';
import OrganizerHomeScreen from '../screens/organizer/OrganizerHomeScreen';
import NewListingScreen from '../screens/organizer/NewListingScreen';

const Stack = createNativeStackNavigator<OrganizerStackParamList>();

/** Organizer tab. OrganizerHome is temporary until task 3.1 adds the approval gate. */
export default function OrganizerStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="OrganizerHome" component={OrganizerHomeScreen} options={{ headerShown: false }} />
      <Stack.Screen name="NewListing" component={NewListingScreen} options={{ title: '', headerShadowVisible: false }} />
    </Stack.Navigator>
  );
}
