export function createApplicationRepository({
  checkReviewer, listApplications, readApplication, approveApplication, rejectApplication,
  getSessionUserId,
}) {
  async function asReviewer(operation) {
    const actor = getSessionUserId?.();
    if (await checkReviewer() !== true) throw new Error('Reviewer access required.');
    if (getSessionUserId && (!actor || getSessionUserId() !== actor)) {
      throw new Error('Your session changed. Sign in again.');
    }
    return operation();
  }
  return {
    list: status => asReviewer(() => listApplications(status)),
    read: id => asReviewer(() => readApplication(id)),
    approve(id, cap = 3) {
      if (!Number.isSafeInteger(cap) || cap < 0 || cap > 50) {
        return Promise.reject(new Error('Enter a whole publication cap between 0 and 50.'));
      }
      return asReviewer(() => approveApplication(id, cap));
    },
    async reject(id, reason) {
      const trimmed = typeof reason === 'string' ? reason.trim() : '';
      if (!trimmed) throw new Error('Enter a rejection reason.');
      return asReviewer(() => rejectApplication(id, trimmed));
    },
  };
}

export function createSupabaseApplicationRepository(client, { getSessionUserId } = {}) {
  async function rpc(name, args) {
    const { data, error } = await client.rpc(name, args);
    if (error) {
      if (error.code === '42501') throw new Error('Reviewer access required. Check your account and try again.');
      if (error.code === 'P0002') throw new Error('Application not found. Refresh the queue.');
      if (error.code === '55000') throw new Error('This application has already changed. Refresh before deciding.');
      throw new Error('The request could not be completed. Check your connection and try again.');
    }
    return data;
  }
  return createApplicationRepository({
    getSessionUserId,
    checkReviewer: () => rpc('is_content_reviewer'),
    listApplications: status => rpc('reviewer_list_organizer_applications', { p_status: status, p_limit: 500 }),
    readApplication: async id => {
      const rows = await rpc('reviewer_get_organizer_application', { p_application_id: id });
      return rows?.[0] ?? null;
    },
    approveApplication: (id, cap) => rpc('approve_organizer_application', { p_application_id: id, p_weekly_cap: cap }),
    rejectApplication: (id, reason) => rpc('reject_organizer_application', { p_application_id: id, p_reason: reason }),
  });
}
