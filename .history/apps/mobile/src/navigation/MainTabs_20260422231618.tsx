import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text } from 'react-native';
import type { MainTabParamList } from '../types/navigation';
import ProfileScreen from '../screens/main/ProfileScreen';
import Inter

const Tab = createBottomTabNavigator<MainTabParamList>();

// Placeholder for tabs not yet built
const Placeholder = (name: string) => () => (
  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
    <Text style={{ fontSize: 18, color: '#999' }}>{name}</Text>
  </View>
);

export default function MainTabs() {
  return (
    <Tab.Navigator>
      <Tab.Screen name="Home" component={Placeholder('Home')} />
      <Tab.Screen name="Map" component={Placeholder('Map')} />
      <Tab.Screen name="Discover" component={Placeholder('Discover')} />
      <Tab.Screen name="Deals" component={Placeholder('Deals')} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}
