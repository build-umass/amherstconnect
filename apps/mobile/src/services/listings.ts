import { createFixtureListingRepository, type FixtureListingRepository } from './listingRepository';
import { requestKeyFromBytes } from './listingForm';

let listingRepository: FixtureListingRepository | null = null;

/**
 * The Organizer tab's listing repository. Task 4.1 uses fixtures only;
 * 4.2 swaps in the Supabase version from 2.2.
 */
export function getListingRepository(): FixtureListingRepository {
  listingRepository ??= createFixtureListingRepository();
  return listingRepository;
}

/** A fresh organizer_publications.request_key. */
export function newRequestKey(): string {
  return requestKeyFromBytes(crypto.getRandomValues(new Uint8Array(16)));
}
