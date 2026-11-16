import React from 'react';
import { Lucide } from '@react-native-vector-icons/lucide';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text } from 'react-native';
import type { MainTabParamList } from '../types/navigation';
import ProfileStack from './ProfileStack';
import MapStack from './MapStack';
import HomeStack from './HomeStack';
import DealsScreen from '../screens/main/DealsScreen';

const Tab = createBottomTabNavigator<MainTabParamList>();

const Placeholder = (name: string) => () => (
  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
    <Text style={{ fontSize: 18, color: '#999' }}>{name}</Text>
  </View>
);

export default function MainTabs() {
  return (
    <Tab.Navigator screenOptions={({ route }) => ({
      tabBarActiveTintColor: '#98190B',
      tabBarInactiveTintColor: '#777777',
      tabBarIcon: ({ color, size }) => {
        const name =
          route.name === 'Home' ? 'house' :
          route.name === 'Map' ? 'map' :
          route.name === 'Discover' ? 'compass' :
          route.name === 'Deals' ? 'tag' : 'user';
        return <Lucide name={name} size={size} color={color} />;
      },
    })}>
      <Tab.Screen name="Home" component={HomeStack} options={{ headerShown: false }} />
      <Tab.Screen name="Map" component={MapStack} options={{ headerShown: false }} />
      <Tab.Screen name="Discover" component={Placeholder('Discover')} />
      <Tab.Screen name="Deals" component={DealsScreen} />
      <Tab.Screen
        name="Profile"
        component={ProfileStack}
        options={{ headerShown: false }}
      />
    </Tab.Navigator>
  );
}
