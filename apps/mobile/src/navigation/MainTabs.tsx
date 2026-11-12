import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { MainTabParamList } from '../types/navigation';
import ProfileStack from './ProfileStack';
import MapStack from './MapStack';
import HomeStack from './HomeStack';
import DealsScreen from '../screens/main/DealsScreen';

const Tab = createBottomTabNavigator<MainTabParamList>();

export default function MainTabs() {
  return (
    <Tab.Navigator>
      <Tab.Screen name="Home" component={HomeStack} options={{ headerShown: false }} />
      <Tab.Screen name="Map" component={MapStack} options={{ headerShown: false }} />
          <Tab.Screen name="Deals" component={DealsScreen} />
      <Tab.Screen
        name="Profile"
        component={ProfileStack}
        options={{ headerShown: false }}
      />
    </Tab.Navigator>
  );
}
