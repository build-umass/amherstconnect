import { type NavigatorScreenParams } from '@react-navigation/native';
import type { Event } from './event';

export type AuthStackParamList = {
  Welcome: undefined;
  RoleSelection: undefined;
  SignUp: undefined;
  Login: { email?: string } | undefined;
  /** `sent: false` when arriving from a refused login, before any email was sent. */
  ConfirmEmail: { email: string; sent?: boolean };
  InterestSelection: undefined;
};

export type HomeStackParamList = {
  HomeScreen: undefined;
  EventDetail: { event: Event };
};

export type MainTabParamList = {
  Home: NavigatorScreenParams<HomeStackParamList>;
  Map: { highlightedEventId?: string };
  Discover: undefined;
  Deals: undefined;
  Profile: undefined;
};

export type ProfileStackParamList = {
  ProfileHome: undefined;
  Settings: undefined;
  EditInterests: undefined;
};

export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  Main: NavigatorScreenParams<MainTabParamList>;
};

// Augment the react-navigation types for useNavigation type safety
declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
