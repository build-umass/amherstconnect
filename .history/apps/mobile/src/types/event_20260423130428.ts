export type EventCategory =
  | 'dining'
  | 'music'
  | 'sports'
  | 'cultural'
  | 'rso'
  | 'arts'
  | 'academic'
  | 'nightlife'
  | 'fitness';

export interface Event {
  id: string;
  organizerId: string;
  title: string;
  description: string;
  location: string;
  latitude: number;
  longitude: number;
  startTime: Date;
  endTime: Date;
  category: EventCategory;
  coverImageUrl: string | null;
  isFeatured: boolean;
  rsvpLimit: number | null;
  createdAt: Date;
}

export type UserLocation = {
  latitude: number;
  longitude: number;
};

type MapSectionProps = {
  mapRef: React.RefObject<any>;
  events: Event[];
  selectedEvent: Event | null;
  userLocation: UserLocation | null;
  onPinPress: (event: Event) => void;
  onMapPress: () => void;
};