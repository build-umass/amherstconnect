import { createClient } from '@supabase/supabase-js';
import { isPublicClientKey } from './config.js';
import { createReviewerAccess } from './reviews.js';
import './style.css';

const app = document.querySelector('#app');
const dateFormat = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium', timeZone: 'America/New_York',
});
const statusLabel = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' };
let sessionUserId = null;

function element(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  node.append(...children);
  return node;
}

function button(label, action, className = '') {
  const node = element('button', { type: 'button', class: className }, label);
  node.addEventListener('click', action);
  return node;
}

function show(...children) {
  app.removeAttribute('aria-busy');
  app.replaceChildren(...children);
}

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !isPublicClientKey(key)) {
  show(element('h1', {}, 'Portal configuration required'),
    element('p', {}, 'Set the Supabase URL and public client key to enable reviewer sign-in.'));
} else {
  try {
    start(createClient(url, key, { auth: { detectSessionInUrl: false } }));
  } catch {
    show(element('h1', {}, 'Portal configuration invalid'),
      element('p', {}, 'Check the Supabase URL and public client key.'));
  }
}

function start(client) {
  const access = createReviewerAccess({
    async checkReviewer() {
      const { data, error } = await client.rpc('is_content_reviewer');
      if (error) throw error;
      return data;
    },
    render(state) {
      if (state.view === 'sign-in') return renderSignIn();
      if (state.view === 'review') return renderQueue(state);
      if (state.view === 'loading') {
        show(element('p', { role: 'status' }, 'Checking reviewer access…'));
        app.setAttribute('aria-busy', 'true');
        return;
      }
      const denied = state.view === 'denied';
      const alert = element('p', { role: 'alert', class: 'error' });
      show(element('h1', {}, denied ? 'Reviewer access required' : 'Could not check reviewer access'),
        element('p', {}, denied ? 'Sign in with an authorized BUILD reviewer account.' : 'Check your connection and try again.'),
        ...(!denied ? [button('Try again', () => void access.sessionChanged(sessionUserId))] : []),
        signOutButton(alert), alert);
    },
  });

  function signOutButton(alert) {
    return button('Sign out', async () => {
      try {
        const { error } = await client.auth.signOut({ scope: 'local' });
        if (error) throw error;
      } catch {
        alert.textContent = 'Sign-out could not be confirmed. Try again.';
      }
    }, 'secondary');
  }

  function renderSignIn() {
    const form = element('form');
    const email = element('input', { id: 'email', type: 'email', autocomplete: 'username', required: '' });
    const password = element('input', { id: 'password', type: 'password', autocomplete: 'current-password', required: '' });
    const submit = element('button', { type: 'submit' }, 'Sign in');
    const alert = element('p', { role: 'alert', class: 'error' });
    form.append(element('label', { for: 'email' }, 'Email'), email,
      element('label', { for: 'password' }, 'Password'), password, submit, alert);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      submit.disabled = true;
      alert.textContent = '';
      try {
        const { error } = await client.auth.signInWithPassword({ email: email.value.trim(), password: password.value });
        if (error) throw error;
      } catch {
        alert.textContent = 'Could not sign in. Check your credentials and connection.';
      } finally {
        password.value = '';
        submit.disabled = false;
      }
    });
    show(element('section', { class: 'panel sign-in' }, element('h1', {}, 'Reviewer sign-in'), form));
  }

  function heading(title) {
    const alert = element('p', { role: 'alert', class: 'error' });
    return element('div', {}, element('div', { class: 'title-row' },
      element('h1', {}, title), signOutButton(alert)),
    element('p', { class: 'demo' }, 'Demo data · Review decisions reset when the page reloads.'), alert);
  }

  function renderQueue(state) {
    if (!access.isCurrent(state)) return;
    const queue = element('ul', { class: 'queue', 'aria-label': 'Applications' });
    for (const record of state.reviews.list()) {
      queue.append(element('li', { class: 'panel' }, element('div', { class: 'title-row' },
        button(record.organizationName, () => renderDetail(state, record.id), 'link'),
        element('span', { class: 'status' }, statusLabel[record.status])),
      element('p', { class: 'muted' }, record.kind + ' · ' + dateFormat.format(new Date(record.submittedAt)))));
    }
    show(heading('Application queue'), queue);
  }

  function renderDetail(state, id, message = '') {
    if (!access.isCurrent(state)) return;
    const record = state.reviews.get(id);
    if (!record) return renderQueue(state);
    const facts = element('dl');
    const fields = {
      Status: statusLabel[record.status], Type: record.kind,
      Contact: record.contactName + ' · ' + record.contactRole, Email: record.email,
      Affiliation: record.affiliationUrl, Address: record.address ?? 'Not provided',
      About: record.about, 'Posting plans': record.postingPlans, Frequency: record.frequency,
      'Accepted terms': record.acceptedTerms ? 'Yes' : 'No',
    };
    if (record.rejectionReason) fields['Rejection reason'] = record.rejectionReason;
    for (const [label, value] of Object.entries(fields)) {
      facts.append(element('dt', {}, label), element('dd', {}, value));
    }
    show(button('Back to queue', () => renderQueue(state), 'link'), heading(record.organizationName),
      element('p', { role: 'status' }, message), element('section', { class: 'panel' }, facts));
    if (record.status !== 'pending') return;

    const reason = element('textarea', { id: 'reason', rows: '3' });
    const alert = element('p', { role: 'alert', class: 'error' });
    const decide = decision => {
      if (!access.isCurrent(state)) return;
      try {
        state.reviews.decide(id, decision, reason.value);
        renderDetail(state, id, 'Application ' + decision + ' in this demo.');
      } catch (error) {
        alert.textContent = error.message;
        reason.focus();
      }
    };
    app.append(element('section', { class: 'panel decision' },
      element('h2', {}, 'Review application'),
      element('label', { for: 'reason' }, 'Rejection reason'), reason, alert,
      element('div', { class: 'actions' },
        button('Approve', () => decide('approved')),
        button('Reject', () => decide('rejected'), 'secondary'))));
  }

  // Keep Supabase RPC work outside the auth subscription callback.
  client.auth.onAuthStateChange((_event, session) => {
    sessionUserId = session?.user.id ?? null;
    queueMicrotask(() => void access.sessionChanged(sessionUserId));
  });
}
