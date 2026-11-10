# Q01: Notification preferences and push devices

Q01 stores what each user wants to receive and where it can be delivered. Q02
(AC-29) builds the notification records and the workers that send through Expo
Push on top of this.

## Where the data lives

| Data | Location | Written by |
|---|---|---|
| Preferences | `profiles.notify_new_events`, `profiles.notify_saved_reminders` (A07) | Settings, through the profile repository |
| Devices | `public.push_devices`, one row per signed-in app installation that may show notifications | `register_push_device` and `unregister_push_device` |

There is no separate preferences table. A row in `push_devices` holds the Expo
push token, the platform (`ios` or `android`), the profile, the Supabase Auth
session that registered it, and `last_registered_at`.

## Device lifecycle

| Event | Result |
|---|---|
| App starts or a user signs in after onboarding | `register_push_device` inserts the row for this session or refreshes `last_registered_at` |
| Notification permission not asked yet | The app asks only while at least one preference is on. Otherwise it asks when Settings turns one on |
| Permission denied, or turned off in system settings | `unregister_push_device` on the next app start |
| Same user on another phone or tablet | Another row: one per session |
| Another account signs in on the device | The token moves to that session. The most recent sign-in receives |
| Sign-out on this device, everywhere, or on other devices | Supabase Auth deletes the session, and the foreign key deletes the row. The app makes no call |
| Session expiry (Pro session limits) | Supabase cleans up expired sessions within about 24 hours, deleting the row |
| Account deletion | Rows are deleted with the session and the profile |
| App uninstalled or its data cleared | Expo reports `DeviceNotRegistered`, and the sender removes the token (below) |
| Emulator, simulator or web | Nothing is registered |

Binding rows to Auth sessions means a device stops receiving an account's
notifications when that session ends, even if the app never runs cleanup code,
for example after a global sign-out from another device. An access token whose
session has ended stays valid until it expires, but it can no longer register
because the session row is gone.

## Access

Clients have no privileges on `push_devices`. They call two `security definer`
functions that take the user and session from the verified access token, so a
client cannot register a device for another profile or session.
`remove_unregistered_push_tokens` and direct table access are for
`service_role` only.

Anyone who knows a device's Expo token can register it to their own account,
which stops it receiving the previous account's notifications. Without Expo's
enhanced push security, the same token already lets anyone send that device
notifications through Expo. Keep tokens out of logs and error reports.

## Contract for the Q02 sender

Senders use the service role. Recipients are the devices of profiles that have
the matching preference on:

```sql
select d.profile_id, d.expo_push_token
from public.push_devices d
join public.profiles p on p.id = d.profile_id
where d.profile_id = any($1)
  and p.notify_saved_reminders;  -- or notify_new_events
```

Record when each batch was sent. When a push ticket or receipt reports
`DeviceNotRegistered`, call
`public.remove_unregistered_push_tokens(tokens, sent_at)`. It keeps any device
that registered again after `sent_at`. Expo recommends checking receipts about
15 minutes after sending.

`last_registered_at` shows when the app last started signed in on that device.
Do not drop devices only because the app has not been opened recently: those
users are still signed in and expect reminders.

## Known gaps

- **Offline sign-out.** supabase-js clears the local session even when the
  logout request fails. The server session then survives, and so does the
  registration. The device keeps receiving until another account signs in on
  it, or Expo reports the token unregistered.
- **Android delivery prerequisites.** The development APK built from `85c3c9e`
  includes expo-notifications but no google-services (FCM) values. On a physical
  Android phone `getExpoPushTokenAsync` fails and the app logs a warning. A new
  development build needs `android.googleServicesFile`, and EAS needs FCM V1
  credentials. iOS devices need APNs credentials.
- **Emulators and simulators** cannot receive push notifications, so the app
  skips registration there. Use the local integration test instead.

## Tests

- `supabase/tests/database/push_devices.test.sql`: privileges, registration,
  account switches, validation, sign-out cascade and stale-token removal.
- `apps/mobile/tests/pushDevices.test.mjs`: permission and registration logic.
- `npm run test:push-devices:local`: real Supabase Auth sessions against the
  local stack. `npm run supabase:verify` runs it in CI.
