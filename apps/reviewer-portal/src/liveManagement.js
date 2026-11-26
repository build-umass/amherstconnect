const date = value => value ? new Date(value).toLocaleString('en-US', { timeZone: 'America/New_York' }) : '—';

export function createLiveManagement({ element, button, repository, isActive }) {
  const root = element('section', { class: 'content-area' });
  let tab = 'Organizers';
  let data = [];
  let selected = null;
  let detail = null;
  let detailError = '';
  let detailLoading = false;
  let error = '';
  let status = 'loading';
  let revision = 0;
  let detailRevision = 0;
  let busy = false;
  let confirmRemoval = null;
  let notice = '';
  let search = '';

  const valid = () => isActive(tab);
  const safeRender = () => { if (valid()) render(); };
  const name = id => id ?? '—';
  const organizerName = row => {
    const organizer = Array.isArray(row.organizers) ? row.organizers[0] : row.organizers;
    return organizer?.name ?? row.organizer_id;
  };
  const unavailable = text => element('p', { class: 'muted' }, text);
  function table(title, headings, rows) {
    return element('div', { class: 'table-wrap', tabindex: '0' },
      element('table', { 'aria-label': title },
        element('thead', {}, element('tr', {}, ...headings.map(h => element('th', { scope: 'col' }, h)))),
        element('tbody', {}, ...rows.map(cells => element('tr', {}, ...cells.map((c, index) => element('td', {},
          element('span', { class: 'cell-label', 'aria-hidden': 'true' }, headings[index]), element('span', {}, c))))))));
  }
  function auditTable(rows) {
    return table('Reviewer activity', ['Time (ET)', 'Actor profile', 'Action', 'Organizer', 'Application', 'Event'],
      rows.map(row => [date(row.created_at), row.actor_profile_id ?? 'System', row.action.replaceAll('_', ' '),
        name(row.organizer_id), name(row.organizer_application_id), name(row.event_id)]));
  }
  function cap(row) {
    const settings = Array.isArray(row.organizer_publishing_settings)
      ? row.organizer_publishing_settings[0] : row.organizer_publishing_settings;
    return settings ? String(settings.weekly_cap) : 'Not configured';
  }

  async function load() {
    const current = ++revision;
    ++detailRevision;
    selected = null; detail = null; detailLoading = false; detailError = ''; error = ''; status = 'loading';
    confirmRemoval = null; safeRender();
    try {
      const rows = tab === 'Organizers' ? await repository.organizers()
        : tab === 'Listings' ? await repository.events() : await repository.audit();
      if (!valid() || revision !== current) return;
      data = rows; status = 'ready';
    } catch (failure) {
      if (!valid() || revision !== current) return;
      data = []; status = 'error'; error = failure.message;
    }
    safeRender();
  }

  async function openOrganizer(row) {
    if (!valid()) return;
    const current = ++detailRevision;
    selected = row; detail = null; detailError = ''; detailLoading = true; safeRender();
    try {
      const [contact, events, activity] = await Promise.all([
        repository.contact(row.id), repository.events(), repository.audit(row.id),
      ]);
      if (!valid() || current !== detailRevision) return;
      detail = { contact, events: events.filter(event => event.organizer_id === row.id), activity,
        eventLimitReached: events.length === 500 };
    } catch (failure) {
      if (!valid() || current !== detailRevision) return;
      detailError = failure.message;
    }
    if (current === detailRevision) detailLoading = false;
    safeRender();
  }

  async function remove(row) {
    if (!valid() || busy || confirmRemoval !== row.id) return;
    const current = revision;
    busy = true; error = ''; notice = ''; safeRender();
    try {
      await repository.removeEvent(row.id);
      if (!valid() || current !== revision) return;
      notice = 'Event removed from student views. Organizer posting access is unchanged.';
      await load();
    } catch (failure) {
      if (!valid() || current !== revision) return;
      error = failure.message;
    } finally {
      busy = false; safeRender();
    }
  }

  function render() {
    root.className = 'content-area';
    const refresh = button('Refresh ' + tab.toLowerCase(), () => { if (valid() && !busy) void load(); }, 'secondary');
    refresh.disabled = busy;
    root.replaceChildren(element('h1', {}, tab === 'Audit Log' ? 'Audit log' : tab), refresh);
    if (notice) root.append(element('p', { role: 'status' }, notice));
    if (error) root.append(element('p', { role: 'alert' }, error));
    if (status === 'loading') { root.append(element('p', { role: 'status' }, 'Loading ' + tab.toLowerCase() + '…')); return; }
    if (status === 'error') {
      root.append(button('Try again', () => { if (valid()) void load(); }));
      return;
    }
    if (data.length === 500) root.append(unavailable('Showing up to 500 records. Earlier records may be outside this view.'));
    if (tab === 'Organizers') {
      root.append(unavailable('Revocation and publication-cap changes are awaiting backend operations. Current limits are read-only.'));
      if (!data.length) root.append(element('p', { role: 'status', class: 'panel empty' }, 'No approved organizers.'));
      else root.append(table('Organizers', ['Organizer', 'Status', 'Weekly cap'], data.map(row => [
        button(row.name, () => void openOrganizer(row), 'table-link'),
        row.posting_revoked_at ? 'Revoked' : !row.active ? 'Inactive' : 'Approved', cap(row),
      ])));
      if (selected) {
        const panel = element('aside', { class: 'panel detail', 'aria-label': 'Organizer details' },
          element('h2', {}, selected.name), element('p', {}, 'Weekly publication cap: ' + cap(selected)));
        if (selected.posting_revocation_reason) panel.append(element('p', {}, 'Revocation reason: ' + selected.posting_revocation_reason));
        if (detailLoading) panel.append(element('p', { role: 'status' }, 'Loading organizer details…'));
        if (detailError) panel.append(element('p', { role: 'alert' }, detailError),
          button('Retry organizer details', () => void openOrganizer(selected)));
        if (detail) {
          panel.append(element('p', {}, 'Private contact: ' + (detail.contact?.contact_email ?? 'Not available')),
            element('h3', {}, 'Published events'));
          if (detail.activity.length === 500) panel.append(unavailable('Showing up to 500 activity records for this organizer.'));
          if (detail.eventLimitReached) panel.append(unavailable('Event results are limited; this organizer may have more events.'));
          panel.append(detail.events.length ? table('Organizer events', ['Event', 'Status'],
            detail.events.map(event => [event.title, event.status])) : element('p', {}, 'No readable published events.'),
          element('h3', {}, 'Activity'), detail.activity.length ? auditTable(detail.activity) : element('p', {}, 'No activity records.'));
        }
        const left = element('section', { class: 'content-area' }, ...Array.from(root.childNodes));
        root.className = 'split';
        root.replaceChildren(left, panel);
      }
    } else if (tab === 'Listings') {
      root.append(unavailable('Only published organizer events readable under the current policies are shown. Deals, hidden listing history and bulk removal await backend support.'));
      const input = element('input', { type: 'search', id: 'live-listing-search', placeholder: 'Search by title or organizer' });
      input.value = search;
      const results = element('div', {});
      const update = () => {
        const term = search.trim().toLowerCase();
        const rows = data.filter(row => [row.title, row.organizer_id, organizerName(row)].some(value => String(value).toLowerCase().includes(term)));
        results.replaceChildren(rows.length ? table('Published organizer events', ['Event', 'Organizer', 'Status', 'Action'],
          rows.map(row => {
            const action = element('div', { class: 'actions' });
            if (confirmRemoval === row.id) {
              const confirm = button('Confirm removal', () => void remove(row));
              const cancel = button('Cancel', () => { if (valid() && !busy) { confirmRemoval = null; safeRender(); } }, 'secondary');
              confirm.disabled = cancel.disabled = busy;
              action.append(element('span', {}, 'Remove this event from student views?'), confirm, cancel);
            } else {
              const request = button('Remove event', () => { if (valid() && !busy) { confirmRemoval = row.id; safeRender(); } }, 'secondary');
              request.disabled = busy;
              action.append(request);
            }
            const title = button(row.title, () => {
              if (valid() && !busy) { selected = row; safeRender(); }
            }, 'table-link');
            return [title, organizerName(row), row.status, action];
          })) : element('p', { role: 'status', class: 'panel empty' }, 'No matching published organizer events.'));
      };
      input.addEventListener('input', () => { search = input.value; update(); });
      update();
      root.append(element('label', { for: 'live-listing-search' }, 'Search published events'), input, results);
      if (busy) root.append(element('p', { role: 'status' }, 'Removing event…'));
      if (selected) {
        const panel = element('aside', { class: 'panel detail', 'aria-label': 'Event details' },
          element('h2', {}, selected.title),
          element('dl', {}, element('dt', {}, 'Event ID'), element('dd', {}, selected.id),
            element('dt', {}, 'Organizer ID'), element('dd', {}, selected.organizer_id),
            element('dt', {}, 'Status'), element('dd', {}, selected.status),
            element('dt', {}, 'Updated'), element('dd', {}, date(selected.updated_at))));
        const left = element('section', { class: 'content-area' }, ...Array.from(root.childNodes));
        root.className = 'split'; root.replaceChildren(left, panel);
      }
    } else {
      root.append(unavailable('Recorded actor IDs are shown because a reviewer-wide profile-name lookup is not available.'));
      root.append(data.length ? auditTable(data) : element('p', { role: 'status', class: 'panel empty' }, 'No reviewer activity records.'));
    }
  }

  return {
    view(nextTab) {
      tab = nextTab; notice = ''; search = '';
      void load();
      return root;
    },
  };
}
