const statuses = ['pending', 'approved', 'rejected', 'revoked', 'withdrawn'];
const label = value => value.charAt(0).toUpperCase() + value.slice(1);
const date = value => value ? new Date(value).toLocaleString('en-US', { timeZone: 'America/New_York' }) : '—';

export function createLiveApplications({ element, button, repository, isActive }) {
  const root = element('section', { class: 'split' });
  let filter = 'pending';
  let rows = [];
  let selected = null;
  let application = null;
  let listStatus = 'loading';
  let listError = '';
  let detailStatus = 'idle';
  let detailError = '';
  let actionError = '';
  let notice = '';
  let busy = false;
  let listRevision = 0;
  let detailRevision = 0;

  const safeRender = () => { if (isActive()) render(); };
  async function loadDetail(id) {
    const revision = ++detailRevision;
    selected = id; application = null; detailError = ''; actionError = ''; detailStatus = 'loading';
    safeRender();
    try {
      const result = await repository.read(id);
      if (!isActive() || revision !== detailRevision) return;
      application = result; detailStatus = result ? 'ready' : 'missing';
    } catch (error) {
      if (!isActive() || revision !== detailRevision) return;
      detailError = error.message; detailStatus = 'error';
    }
    safeRender();
  }
  async function loadList() {
    const revision = ++listRevision;
    ++detailRevision;
    listStatus = 'loading'; listError = ''; application = null; detailStatus = 'idle';
    safeRender();
    try {
      const result = await repository.list(filter);
      if (!isActive() || revision !== listRevision) return;
      rows = result; listStatus = 'ready';
      if (rows.length) {
        const id = rows.some(row => row.id === selected) ? selected : rows[0].id;
        void loadDetail(id);
      } else selected = null;
    } catch (error) {
      if (!isActive() || revision !== listRevision) return;
      rows = []; listError = error.message; listStatus = 'error';
    }
    safeRender();
  }

  async function decide(decision, reason, cap) {
    if (!isActive() || busy || !application) return;
    const id = application.id;
    if (decision === 'rejected' && !reason.trim()) {
      actionError = 'Enter a rejection reason.'; safeRender(); return;
    }
    busy = true; actionError = ''; notice = ''; safeRender();
    try {
      if (decision === 'approved') await repository.approve(id, cap);
      else await repository.reject(id, reason);
      if (!isActive()) return;
      filter = decision; selected = id;
      notice = decision === 'approved' ? 'Organizer approved. Publishing access and the weekly cap were saved.'
        : 'Application rejected. The reason was saved.';
      await loadList();
    } catch (error) {
      if (!isActive()) return;
      actionError = error.message;
    } finally {
      busy = false; safeRender();
    }
  }

  function render() {
    const filters = element('div', { class: 'filters', role: 'group', 'aria-label': 'Application status' },
      ...statuses.map(status => {
        const item = button(label(status), () => {
          if (!isActive() || busy) return;
          filter = status; selected = null; notice = ''; void loadList();
        }, 'pill');
        item.setAttribute('aria-pressed', String(filter === status));
        item.disabled = busy;
        return item;
      }));
    const refresh = button('Refresh applications', () => { if (isActive() && !busy) void loadList(); }, 'secondary');
    refresh.disabled = busy;
    const left = element('section', { class: 'content-area' },
      element('h1', {}, 'Organizer applications'), filters, refresh);
    if (notice) left.append(element('p', { role: 'status' }, notice));
    if (listStatus === 'loading') left.append(element('p', { role: 'status' }, 'Loading applications…'));
    else if (listStatus === 'error') left.append(element('p', { role: 'alert' }, listError),
      button('Retry applications', () => { if (isActive()) void loadList(); }));
    else if (!rows.length) left.append(element('p', { role: 'status', class: 'panel empty' }, 'No ' + filter + ' applications.'));
    else {
      const table = element('table', { 'aria-label': 'Applications' },
        element('thead', {}, element('tr', {}, ...['Organizer', 'Type', 'Submitted', 'Status'].map(
          name => element('th', { scope: 'col' }, name)))),
        element('tbody', {}, ...rows.map(row => {
          const open = button(row.organizer_name, () => { if (isActive() && !busy) void loadDetail(row.id); }, 'table-link');
          open.disabled = busy;
          return element('tr', { class: selected === row.id ? 'selected' : '' },
            element('td', {}, open), element('td', {}, row.organizer_kind.replaceAll('_', ' ')),
            element('td', {}, date(row.created_at)), element('td', {}, label(row.status)));
        })));
      left.append(element('div', { class: 'table-wrap', tabindex: '0' }, table));
      if (rows.length === 500) left.append(element('p', { role: 'status' },
        'Showing up to 500 applications. Older applications may be outside this queue.'));
    }
    const right = element('aside', { class: 'panel detail', id: 'review-details', 'aria-label': 'Application details' });
    if (detailStatus === 'loading') right.append(element('p', { role: 'status' }, 'Loading application details…'));
    else if (detailStatus === 'error') right.append(element('p', { role: 'alert' }, detailError),
      button('Retry details', () => { if (isActive()) void loadDetail(selected); }));
    else if (detailStatus === 'missing') right.append(element('p', { role: 'status' }, 'Application not found.'));
    else if (application) {
      const a = application;
      right.append(element('h2', {}, a.organizer_name), element('p', { class: 'badge badge-' + a.status }, label(a.status)));
      const facts = {
        Contact: a.contact_name + ' · ' + a.contact_role, 'Private email': a.contact_email,
        Type: a.organizer_kind.replaceAll('_', ' '), Address: a.amherst_street_address || 'Not provided',
        Plans: [a.plans_events && 'Events', a.plans_deals && 'Deals'].filter(Boolean).join(', '),
        Frequency: a.estimated_posting_frequency.replaceAll('_', ' '),
        'Accepted terms': date(a.organizer_terms_accepted_at), Submitted: date(a.created_at),
        'Decision date': date(a.decided_at),
      };
      right.append(element('dl', {}, ...Object.entries(facts).flatMap(([name, value]) => [
        element('dt', {}, name), element('dd', {}, value)])), element('p', {}, a.about));
      try {
        const url = new URL(a.affiliation_url);
        if (url.protocol === 'https:') right.append(element('a', { href: url.href, target: '_blank',
          rel: 'noopener noreferrer' }, 'Affiliation link'));
      } catch { right.append(element('p', {}, 'Affiliation link unavailable.')); }
      if (a.rejection_reason) right.append(element('p', {}, 'Rejection reason: ' + a.rejection_reason));
      if (a.status === 'pending') {
        const cap = element('input', { id: 'initial-cap', type: 'number', min: '0', max: '50', step: '1', value: '3' });
        const reason = element('textarea', { id: 'application-reason', rows: '3' });
        const approve = button('Approve organizer', () => void decide('approved', '', cap.valueAsNumber));
        const reject = button('Reject', () => void decide('rejected', reason.value, 3), 'secondary');
        cap.disabled = reason.disabled = approve.disabled = reject.disabled = busy;
        right.append(element('label', { for: 'initial-cap' }, 'Initial weekly publication cap'), cap,
          element('label', { for: 'application-reason' }, 'Reason (required to reject)'), reason,
          element('div', { class: 'actions' }, approve, reject));
        if (busy) right.append(element('p', { role: 'status' }, 'Saving decision…'));
      }
      if (actionError) right.append(element('p', { role: 'alert' }, actionError));
    }
    root.replaceChildren(left, right);
  }

  return {
    view() {
      if (listStatus === 'loading' && listRevision === 0) void loadList();
      else safeRender();
      return root;
    },
    reload: loadList,
  };
}
