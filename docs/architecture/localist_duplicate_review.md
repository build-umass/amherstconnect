# Localist duplicate review

A new published Localist event that matches an already visible event is held
before the import transaction commits. Matching uses the normalized title,
start time, venue ID, and organizer ID. Student event policies hide held or
suppressed events and their occurrences. Organizer submissions are outside
this hold rule.

An authenticated reviewer with an active R04 reviewer membership can call
`list_held_localist_duplicates` to inspect the pending candidates. Call
`resolve_held_localist_duplicate` with the held event ID and either `release`
for a false positive or `suppress` for a duplicate. The decision records the
reviewer and time. No existing event, occurrence, or bookmark IDs are replaced.

Existing published candidates are left in place. Review those separately
before a beta rollout. There is no automatic consolidation or migration of
bookmarks to a different event.
