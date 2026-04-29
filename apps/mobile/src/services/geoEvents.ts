import { useState, useEffect } from 'react';
import type { Event } from '../types/event';

type UserLocation = {
  latitude: number;
  longitude: number;
};

// ── Haversine distance in metres ─────────────────────────────
function getDistanceMetres(
  userLat: number,
  userLon: number,
  eventLat: number,
  eventLon: number,
): number {
  const R = 6371e3;
  const p1 = (userLat * Math.PI) / 180;
  const p2 = (eventLat * Math.PI) / 180;
  const dp = ((eventLat - userLat) * Math.PI) / 180;
  const dl = ((eventLon - userLon) * Math.PI) / 180;
  const a =
    Math.sin(dp / 2) ** 2 +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function getWalkingMinutes(metres: number): number {
  return Math.round(metres / 80);
}

export function getWalkLabel(
  userLocation: UserLocation,
  event: Event,
): string {
  if (!event.latitude || !event.longitude) return '';
  const metres = getDistanceMetres(
    userLocation.latitude,
    userLocation.longitude,
    event.latitude,
    event.longitude,
  );
  return `${getWalkingMinutes(metres)} min walk`;
}

// ── Hook — returns events within 800m (~10 min walk) ────────
// Replace MOCK_NEARBY with a real Firestore query later
export function useNearbyEvents(
  userLocation: UserLocation | null,
  allEvents: Event[],
): Event[] {
  const [nearby, setNearby] = useState<Event[]>([]);

  useEffect(() => {
    if (!userLocation) {
      setNearby(allEvents.slice(0, 3));
      return;
    }
    const filtered = allEvents.filter(event => {
      if (!event.latitude || !event.longitude) return false;
      const metres = getDistanceMetres(
        userLocation.latitude,
        userLocation.longitude,
        event.latitude,
        event.longitude,
      );
      return metres <= 800;
    });
    setNearby(filtered);
  }, [userLocation, allEvents]);

  return nearby;
}