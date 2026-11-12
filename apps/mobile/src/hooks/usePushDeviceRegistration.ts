import { useEffect, useReducer } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getPushDevices } from '../services/notifications';
import { pushRegistrationFor } from '../services/pushDevices';
import { getSupabase } from '../services/supabase';

/**
 * Keeps this device's push registration current while a user is signed in:
 * on each app start and sign-in, and when Settings turns a notification
 * preference back on. Sign-out needs nothing here (see services/pushDevices.ts).
 */
export function usePushDeviceRegistration(): void {
  const registration = pushRegistrationFor(useAuth());
  const userId = registration?.userId ?? null;
  const prompt = registration?.prompt ?? false;

  const [sessionRevision, sessionChanged] = useReducer((revision: number) => revision + 1, 0);
  useEffect(() => {
    if (!userId) return;
    let previousAccessToken: string | undefined;
    const { data } = getSupabase().auth.onAuthStateChange((event, session) => {
      if (session?.user.id !== userId) return;
      const changed = session.access_token !== previousAccessToken;
      previousAccessToken = session.access_token;
      // SIGNED_IN may be emitted again for an existing session on app focus.
      if (event === 'SIGNED_IN' && changed) sessionChanged();
    });
    return () => data.subscription.unsubscribe();
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    // Notifications are optional: a failure here never blocks the app.
    Promise.resolve()
      .then(() => getPushDevices().sync({ prompt, signal: controller.signal }))
      .catch((error) => {
        if (controller.signal.aborted) return;
        console.warn('[notifications] Could not register this device for push notifications:', error);
      });
    return () => controller.abort();
  }, [userId, prompt, sessionRevision]);
}
