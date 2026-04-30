# send-push edge function

Sends push notifications via Expo's Push API for the three PRD-defined
events:

| Event    | Sender                | Recipient(s)        | Title shown                            |
|----------|----------------------|---------------------|----------------------------------------|
| interest | swiper (Discover)    | activity owner       | `[Name] is in for "[Activity]"!`       |
| match    | poster (Who's In)    | both parties        | `It's a match with [Name]!`            |
| message  | message sender       | other match party   | `[Sender]` (body as preview)           |

## Authorization

The function takes the caller's user JWT and verifies they have the
right to send each notification:

- **interest:** caller must have a `swipes` row with `direction='like'`
  for the activity
- **match:** caller must be one of the two parties in the match
- **message:** caller must be the message's `sender_id`, and the
  recipient must be the other match participant

## Skips and dedup

- **Seed users skipped** (PRD AC-SD-06): if the recipient's
  `profiles.is_seed` is true, no push, logged with reason `seed user`.
- **Inactive users skipped:** profile `is_active = false` → reason
  `inactive`.
- **Interest debounce:** AC-SW-09 requires max 1 interest alert per
  activity per 15 minutes. Enforced via `notification_log` lookup.
- **No tokens:** if the recipient has no `device_tokens` rows,
  logged with reason `no tokens`.

Every outcome (sent / skipped / failed) is recorded in
`notification_log` for observability.

## Deploy

```bash
# From the repo root
supabase login   # if not already
supabase link --project-ref ymztxrpkhenbcbjjfbxr
supabase functions deploy send-push
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`
are auto-injected by Supabase. No secrets needed beyond what's
already there.

## Why Expo Push and not direct APNs/FCM

The PRD originally specified APNs + FCM directly via Supabase Edge
Functions, but the team chose Expo Push (which wraps both behind one
HTTP API). This edge function POSTs to
`https://exp.host/--/api/v2/push/send`. To make the iOS half work,
the project's APNs `.p8` key needs to be uploaded to Expo via
`eas credentials` — see `DEFERRED.md` for the manual step.

## Test

After deploy, exercise from a real signed-in user:

```bash
TOKEN=...     # valid user JWT
ANON=$(grep EXPO_PUBLIC_SUPABASE_ANON_KEY app/.env | cut -d= -f2-)

curl -s -X POST 'https://ymztxrpkhenbcbjjfbxr.supabase.co/functions/v1/send-push' \
  -H "Authorization: Bearer $TOKEN" \
  -H "apikey: $ANON" \
  -H 'Content-Type: application/json' \
  -d '{
    "type": "message",
    "message_id": "...",
    "match_id": "...",
    "recipient_id": "...",
    "sender_id": "...",
    "sender_name": "Test",
    "body_preview": "Hello!"
  }' | jq
```
