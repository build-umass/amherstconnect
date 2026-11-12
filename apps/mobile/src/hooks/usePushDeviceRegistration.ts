import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getPushDevices } from '../services/notifications';
import { pushRegistrationFor } from '../services/pushDevices';
import { getSupabase } from '../services/supabase';

export function usePushDeviceRegistration(): void {
  const registration = pushRegistrationFor(useAuth());
  const [session, setSession] = useState<{ userId: string; token: string; active: boolean } | null>(null);

  useEffect(() => {
    try {
      const { data } = getSupabase().auth.onAuthStateChange((_event, current) => {
        setSession(previous => {
          // Use the captured token for detachment after local sign-out.
          // The next signed-in account can also detach with the persisted proof.
          if (!current) return previous?.active ? { ...previous, active: false } : previous;
          if (previous?.active && previous.token === current.access_token) return previous;
          return { userId: current.user.id, token: current.access_token, active: true };
        });
      });
      return () => data.subscription.unsubscribe();
    } catch {
      // The app can start without Supabase configured.
    }
  }, []);

  const prompt = !!session?.active && registration?.userId === session.userId && registration.prompt;
  useEffect(() => {
    if (!session) return;
    const controller = new AbortController();
    let delay = 1_000;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const sync = () => {
      void getPushDevices().sync({ prompt, accessToken: session.token, signal: controller.signal })
        .catch(() => {
          if (controller.signal.aborted) return;
          timer = setTimeout(sync, delay);
          delay = Math.min(delay * 2, 30_000);
        });
    };
    sync();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [session, prompt]);
}
