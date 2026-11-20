// AC-121 supplies these operations. Keep Supabase RPC names and row mapping
// in its eventual adapter, after the backend contract is available.
export function createApplicationRepository({ checkReviewer, listApplications, readApplication, approveApplication, rejectApplication }) {
  async function asReviewer(operation) {
    if (await checkReviewer() !== true) throw new Error('Reviewer access required.');
    return operation();
  }

  return {
    list(status) {
      return asReviewer(() => listApplications(status));
    },
    read(id) {
      return asReviewer(() => readApplication(id));
    },
    approve(id) {
      // The backend grants membership and initializes the cap atomically.
      return asReviewer(() => approveApplication(id));
    },
    async reject(id, reason) {
      const trimmed = typeof reason === 'string' ? reason.trim() : '';
      if (!trimmed) throw new Error('Enter a rejection reason.');
      return asReviewer(() => rejectApplication(id, trimmed));
    },
  };
}
