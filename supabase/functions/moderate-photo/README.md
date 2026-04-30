# moderate-photo edge function

Scans freshly-uploaded profile photos via Google Cloud Vision SafeSearch.
If LIKELY+ on adult / violence / racy, the photo is removed from the
user's `profile.photos` array immediately and a `photo_moderation` row
is queued for human review (PRD §7.4, AC-PR-04).

## Deploy

```bash
# One-time: install the Supabase CLI
brew install supabase/tap/supabase
supabase login   # paste a token from https://supabase.com/dashboard/account/tokens
supabase link --project-ref ymztxrpkhenbcbjjfbxr

# Set the Vision API key as a function secret (read from .env.local)
supabase secrets set GCP_VISION_API_KEY="$(grep ^GCP_VISION_API_KEY .env.local | cut -d= -f2- | tr -d '\"')"

# Deploy the function
supabase functions deploy moderate-photo
```

(Run from the repo root so `.env.local` is found.)

## Secrets used

- `GCP_VISION_API_KEY` — Google Cloud Vision API key
- `SUPABASE_URL` — auto-injected by Supabase
- `SUPABASE_ANON_KEY` — auto-injected by Supabase

## Behavior

- **Auth required:** request must include a valid `Authorization: Bearer ...`
  header. The function uses the user's JWT for all DB and Storage calls so
  RLS applies to every operation.
- **Path scoped to user:** the path must start with the user's UUID folder
  (matches the bucket's RLS policy).
- **Seed users skipped:** if the calling user has `profiles.is_seed = true`
  the function short-circuits with `result: 'skipped'` and never calls
  Vision. Saves API credits + matches AC-SD-06.
- **Auto-remove on flag:** when `LIKELY` or `VERY_LIKELY` on adult /
  violence / racy, the path is removed from `profile.photos` and a
  `photo_moderation` row is recorded with `result = 'flagged'` for the
  moderation dashboard.

## Test

```bash
# Get a token for the demo user (note: demo is is_seed=true so result will be 'skipped')
TOKEN=$(curl -s -X POST 'https://ymztxrpkhenbcbjjfbxr.supabase.co/auth/v1/token?grant_type=password' \
  -H "apikey: $SUPABASE_ANON_KEY" -H 'Content-Type: application/json' \
  -d '{"email":"demo@joinwannaapp.com","password":"WannaDemo2026!"}' | jq -r .access_token)

curl -s -X POST 'https://ymztxrpkhenbcbjjfbxr.supabase.co/functions/v1/moderate-photo' \
  -H "Authorization: Bearer $TOKEN" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"path":"00000000-0000-0000-0000-000000000001/some-photo.jpg"}' | jq
```

Expect: `{ "result": "skipped", "flagged_categories": [], "reason": "seed user" }`
