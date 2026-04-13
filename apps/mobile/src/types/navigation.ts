import { type NavigatorScreenParams } from '@react-navigation/native';

export type AuthStackParamList = {
  Welcome: undefined;
  RoleSelection: undefined;
  SignUp: undefined;
  Login: undefined;
  InterestSelection: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Map: undefined;
  Discover: undefined;
  Deals: undefined;
  Profile: undefined;
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
