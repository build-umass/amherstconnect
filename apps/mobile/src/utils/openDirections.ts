import { Platform, Linking } from 'react-native';

export function openDirections(location: string): Promise<unknown> {
  const label = encodeURIComponent(location);
  const url =
    Platform.OS === 'ios'
      ? `maps:0,0?q=${label}`
      : `geo:0,0?q=${label}`;
  return Linking.openURL(url);
}