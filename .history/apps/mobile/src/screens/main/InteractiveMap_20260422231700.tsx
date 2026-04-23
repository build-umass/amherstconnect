import React from 'react';

export const InteractiveMap = (name: string) => () => (
  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
    <Text style={{ fontSize: 18, color: '#999' }}>{name}</Text>
  </View>
);