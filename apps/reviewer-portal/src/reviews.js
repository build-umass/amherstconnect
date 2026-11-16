const applications = [
  {
    id: 'student-garden', organizationName: 'Campus Seed Collective', kind: 'Student organization',
    contactName: 'Jordan Lee', contactRole: 'Events coordinator', email: 'garden@example.test',
    affiliationUrl: 'https://example.test/seed-collective', address: null,
    about: 'We host seed swaps and beginner gardening workshops for students.',
    postingPlans: 'Events', frequency: 'Twice a month', acceptedTerms: true,
    submittedAt: '2026-11-14T15:30:00Z', status: 'pending', rejectionReason: null,
  },
  {
    id: 'bookshop', organizationName: 'Mill Lane Books', kind: 'Local business',
    contactName: 'Robin Patel', contactRole: 'Owner', email: 'books@example.test',
    affiliationUrl: 'https://example.test/mill-lane-books', address: '12 Example Lane, Amherst, MA',
    about: 'An independent bookshop planning readings and discounts for students.',
    postingPlans: 'Events and deals', frequency: 'Once a week', acceptedTerms: true,
    submittedAt: '2026-11-13T18:00:00Z', status: 'pending', rejectionReason: null,
  },
];

export function createFixtureReviews() {
  const records = new Map(applications.map(application => [application.id, { ...application }]));
  return {
    list: () => Array.from(records.values(), record => ({ ...record })),
    get(id) {
      const record = records.get(id);
      return record ? { ...record } : null;
    },
    decide(id, decision, reason = '') {
      const record = records.get(id);
      if (record?.status !== 'pending') throw new Error('Only pending applications can be reviewed.');
      if (decision !== 'approved' && decision !== 'rejected') throw new Error('Choose a valid decision.');
      const rejectionReason = decision === 'rejected' ? reason.trim() : null;
      if (decision === 'rejected' && !rejectionReason) throw new Error('Enter a rejection reason.');
      records.set(id, { ...record, status: decision, rejectionReason });
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
