import { reviewerChecks } from './fixtures.js';

const tabs = ['Applications', 'Organizers', 'Listings', 'Audit Log'];
const applicationStatuses = ['pending', 'approved', 'rejected', 'revoked'];
const statusNames = {
  pending: 'Pending', approved: 'Approved', rejected: 'Rejected', revoked: 'Revoked',
  live: 'Live', expired: 'Expired', withdrawn: 'Withdrawn', removed: 'Removed', hidden: 'Hidden',
};
const dates = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'America/New_York' });
const times = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/New_York',
});
const format = (value, formatter = dates) => formatter.format(new Date(value));

export function createWorkspace({ element, button, show, isCurrent, signOutButton }) {
  let activeState;
  let tab = 'Applications';
  let filter = 'pending';
  let selected = null;
  let query = '';

  const badge = status => element('span', { class: 'badge badge-' + status }, statusNames[status]);
  const caption = text => element('p', { class: 'muted' }, text);

  function table(label, headers, rows, empty) {
    if (!rows.length) return element('p', { role: 'status', class: 'panel empty' }, empty);
    return element('div', { class: 'table-wrap', tabindex: '0', role: 'region', 'aria-label': label },
      element('table', { 'aria-label': label, role: 'table' },
        element('thead', { role: 'rowgroup' }, element('tr', { role: 'row' },
          ...headers.map(header => element('th', { scope: 'col', role: 'columnheader' }, header)))),
        element('tbody', { role: 'rowgroup' }, ...rows.map(({ cells, current }) =>
          element('tr', { role: 'row', class: current ? 'selected' : '' }, ...cells.map((cell, index) =>
            element('td', { role: 'cell' }, element('span', { class: 'cell-label', 'aria-hidden': 'true' },
              headers[index]), element('span', {}, cell))))))));
  }

  function open(nextTab, id = null) {
    const moveFocus = Boolean(id);
    tab = nextTab;
    selected = id;
    if (id && nextTab === 'Applications') filter = activeState.reviews.get(id).status;
    render(activeState);
    if (moveFocus) {
      const panel = document.querySelector('#review-details');
      panel?.focus();
      if (matchMedia('(max-width: 900px)').matches) panel?.scrollIntoView({ block: 'start' });
    }
  }

  function detail(title, ...parts) {
    return element('aside', { id: 'review-details', class: 'panel detail', tabindex: '-1', 'aria-label': title },
      element('h2', {}, title), ...parts);
  }

  function facts(values) {
    return element('dl', {}, ...Object.entries(values).flatMap(([label, value]) =>
      [element('dt', {}, label), element('dd', {}, value)]));
  }

  function capInput(cap) {
    const input = element('input', { id: 'publication-cap', type: 'number', min: '0', step: '1', value: String(cap) });
    return { input, field: element('div', {}, element('label', { for: 'publication-cap' }, 'Publish cap (listings per week)'),
      input) };
  }

  function reasonInput(label) {
    const input = element('textarea', { id: 'decision-reason', rows: '3' });
    return { input, field: element('div', {}, element('label', { for: 'decision-reason' }, label), input) };
  }

  function action(state, fn, alert, focus) {
    return () => {
      if (!isCurrent(state)) return;
      try {
        fn();
        render(state);
        document.querySelector('#review-details')?.focus();
      } catch (error) {
        alert.textContent = error.message;
        focus?.focus();
      }
    };
  }

  function applications(state) {
    const records = state.reviews.list(filter);
    const current = records.find(record => record.id === selected) ?? records[0];
    const filters = element('div', { class: 'filters', role: 'group', 'aria-label': 'Application status' },
      ...applicationStatuses.map(status => {
        const pill = button(statusNames[status] + ' ' + state.reviews.list(status).length, () => {
          filter = status;
          selected = null;
          render(state);
          document.querySelector('[data-filter="' + status + '"]')?.focus();
        }, 'pill');
        pill.setAttribute('data-filter', status);
        pill.setAttribute('aria-pressed', String(filter === status));
        return pill;
      }));
    const rows = records.map(record => {
      const days = Math.max(0, Math.floor((Date.now() - Date.parse(record.submittedAt)) / 86_400_000));
      const label = button(record.organizationName, () => open('Applications', record.id), 'table-link');
      if (current?.id === record.id) label.setAttribute('aria-current', 'true');
      return { current: current?.id === record.id, cells: [label, record.kind, format(record.submittedAt),
        record.status === 'pending' ? element('span', { class: days >= 3 ? 'waiting' : '' },
          days ? days + (days === 1 ? ' day' : ' days') : 'Today') : badge(record.status)] };
    });
    const left = element('section', { class: 'content-area' }, element('h1', {}, 'Organizer applications'), filters,
      table('Applications', ['Organization', 'Type', 'Submitted', filter === 'pending' ? 'Waiting' : 'Status'],
        rows, 'No ' + filter + ' applications.'));
    return element('div', { class: 'split' }, left,
      ...(current ? [applicationDetail(state, current)] : []));
  }

  function applicationDetail(state, application) {
    const organizer = state.reviews.organizer(application.organizerId);
    const description = facts({
      Type: application.kind, Contact: application.contactName + ' · ' + application.contactRole,
      'Private email': application.email, Posting: application.postingPlans + ' · ' + application.frequency,
      Location: application.address ?? 'Not provided', 'Accepted terms': application.acceptedTerms ? 'Yes' : 'No',
      Affiliation: element('a', { href: application.affiliationUrl, target: '_blank', rel: 'noopener noreferrer' },
        application.affiliationUrl),
    });
    const view = detail(application.organizationName, caption('Submitted ' + format(application.submittedAt, times)),
      badge(application.status), description, element('p', {}, application.about));
    if (application.rejectionReason) view.append(element('p', {}, 'Rejection reason: ' + application.rejectionReason));
    if (organizer?.revocationReason) view.append(element('p', {}, 'Revocation reason: ' + organizer.revocationReason));
    if (organizer) view.append(button('View organizer', () => open('Organizers', organizer.id), 'link'));
    const checklist = element('fieldset', {}, element('legend', {}, 'Reviewer checks'));
    const boxes = reviewerChecks.map(check => {
      const box = element('input', { type: 'checkbox', value: check });
      box.checked = application.checks.includes(check);
      box.disabled = application.status !== 'pending';
      checklist.append(element('label', { class: 'check' }, box, check));
      return box;
    });
    view.append(checklist);
    if (application.status !== 'pending') return view;
    const cap = capInput(3);
    const reason = reasonInput('Reason (required to reject)');
    const alert = element('p', { role: 'alert', class: 'error' });
    const decide = decision => action(state, () => {
      state.reviews.decide(application.id, decision, reason.input.value, {
        cap: cap.input.valueAsNumber, checks: boxes.filter(box => box.checked).map(box => box.value),
      });
      filter = decision;
      selected = application.id;
    }, alert, decision === 'approved' ? cap.input : reason.input);
    view.append(cap.field, reason.field, alert, element('div', { class: 'actions' },
      button('Approve organizer', decide('approved')), button('Reject', decide('rejected'), 'secondary')));
    return view;
  }

  function organizers(state) {
    const organizer = state.reviews.organizer(selected);
    if (organizer) return organizerDetail(state, organizer);
    const rows = state.reviews.organizers().map(record => ({
      cells: [
        button(record.name, () => open('Organizers', record.id), 'table-link'),
        badge(record.status), String(record.cap), String(state.reviews.listings(record.id).length),
      ],
    }));
    return element('section', {}, element('h1', {}, 'Organizers'),
      table('Organizers', ['Organizer', 'Status', 'Weekly cap', 'Listings'], rows, 'No organizers.'));
  }

  function organizerDetail(state, organizer) {
    const application = state.reviews.get(organizer.applicationId);
    const owned = state.reviews.listings(organizer.id);
    const cap = capInput(organizer.cap);
    const reason = reasonInput('Moderation reason');
    const alert = element('p', { role: 'alert', class: 'error' });
    const approved = organizer.status === 'approved';
    const hasLive = owned.some(listing => listing.status === 'live');
    const panel = detail('Organizer details',
      facts({ Type: application.kind, 'Private email': application.email, 'Approved by': organizer.approvedBy,
        'Approved on': format(organizer.approvedAt, times), Listings: String(owned.length) }));
    if (organizer.revocationReason) panel.append(element('p', {}, 'Revocation reason: ' + organizer.revocationReason));
    if (approved) panel.append(cap.field, button('Save cap', action(state,
      () => state.reviews.setCap(organizer.id, cap.input.valueAsNumber), alert, cap.input), 'secondary'));
    else panel.append(element('p', {}, 'Weekly cap: ' + organizer.cap));
    if (approved || hasLive) panel.append(reason.field,
      caption('Revoking blocks new posts and hides live listings. Removing listings preserves approval.'),
      element('div', { class: 'actions' },
        ...(hasLive ? [button('Remove all listings', action(state,
          () => state.reviews.removeAll(organizer.id, reason.input.value), alert, reason.input), 'secondary')] : []),
        ...(approved ? [button('Revoke approval', action(state,
          () => state.reviews.revoke(organizer.id, reason.input.value), alert, reason.input))] : [])));
    panel.append(alert);
    return element('div', { class: 'split' },
      element('section', { class: 'content-area' }, button('← All organizers', () => open('Organizers'), 'link'),
        element('h1', {}, organizer.name), badge(organizer.status),
        element('h2', { class: 'section-heading' }, 'Associated listings'), listingsTable(state, owned),
        element('h2', { class: 'section-heading' }, 'Organizer activity'), auditTable(state, state.reviews.audit(organizer.id))),
      panel);
  }

  function displayListingStatus(state, listing) {
    return listing.status === 'live' && state.reviews.organizer(listing.organizerId).status === 'revoked'
      ? 'hidden' : listing.status;
  }

  function listingsTable(state, records) {
    const rows = records.map(record => ({ current: tab === 'Listings' && record.id === selected, cells: [
      button(record.title, () => open('Listings', record.id), 'table-link'),
      record.type, state.reviews.organizer(record.organizerId).name,
      (record.type === 'Deal' ? 'Until ' : '') + format(record.date),
      badge(displayListingStatus(state, record)),
    ] }));
    return table('Listings', ['Listing', 'Type', 'Organizer', 'Date', 'Status'], rows, 'No matching listings.');
  }

  function listings(state) {
    const search = element('input', { id: 'listing-search', type: 'search', placeholder: 'Search by title or organizer' });
    search.value = query;
    const results = element('div', { class: 'listing-results' });
    const update = () => {
      const term = query.trim().toLowerCase();
      results.replaceChildren(listingsTable(state, state.reviews.listings().filter(listing =>
        [listing.title, listing.type, displayListingStatus(state, listing), state.reviews.organizer(listing.organizerId).name]
          .some(value => value.toLowerCase().includes(term)))));
    };
    search.addEventListener('input', () => { query = search.value; update(); });
    update();
    const record = state.reviews.listing(selected);
    const left = element('section', { class: 'content-area' }, element('h1', {}, 'Listings'),
      element('label', { for: 'listing-search' }, 'Search listings'), search, results);
    if (!record) return left;
    const organizer = state.reviews.organizer(record.organizerId);
    const panel = detail(record.title, badge(displayListingStatus(state, record)), facts({
      Type: record.type, Organizer: button(organizer.name, () => open('Organizers', organizer.id), 'link'),
      [record.type === 'Deal' ? 'Valid until' : 'Starts']: format(record.date, times),
    }));
    if (record.removalReason) panel.append(element('p', {}, 'Removal reason: ' + record.removalReason));
    if (record.status === 'live') {
      const reason = reasonInput('Removal reason');
      const alert = element('p', { role: 'alert', class: 'error' });
      panel.append(reason.field, alert, button('Remove listing', action(state,
        () => state.reviews.removeListing(record.id, reason.input.value), alert, reason.input), 'secondary'));
    }
    return element('div', { class: 'split' }, left, panel);
  }

  function auditTable(state, entries) {
    return table('Audit activity', ['Time (ET)', 'Actor', 'Action', 'Target', 'Note'], entries.map(entry => ({
      cells: [format(entry.at, times), entry.actor, entry.action,
        button(entry.target, () => {
          if (entry.listingId) open('Listings', entry.listingId);
          else if (entry.organizerId) open('Organizers', entry.organizerId);
          else open('Applications', entry.applicationId);
        }, 'table-link'), entry.note ?? '—'],
    })), 'No activity yet.');
  }

  function render(state) {
    if (!isCurrent(state)) return;
    if (state !== activeState) {
      activeState = state;
      tab = 'Applications';
      filter = 'pending';
      selected = null;
      query = '';
    }
    const alert = element('p', { role: 'alert', class: 'error' });
    const sidebar = element('nav', { class: 'sidebar', 'aria-label': 'Reviewer navigation' },
      ...tabs.map(name => {
        const item = button(name === 'Applications' ? name + ' (' + state.reviews.list('pending').length + ')' : name,
          () => open(name), 'nav-item');
        if (name === tab) item.setAttribute('aria-current', 'page');
        return item;
      }));
    const pages = { Applications: applications, Organizers: organizers, Listings: listings,
      'Audit Log': current => element('section', {}, element('h1', {}, 'Audit log'), auditTable(current, current.reviews.audit())) };
    show(element('div', { class: 'workspace' },
      element('div', { class: 'workspace-header' },
        element('div', { class: 'brand' }, element('strong', {}, 'Amherst Connect'), ' · BUILD reviewer portal'),
        signOutButton(alert), alert),
      sidebar, element('div', { class: 'work-area' },
        element('p', {}, 'Sample records. Actions on this tab are for preview only.'), pages[tab](state))));
  }

  return render;
}
