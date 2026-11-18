import { type NavigatorScreenParams } from '@react-navigation/native';
import type { EventDetailParams, MapHighlight } from '../services/eventDetailsView';
import type { OrganizerApplicationDraft, OrganizerApplicationStatus } from '../services/organizerApplications';

export type AuthStackParamList = {
  Welcome: undefined;
  RoleSelection: undefined;
  SignUp: undefined;
  Login: { email?: string } | undefined;
  /** `sent: false` when arriving from a refused login, before any email was sent. */
  ConfirmEmail: { email: string; sent?: boolean };
  InterestSelection: undefined;
  FinishOnboarding: undefined;
};

export type { EventDetailParams, MapHighlight };

export type HomeStackParamList = {
  HomeScreen: undefined;
  Notifications: undefined;
  EventDetail: EventDetailParams;
};

/** Map tab: the map, plus Event Details so Back returns to the map. */
export type MapStackParamList = {
  MapScreen: Partial<MapHighlight> | undefined;
  EventDetail: EventDetailParams;
};

export type MainTabParamList = {
  Home: NavigatorScreenParams<HomeStackParamList>;
  Map: NavigatorScreenParams<MapStackParamList>;
  Deals: undefined;
  Profile: undefined;
};

export type ProfileStackParamList = {
  ProfileHome: undefined;
  OrganizerApplication: { draft?: OrganizerApplicationDraft } | undefined;
  OrganizerApplicationStatus: {
    status?: OrganizerApplicationStatus;
    draft: OrganizerApplicationDraft;
    submittedAt: string;
  };
  Settings: undefined;
  EditInterests: undefined;
  EventDetail: EventDetailParams;
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
