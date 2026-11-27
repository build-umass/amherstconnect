const TIME_ZONE = 'America/New_York';

function dateParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value);

  return Date.UTC(get('year'), get('month') - 1, get('day'));
}

export function formatDateTime(value: string | Date): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';

  return new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

export function formatDealExpiry(
  value: string,
  now: Date = new Date(),
): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Expiration date unavailable';

  const days = Math.round(
    (dateParts(date) - dateParts(now)) / 86400000,
  );

  const label =
    days === 0 ? 'Ends today' :
    days === 1 ? 'Ends tomorrow' : 'Ends';

  return days === 0 || days === 1
    ? `${label} · ${formatDateTime(date)}`
    : `Ends ${formatDateTime(date)}`;
}
