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

export interface AppEvent {
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