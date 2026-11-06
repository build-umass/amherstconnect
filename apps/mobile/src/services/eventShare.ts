// Builds the text for the Share button on Event Details and runs the share
// flow. The platform calls (share sheet, clipboard) are passed in so this file
// stays plain TypeScript and can be tested with node --test.

/** The event fields Share needs. `url` is the official event link, when there is one. */
export interface ShareableEvent {
  title: string;
  date?: string | null;
  time?: string | null;
  location?: string | null;
  url?: string | null;
}

export interface SharePayload {
  title: string;
  message: string;
}

/** Same shape React Native's Share.share resolves with. */
export interface ShareSheetResult {
  action: string;
}

export interface ShareDeps {
  share: (payload: SharePayload) => Promise<ShareSheetResult>;
  copy: (text: string) => Promise<unknown>;
}

export type ShareOutcome = 'shared' | 'dismissed' | 'copied' | 'failed';

function clean(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Only share http(s) links so a bad value never ends up in someone's message. */
export function safeShareUrl(value: string | null | undefined): string | null {
  const url = clean(value);
  return /^https?:\/\/\S+$/i.test(url) ? url : null;
}

export function buildShareMessage(event: ShareableEvent): string {
  const title = clean(event.title) || 'Event';
  const when = [clean(event.date), clean(event.time)].filter(Boolean).join(' · ');
  const where = clean(event.location);
  const url = safeShareUrl(event.url);

  return [
    title,
    when && `📅 ${when}`,
    where && `📍 ${where}`,
    url,
    'Shared from Amherst Connect',
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildSharePayload(event: ShareableEvent): SharePayload {
  return {
    title: clean(event.title) || 'Event',
    // The link goes inside the message because Android ignores Share's separate `url` field.
    message: buildShareMessage(event),
  };
}

/**
 * Opens the share sheet. If it isn't available (for example a desktop browser
 * on the web build), copies the text to the clipboard instead.
 */
export async function shareEvent(event: ShareableEvent, deps: ShareDeps): Promise<ShareOutcome> {
  const payload = buildSharePayload(event);
  try {
    const result = await deps.share(payload);
    return result?.action === 'dismissedAction' ? 'dismissed' : 'shared';
  } catch {
    try {
      await deps.copy(payload.message);
      return 'copied';
    } catch {
      return 'failed';
    }
  }
}
