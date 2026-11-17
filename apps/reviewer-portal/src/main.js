import { createClient } from '@supabase/supabase-js';
import { isPublicClientKey } from './config.js';
import { createReviewerAccess } from './reviews.js';
import { createWorkspace } from './workspace.js';
import './style.css';

const app = document.querySelector('#app');
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
      if (state.view === 'review') return renderWorkspace(state);
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

  const renderWorkspace = createWorkspace({
    element, button, show, isCurrent: access.isCurrent, signOutButton,
  });

  // Keep Supabase RPC work outside the auth subscription callback.
  client.auth.onAuthStateChange((_event, session) => {
    sessionUserId = session?.user.id ?? null;
    queueMicrotask(() => void access.sessionChanged(sessionUserId));
  });
}
