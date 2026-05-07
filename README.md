# Wanna

A 1:1 social app that matches people by what they like to do, not what they look like.

Users post activity cards (concerts, hikes, restaurants, tennis) and others swipe on the plans they want to join. When a match is made, both parties get connected and meet up.

---

## Tech stack

- **Mobile:** React Native + Expo SDK 54 (iOS-first, Android supported). New Architecture enabled.
- **Backend:** Supabase — PostgreSQL with RLS, Auth, Storage (private + public buckets), Realtime, Edge Functions (Deno).
- **Push:** APNs (iOS) + FCM v1 (Android), routed through an Edge Function over the Expo Push API.
- **Email:** Transactional + marketing via Resend (SMTP for auth flows, REST API for everything else).
- **Web (small):** static prefs page on Netlify at `notifications.joinwannaapp.com`. The `joinwannaapp.com` apex is parked for now — Universal Links work pending.
- **Domain:** `joinwannaapp.com` (registrar Namecheap, DNS at Namecheap).

## Repo layout

```
/app                    Expo / React Native source
  /src/screens          Top-level navigation targets
  /src/components       Reusable UI
  /src/lib              Non-UI helpers (supabase client, analytics, ics, push)
  /src/hooks            React hooks (auth, push registration, presence, etc.)
  /src/types            Shared TS types — Database row shapes lives here
  app.json              Expo config — bundle id, scheme, plugins, entitlements

/supabase
  /migrations           Sequential, numbered SQL files. Source of truth for
                        the schema. Apply with `supabase db push`.
  /functions            Deno Edge Functions. Deploy with
                        `supabase functions deploy <name>`.
  /functions/_shared    Cross-function modules (e.g. JWT signer)
  cleanup_seed_data.sql One-shot script run before launching to real users
  seed.sql              Demo + seed data

/web
  /notifications        Static page deployed at notifications.joinwannaapp.com
                        (Netlify). Renders the email-prefs UI.
  /open                 Scaffold for the Universal Links landing page —
                        joinwannaapp.com/open. Not yet deployed.
  /.well-known          AASA + assetlinks.json scaffolds (placeholder values)

/docs
  MODERATION_GUIDE.md   Canonical mod-team-facing guide
  SECURITY_REVIEW_*.md  Security review write-ups for major flows

DEFERRED.md             Single source of truth for what's still open vs done
CLAUDE.md               Conventions for AI-assisted edits
```

## Getting started

```bash
# Backend (one-time)
cd supabase
npx supabase link --project-ref ymztxrpkhenbcbjjfbxr
npx supabase db push       # applies any pending migrations to the cloud DB

# Mobile
cd ../app
npm install
npx expo start             # then press `i` for iOS Simulator, `a` for Android
```

You'll need:
- `.env.local` at the repo root with `SUPABASE_ACCESS_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, `EMAIL_PREFS_SECRET`, `RESEND_API_KEY` (ask the team — don't commit).
- `app/.env` with `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_MIXPANEL_TOKEN`.
- For dev work that touches native modules (push, calendar, OAuth on real devices): a custom dev client built via `eas build --profile development`.

Demo login (the simplest way to look around): `demo@joinwannaapp.com` / `WannaDemo2026!`.

## Key concepts

- **RLS everywhere.** Almost all reads/writes go through Supabase's Row Level Security. The mobile app uses the *anon* key + the user's JWT. Privileged operations (push dispatch, moderation, welcome emails) live in Edge Functions that hold the service-role key.
- **`is_seed` is the demo gate.** Demo users have `is_seed = true` on their profile. Most fan-out (push, email, Mixpanel events, Vision API spend) is suppressed for seed users so demo traffic doesn't burn credits.
- **Notification preferences are 5 × 2 + marketing.** Five notification types (interest, match, message, meetup, new_activities) × two channels (push, email) plus a marketing-emails switch. Server-side gating in `send-push` and `send-email` reads the same `profiles.notify_*_email/_push` columns the in-app Settings UI writes.
- **The moderation flow is one tap.** Moderators use the in-app Mod tab. The `mod_resolve_report` RPC does ALL data work in plpgsql (report row, profile state, session revocation, `auth.users.banned_until` lockdown for permanent bans, blocklist) and fires the user-facing email through `moderate-user` over `pg_net`. See `docs/MODERATION_GUIDE.md`.
- **Email-prefs links don't run on Supabase.** The Supabase Edge gateway adds a CSP-sandbox header that prevents browsers from rendering HTML from public functions. The user-facing prefs page is a static HTML file on Netlify; it calls back to a JSON-only Edge function (`email-prefs-api`) for the actual reads/writes.

## Day-to-day workflows

| Task | How |
|------|-----|
| Add a new column to a table | New migration file in `supabase/migrations/`, then `supabase db push`. |
| Deploy an edge function | `supabase functions deploy <name>` (add `--no-verify-jwt` for public endpoints). |
| Tail a function's logs | Supabase Dashboard → Functions → `<name>` → Logs. |
| Run typecheck locally | `cd app && npx tsc --noEmit`. |
| Test the welcome email path | Create a fresh user via auth admin API with `email_confirm: true`; the trigger fires automatically. Don't test against bogus addresses — bounces hurt deliverability. |
| Promote yourself to moderator | `UPDATE profiles SET is_moderator = true WHERE id = '<your uuid>';` and restart the app. |

## What's still open

`DEFERRED.md` is the source of truth. Quick summary:

- **🔴 Blocking:** Universal Links (need Apple Team ID + Android SHA-256 + deploy `web/` to Netlify root).
- **🟡 Pending verification:** Google OAuth, Apple Sign-In, Mixpanel, Push — all configured server-side; need on-device smoke tests.
- **🟢 Nice-to-have:** Native iOS Calendar dev-client rebuild, GitHub Actions CI workflow push, web mod dashboard, BIMI sender avatar.

## Conventions

- **One source of truth per fact.** The DB columns are the single source for prefs / ban state / activity status. UI surfaces project DB state into views; never cache or compute in two places.
- **Migrations are sequential and irreversible.** Don't edit a committed migration; write a new one.
- **Edge functions return JSON for APIs, branded HTML for user-facing pages.** Same response-shape rules apply across `/supabase/functions/*`.
- **Date strings everywhere are ISO 8601 in UTC** unless explicitly local (timezone-gated crons read `profiles.timezone` IANA strings).
- **Don't commit secrets.** `.env.local` is gitignored; secret values live in the Supabase Vault, Supabase function secrets, and EAS secrets.

## Security

The moderation + ban flow has a written security review at `docs/SECURITY_REVIEW_MOD_FLOW.md`. Adopt the same review pattern for any new privileged path.
