import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer }      from '@react-navigation/native';
import { View, Text }               from 'react-native';
import HomeScreen                   from '../screens/HomeScreen';

const Tab = createBottomTabNavigator();

const Placeholder = (name: string) => () => (
  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
    <Text>{name}</Text>
  </View>
);

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: '#8B1A1A',
          tabBarInactiveTintColor: '#999',
          tabBarStyle: { borderTopColor: '#eee', backgroundColor: '#fff' },
        }}
      >
        <Tab.Screen
          name="Home"
          component={HomeScreen}
          options={{
            tabBarIcon: ({ color, size }) => (
              <Text style={{ fontSize: size - 2, color }}>🏠</Text>
            ),
          }}
        />
        <Tab.Screen name="Map"      component={Placeholder('Map')} />
        <Tab.Screen name="Discover" component={Placeholder('Discover')} />
        <Tab.Screen name="Deals"    component={Placeholder('Deals')} />
        <Tab.Screen name="Profile"  component={Placeholder('Profile')} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
