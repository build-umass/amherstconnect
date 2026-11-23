import React from 'react';
import { Lucide } from '@react-native-vector-icons/lucide';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { MainTabParamList } from '../types/navigation';
import ProfileStack from './ProfileStack';
import MapStack from './MapStack';
import HomeStack from './HomeStack';
import DealsScreen from '../screens/main/DealsScreen';
import OrganizerStack from './OrganizerStack';
import { ORGANIZER_TAB_ENABLED } from '../constants/features';

const Tab = createBottomTabNavigator<MainTabParamList>();

export default function MainTabs() {
  return (
    <Tab.Navigator screenOptions={({ route }) => ({
      tabBarActiveTintColor: '#98190B',
      tabBarInactiveTintColor: '#777777',
      tabBarIcon: ({ color, size }) => {
        const name =
          route.name === 'Home' ? 'house' :
          route.name === 'Map' ? 'map' :
          route.name === 'Deals' ? 'tag' :
          route.name === 'Organizer' ? 'megaphone' : 'user';
        return <Lucide name={name} size={size} color={color} />;
      },
    })}>
      <Tab.Screen name="Home" component={HomeStack} options={{ headerShown: false }} />
      <Tab.Screen name="Map" component={MapStack} options={{ headerShown: false }} />
      <Tab.Screen name="Deals" component={DealsScreen} />
      {ORGANIZER_TAB_ENABLED && (
        <Tab.Screen name="Organizer" component={OrganizerStack} options={{ headerShown: false }} />
      )}
      <Tab.Screen
        name="Profile"
        component={ProfileStack}
        options={{ headerShown: false }}
      />
    </Tab.Navigator>
  );
}
