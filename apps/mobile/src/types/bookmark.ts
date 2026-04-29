import { type Timestamp } from 'firebase/firestore';

export interface Bookmark {
  userId: string;
  eventId: string;
  createdAt: Timestamp;
}
