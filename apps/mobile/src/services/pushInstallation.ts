import type { PushDeviceOs } from './pushDevices';

export type PushInstallationUpdate = {
  p_proof: string;
  p_revision: number;
  p_token: string | null;
  p_platform: PushDeviceOs | null;
};

const STORAGE_KEY = 'push-installation-v1';

export function createPushInstallation(deps: {
  storage: { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> };
  newProof(): string;
  write(update: PushInstallationUpdate, accessToken: string | null, signal?: AbortSignal): Promise<void>;
}) {
  return async function update(
    token: string | null,
    platform: PushDeviceOs | null,
    accessToken: string | null,
    signal?: AbortSignal,
  ): Promise<void> {
    const saved = await deps.storage.getItem(STORAGE_KEY);
    if (!saved && !token) return;
    const state: { proof: string; revision: number; initialized?: boolean } = saved ? JSON.parse(saved) : { proof: deps.newProof(), revision: 0 };
    if (!/^[0-9a-f]{64}$/.test(state.proof) || !Number.isSafeInteger(state.revision) || state.revision < 0) {
      throw new Error('Invalid push installation state');
    }
    async function send(token: string | null, platform: PushDeviceOs | null) {
      if (signal?.aborted) return;
      state.revision++;
      // Reserve before sending, including across restarts and lost responses.
      await deps.storage.setItem(STORAGE_KEY, JSON.stringify(state));
      if (signal?.aborted) return;
      await deps.write({
        p_proof: state.proof, p_revision: state.revision, p_token: token, p_platform: platform,
      }, accessToken, signal);
    }
    if (token && !state.initialized) {
      // Establish server state before the first registration. A signed-out
      // cleanup can then fence that registration even if it is still in flight.
      await send(null, null);
      if (signal?.aborted) return;
      state.initialized = true;
    }
    await send(token, platform);
  };
}
