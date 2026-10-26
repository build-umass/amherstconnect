# Localist Event Fixtures

Sample UMass Localist API responses for testing event imports.

Source: https://events.umass.edu/api/2/events

## Fields

- `id`, `title`: Event ID and name
- `description`, `description_text`: HTML and plain-text descriptions
- `status`: Event status
- `recurring`: Whether an event repeats
- `first_date`, `last_date`: Event date range
- `event_instances`: Start, end, and all-day information
- `location_name`, `geo`: Location information
- `groups`, `filters`: Organizations and categories
- `ticket_url`, `free`: Registration and pricing

Some fields may be null or empty. Each event occurrence references its parent event ID.

## Fixtures

- `normal.json`: Standard event
- `recurring.json`: Recurring event
- `all-day.json`: All-day event
- `cancelled.json`: Canceled event from the UMass Localist API (sanitized)

## Testing

Run `node --test tests/localist.fixtures.test.mjs`.
