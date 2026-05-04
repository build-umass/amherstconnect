import { type Timestamp } from 'firebase/firestore';

export type NotificationType = 'new_event_match' | 'saved_event_reminder';

export interface AppNotification {
  id: string;
  userId: string;
  type: NotificationType;
  eventId: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: Timestamp;
}
