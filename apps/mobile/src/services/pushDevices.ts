// Q01: registers this app installation for push notifications while a user
// is signed in. This module has no runtime imports so it can be unit-tested
// in Node; services/notifications.ts binds it to expo-notifications and the
// app's Supabase client.
//
// Each public.push_devices row belongs to the Supabase Auth session that
// registered it. Signing out therefore needs no call from here: Supabase
// deletes the session, and the registration with it, including when the
// session is ended from another device.
import type { NotificationPreferences } from '../types/profile';

export type PushPermission = 'granted' | 'denied' | 'undetermined';

export type PushDeviceOs = 'ios' | 'android';

/** What this installation can do with notifications (expo-notifications in the app). */
export interface PushPlatform {
  /** Null where push notifications are unavailable: simulators, emulators and web. */
  os: PushDeviceOs | null;
  /** Android: creates the notification channel, which must exist before asking on Android 13+. */
  prepare(): Promise<void>;
  getPermission(): Promise<PushPermission>;
  /** Shows the system permission prompt. */
  requestPermission(): Promise<PushPermission>;
  getExpoPushToken(): Promise<string>;
}

interface RpcResult {
  error: { message: string; code?: string } | null;
}

/** The part of the Supabase client that this module uses. */
export interface PushDeviceClient {
  rpc(
    fn: 'register_push_device',
    args: { p_expo_push_token: string; p_platform: PushDeviceOs },
  ): PromiseLike<RpcResult>;
  rpc(fn: 'unregister_push_device'): PromiseLike<RpcResult>;
}

export type PushRegistration =
  | { status: 'registered'; token: string }
  | { status: 'not_permitted'; permission: PushPermission }
  | { status: 'unsupported' };

export class PushDeviceError extends Error {
  readonly code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = 'PushDeviceError';
    this.code = code;
  }
}

/** The AuthContext fields that decide registration. */
export interface PushAuthState {
  status: string;
  user: { id: string } | null;
  profile: { notificationPrefs: NotificationPreferences } | null;
  passwordRecovery: boolean;
}

/**
 * Whether to register this device, for which user, and whether the system
 * permission prompt may be shown. Only users who finished onboarding are
 * registered, never during password recovery. The prompt needs at least one
 * notification preference on: a user who turned both off is not asked, and
 * turning one back on in Settings is when they are asked.
 */
export function pushRegistrationFor(auth: PushAuthState): { userId: string; prompt: boolean } | null {
  if (auth.status !== 'signed_in' || auth.passwordRecovery || !auth.user || !auth.profile) return null;
  const { newEvents, savedReminders } = auth.profile.notificationPrefs;
  return { userId: auth.user.id, prompt: newEvents || savedReminders };
}

function check(result: RpcResult, action: string): void {
  if (result.error) {
    throw new PushDeviceError(`Could not ${action} this device for notifications.`, result.error.code);
  }
}

export function createPushDevices(deps: { client: PushDeviceClient; platform: PushPlatform }) {
  const { client, platform } = deps;
  // Calls run one at a time, so the most recent call decides the final state.
  let previous: Promise<unknown> = Promise.resolve();

  async function syncNow(prompt: boolean, signal?: AbortSignal): Promise<PushRegistration> {
    if (signal?.aborted) throw new Error("Push registration was superseded.");
    const os = platform.os;
    if (!os) return { status: 'unsupported' };

    await platform.prepare();
    let permission = await platform.getPermission();
    if (signal?.aborted) throw new Error("Push registration was superseded.");
    // Ask only once: after a refusal the user changes it in system settings.
    if (permission === 'undetermined' && prompt) {
      permission = await platform.requestPermission();
    }

    if (signal?.aborted) throw new Error("Push registration was superseded.");
    if (!prompt || permission !== 'granted') {
      // Notifications are off for the app, so senders should skip this device.
      check(await client.rpc('unregister_push_device'), 'unregister');
      return { status: 'not_permitted', permission };
    }

    const token = await platform.getExpoPushToken();
    if (signal?.aborted) throw new Error("Push registration was superseded.");
    // Also refreshes last_registered_at when the device is already registered.
    check(await client.rpc('register_push_device', { p_expo_push_token: token, p_platform: os }), 'register');
    return { status: 'registered', token };
  }

  return {
    /**
     * Registers this device for the signed-in user, or removes its
     * registration while notifications are not allowed. Call on every app
     * start and sign-in; `prompt` allows the system permission prompt.
     */
    sync({ prompt, signal }: { prompt: boolean; signal?: AbortSignal }): Promise<PushRegistration> {
      const run = previous.then(() => syncNow(prompt, signal));
      previous = run.catch(() => undefined);
      return run;
    },
  };
}
