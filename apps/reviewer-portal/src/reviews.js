import { fixtureApplications, fixtureAudit, fixtureListings, fixtureOrganizers } from './fixtures.js';

export function createFixtureReviews({ actor = 'BUILD reviewer', now = () => new Date() } = {}) {
  const applications = new Map(structuredClone(fixtureApplications).map(record => [record.id, record]));
  const organizers = new Map(structuredClone(fixtureOrganizers).map(record => [record.id, record]));
  const listings = new Map(structuredClone(fixtureListings).map(record => [record.id, record]));
  const audit = structuredClone(fixtureAudit).sort((a, b) => b.at.localeCompare(a.at));

  function record(action, { organizerId = null, applicationId = null, listingId = null, target, note }) {
    audit.unshift({ id: 'demo-' + audit.length, at: now().toISOString(), actor, action,
      organizerId, applicationId, listingId, target, note });
  }

  function requireReason(reason, message) {
    const value = reason.trim();
    if (!value) throw new Error(message);
    return value;
  }

  function validateCap(cap) {
    if (!Number.isSafeInteger(cap) || cap < 0) throw new Error('Enter a whole number of listings, zero or greater.');
  }

  function approvedOrganizer(id) {
    const organizer = organizers.get(id);
    if (organizer?.status !== 'approved') throw new Error('This organizer must have active approval.');
    return organizer;
  }

  function liveListings(id) {
    return [...listings.values()].filter(listing => listing.organizerId === id && listing.status === 'live');
  }

  return {
    list: (status = 'all') => structuredClone([...applications.values()]
      .filter(application => status === 'all' || application.status === status)),
    get: id => structuredClone(applications.get(id) ?? null),
    organizers: () => structuredClone([...organizers.values()]),
    organizer: id => structuredClone(organizers.get(id) ?? null),
    listings: id => structuredClone([...listings.values()].filter(listing => !id || listing.organizerId === id)),
    listing: id => structuredClone(listings.get(id) ?? null),
    audit: id => structuredClone(audit.filter(entry => !id || entry.organizerId === id)),

    decide(id, decision, reason = '', { cap = 3, checks = [] } = {}) {
      const application = applications.get(id);
      if (application?.status !== 'pending') throw new Error('Only pending applications can be reviewed.');
      if (decision !== 'approved' && decision !== 'rejected') throw new Error('Choose a valid decision.');
      if (decision === 'rejected') {
        application.rejectionReason = requireReason(reason, 'Enter a rejection reason.');
        application.status = 'rejected';
        application.checks = [...checks];
        record('Rejected application', { applicationId: id, target: application.organizationName,
          note: application.rejectionReason });
        return;
      }
      validateCap(cap);
      const organizerId = 'org-' + id;
      organizers.set(organizerId, { id: organizerId, applicationId: id, name: application.organizationName,
        cap, status: 'approved', approvedAt: now().toISOString(), approvedBy: actor, revocationReason: null });
      Object.assign(application, { status: 'approved', organizerId, checks: [...checks] });
      record('Approved organizer', { applicationId: id, organizerId, target: application.organizationName,
        note: 'Weekly publication cap set to ' + cap + '.' });
    },

    setCap(id, cap) {
      const organizer = approvedOrganizer(id);
      validateCap(cap);
      if (organizer.cap === cap) return;
      const previous = organizer.cap;
      organizer.cap = cap;
      record('Changed publication cap', { organizerId: id, target: organizer.name, note: previous + ' → ' + cap });
    },

    revoke(id, reason) {
      const organizer = approvedOrganizer(id);
      const note = requireReason(reason, 'Enter a reason to revoke approval.');
      organizer.status = 'revoked';
      organizer.revocationReason = note;
      applications.get(organizer.applicationId).status = 'revoked';
      record('Revoked approval', { organizerId: id, applicationId: organizer.applicationId,
        target: organizer.name, note });
    },

    removeListing(id, reason) {
      const listing = listings.get(id);
      if (listing?.status !== 'live') throw new Error('Only live listings can be removed.');
      const note = requireReason(reason, 'Enter a reason to remove this listing.');
      listing.status = 'removed';
      listing.removalReason = note;
      record('Removed listing', { organizerId: listing.organizerId, listingId: id, target: listing.title, note });
    },

    removeAll(id, reason) {
      const organizer = organizers.get(id);
      const affected = liveListings(id);
      if (!organizer || !affected.length) throw new Error('This organizer has no live listings to remove.');
      const note = requireReason(reason, 'Enter a reason to remove all live listings.');
      for (const listing of affected) {
        listing.status = 'removed';
        listing.removalReason = note;
      }
      record('Removed all live listings', { organizerId: id, target: organizer.name,
        note: affected.length + ' affected · ' + note });
    },
  };
}

export function createReviewerAccess({ checkReviewer, createReviews = createFixtureReviews, render }) {
  let revision = 0;
  let state = { view: 'loading' };
  const set = next => {
    state = next;
    render(state);
  };
  return {
    async sessionChanged(userId) {
      const current = ++revision;
      if (!userId) return set({ view: 'sign-in' });
      if (state.view === 'review' && state.userId === userId) return;
      set({ view: 'loading' });
      try {
        const allowed = await checkReviewer();
        if (revision !== current) return;
        set(allowed === true ? { view: 'review', userId, reviews: createReviews() } : { view: 'denied' });
      } catch {
        if (revision === current) set({ view: 'error' });
      }
    },
    isCurrent: candidate => state === candidate,
  };
}
