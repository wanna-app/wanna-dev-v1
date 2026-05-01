# Deferred / Manual Setup Tasks

> Single source of truth for everything that requires your hands (third-party
> account creation, secret management, dashboard clicks, etc.) before we can
> ship to real users. Claude maintains this file — ask anytime to "check the
> deferred log."

**Legend:** 🔴 blocking · 🟡 needed before launch · 🟢 nice-to-have

---

## 🔴 Blocking — needed to test current build end-to-end

_(Nothing blocking right now.)_

---

## 🟡 Needed before launch

### Google OAuth — configured, pending in-app verification
- **Status:** Verified server-side via `/auth/v1/settings` → `external.google: true`. Client-side handler rewritten to use the proper native flow: `WebBrowser.openAuthSessionAsync` opens the OAuth URL in an in-app browser, then the redirect's query/fragment is parsed for `access_token` + `refresh_token` and handed to `supabase.auth.setSession()`. Deep link uses `expo-linking`'s `createURL("auth-callback")` so it works in both Expo Go and a native build.
- **Wiring also updated:**
  - `app/app.json` — added `scheme: "wanna"` so `wanna://auth-callback` returns to the app, plus `bundleIdentifier: "com.wanna.app"` (iOS) / `package: "com.wanna.app"` (Android) for native OAuth clients
  - Permission strings for camera, photo library, and location added to `infoPlist` so iOS shows real prompts instead of crashing
  - Android permissions array added too
- **Still to verify:** run on a device or simulator, tap "Continue with Google", confirm an `auth.users` + `profiles` row gets created. If you also created native iOS/Android OAuth clients in Google Cloud Console (separate from the Web client), confirm those work too.

### Apple Sign-In — configured, pending in-app verification
- **Status:** Configured server-side (`external.apple: true` confirmed via `/auth/v1/settings`). Client-side button wired in `WelcomeScreen.tsx`.
- **Still to verify:** the full sign-in flow only works when running the app on a real iOS device or simulator with iCloud signed in. Tap **Continue with Apple** and confirm a profile + auth.users row gets created.

### Mixpanel — wired, pending in-app verification
- **Status:** `mixpanel-react-native` installed; project token in `app/.env` as `EXPO_PUBLIC_MIXPANEL_TOKEN`. `src/lib/analytics.ts` forwards every `track()` call to Mixpanel and **suppresses events for seed users** (per AC-SD-06) — the gate flips when AuthProvider loads the profile. `mixpanel.identify(userId)` on auth, `mixpanel.reset()` on sign-out.
- **Still to verify:** run the app, sign in as a real (non-demo) user, do some actions, and confirm events show up in [the Mixpanel project](https://mixpanel.com). Demo logins should NOT produce events.

### Push notifications — fully configured, pending in-app verification
- **Status:** Pipeline is live end-to-end:
  - Migration 00012 — `device_tokens` + `notification_log` tables with RLS
  - `usePushRegistration` hook registers Expo push tokens on auth, unregisters on sign-out
  - `send-push` edge function deployed; triggers wired in Discover/Who's In/Chat
  - **EAS project created:** `@wanna-dev/wanna` (project id `f758a37f-b306-4bb5-9e06-ad6dee438066`), written into `app.json`
  - **APNs `.p8` uploaded to Expo:** Apple Team registered as "Wanna" (Individual) using the Team ID from `.env.local`; push key (Key ID from `.env.local`) linked to that team via the Expo GraphQL API. Verified via account credentials query.
- **Still to verify:** run the app on a real iPhone (simulators can't receive APNs), sign in as a real user, perform a swipe / accept / send-message action targeting a different real user, and confirm the push lands. iOS simulators are permanently push-disabled.

### FCM for Android pushes — partially done
- **What:** Same Expo Push pipeline, but Expo needs an FCM v1 service account JSON to deliver to Android devices.
- **Done:** Firebase project created, Cloud Messaging enabled, service account key generated and downloaded locally (kept outside the repo).
- **Still to do:** upload the JSON via `eas credentials` (Platform: Android → Google Service Account → Set up for Push Notifications → point at the local JSON). Then optionally delete the local copy.
- **Why still deferred:** iOS first. Android push works without this only on Expo Go (which uses Expo's shared FCM project). For production Android builds it's required.

---

## 🟢 Nice-to-have / post-MVP

### GitHub Actions CI — workflow file written but unpushed
- **Status:** `.github/workflows/ci.yml` content is documented in this section. Could not push it because the current `gh` CLI OAuth token lacks the `workflow` scope.
- **What you need to do:**
  1. `gh auth refresh -s workflow`
  2. Re-create the workflow file at `.github/workflows/ci.yml` with the contents below
  3. Commit + push
- **Workflow YAML:**
  ```yaml
  name: CI

  on:
    push:
      branches: [main]
    pull_request:
      branches: [main]

  jobs:
    typecheck:
      name: TypeScript typecheck
      runs-on: ubuntu-latest
      defaults:
        run:
          working-directory: app
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with:
            node-version: "20"
            cache: "npm"
            cache-dependency-path: app/package-lock.json
        - name: Install dependencies
          run: npm ci
        - name: Typecheck
          run: npx tsc --noEmit
  ```

### EAS Build (CI for iOS/Android binaries)
- **What:** Expo Application Services for app store builds. PRD has it as deferred / post-MVP. $99/mo for unlimited.
- **Why deferred:** Local Expo Go works for development; production builds aren't needed until App Store submission.

### Web mod dashboard
- **What:** A separate web admin app for moderation at production scale.
- **Why deferred:** The in-app **Mod tab** (gated by `profiles.is_moderator`) covers all current needs — Reports, Photo flags, and Verifications queues with full action support. A web dashboard is nice-to-have for scale but not blocking.

---

## ✅ Already configured (for reference)

### Infrastructure
- Supabase project: `https://ymztxrpkhenbcbjjfbxr.supabase.co`
- All 10 tables + RLS policies + triggers + `get_feed` RPC + 12 supporting RPCs
- Storage buckets: `profile-photos`, `verification-selfies` (both private, 10MB)
- GitHub repo: `wanna-app/wanna-dev-v1` (`averydella` has push access)
- Database connection: `aws-1-us-east-1.pooler.supabase.com` (port 5432 session, 6543 transaction)

### Auth & data
- Signup trigger fixed (migrations 00007 + 00008): empty `first_name` from the auth-user-created trigger no longer fails the CHECK constraint, and the function has an explicit `search_path` so it works when called as `supabase_auth_admin`. Verified end-to-end via `/auth/v1/signup`.
- Email confirmation toggle is **ON** as of 2026-05-01. Resend SMTP handles delivery; bounces go to Resend's deliverability metrics, not Supabase's shared infra.

### Email — DEPLOYED ✅
- **Custom SMTP:** Supabase Auth SMTP configured via Management API: host `smtp.resend.com`, port 465, user `resend`, sender `noreply@send.joinwannaapp.com` ("Wanna"). Resend domain `send.joinwannaapp.com` is verified. `RESEND_API_KEY` in `.env.local` and as a Supabase function secret. Auth confirmation/reset/magic-link emails go through Resend instead of Supabase's shared mailer (fixes earlier bounce-rate issue). Verified live: direct Resend send returned a Resend message id (delivery time ~10–30s).
- **Transactional templates:** `send-email` edge function exposes three templates: `match` (exactly-once per match), `interest` (1 per recipient/activity/24h), `meetup_check` (1 per recipient/match/7d). All templates use the brand purple, are skipped for `is_seed`, `is_active=false`, and `email_notifications_enabled=false` recipients.
- **Wiring:** Discover swipe-right → interest email; Who's In accept → match email to both parties; meetup-check materialization → reminder email. All fire-and-forget alongside existing pushes; debounce makes duplicate fires harmless.
- **Email opt-out / unsubscribe:** Settings → Privacy → "Activity & match emails" Switch row, scoped to notification emails only (subtitle clarifies that account/security emails always send). Optimistic update writes to `profiles.email_notifications_enabled` and fires `email_notifications_toggled` Mixpanel event. `send-email` footer explains unsubscribe path; `List-Unsubscribe` + `List-Unsubscribe-Post` mailto headers added (CAN-SPAM compliant).

### Moderation + ban system — DEPLOYED ✅
Migrations 00016 + 00017. `profiles.banned_until` and `profiles.ban_reason` columns added. `pg_net` enabled. Service role key stored encrypted in Supabase Vault (never in committed files).
- **`notify-new-report`** edge function emails `hello@joinwannaapp.com` on every report INSERT (with reporter + reported names, dashboard link, 🚨 URGENT prefix for underage reports). Wired via DB trigger on `reports`.
- **`moderate-user`** edge function (admin-only via service-role auth) takes 6 actions: `warning`, `content_removed`, `temp_ban_24h/7d/30d`, `permanent_ban`. Sets ban columns, resolves linked report, sends user-facing email (never reveals reporter).
- **`auto-unban`** runs hourly via pg_cron, reactivates expired temp bans and sends a welcome-back email.
- **In-app `BannedScreen`** intercepts before MainTabs when `is_active=false` — shows reason, expiry (for temp bans), and sign-out.
- **All 5 email templates** (account-warning, content-removal, account-suspension, account-closure, account-reactivated) designed in Resend, embedded as raw HTML in the edge functions with `{{ .Reason }}` / `{{ .BanDuration }}` / `{{ .BannedUntil }}` / `{{ .ContentType }}` / `{{ .LoginURL }}` substitution. Verified live via direct Resend send: HTTP 200, delivery confirmed in user's inbox.
- **In-app Mod tab** (gated by `profiles.is_moderator`, migration 00014): three queue screens — Reports (with reporter/reported/reason/repeat-offender count), Photo flags (with image preview, SafeSearch likelihoods, label list), Verifications (selfie + primary photo side-by-side). 7 mod-gated RPCs all check `is_current_user_moderator()` first. Storage RLS extended so moderators can read the `verification-selfies` bucket; everyone else still write-only. **To use it:** `UPDATE profiles SET is_moderator = true WHERE id = '...';` and a Mod tab appears at the bottom on next launch.

### Photos — DEPLOYED ✅
- Drag-to-reorder photos in Edit Profile (long-press to drag via `react-native-draggable-flatlist`).
- **Photo moderation:** migrations 00010 + 00011 applied. `moderate-photo` edge function deployed at `https://ymztxrpkhenbcbjjfbxr.supabase.co/functions/v1/moderate-photo` with `GOOGLE_VISION_API_KEY` set as a function secret. Verified live: demo user (`is_seed=true`) correctly returns `result: skipped, reason: seed user` — no Vision credits burned on demo traffic.

### Chat & feed
- Viewport-based read receipts (≥300ms in viewport, AC-CH-07).
- Realtime feed auto-refresh (Discover prepends new matching activities, AC-SW-06).
- Offline swipe queue + offline message queue (AsyncStorage + NetInfo, AC-SW-07 / AC-CH-11) with global offline banner.
- Meetup check popup (PRD §5.9) — modal mounted globally, fires on every foreground transition; chat-opened trigger materialized inline from ChatScreen.
- **Link previews — DEPLOYED ✅** `link-preview` edge function deployed at `https://ymztxrpkhenbcbjjfbxr.supabase.co/functions/v1/link-preview`. Verified: returns title + domain for a Wikipedia URL. Chat bubbles and Discover expanded cards now render preview cards for any pasted URL.

### App polish
- Mixpanel SDK wired with seed-user exclusion (events suppressed when `profile.is_seed = true`).
- VAG Rounded Bold font (loaded via `expo-font` in App.tsx, wired into theme).
- Notification deep linking: tap a push → opens Who's In (interest), Chat (match/message). Handles both warm tap and cold-launch tap.

### Privacy & data
- **GDPR data export — DEPLOYED ✅** `export-user-data` edge function deployed at `https://ymztxrpkhenbcbjjfbxr.supabase.co/functions/v1/export-user-data`. Settings tab has a "Download my data" row that fetches the user's full bundle (profile, prefs, activities, swipes, queue entries, matches, messages sent, meetup checks, blocks, reports, photo moderation, device tokens — push tokens redacted), writes it to a temp JSON file, and opens the system share sheet. Verified live with the demo account: returns 17 top-level keys with correct counts.

### Seed data
- Demo account `demo@joinwannaapp.com` / `WannaDemo2026!` with full profile, posted activities, queues, matches, and chat history.
- 15 LA-based seed profiles + 28 seed activities (all flagged `is_seed = true`).
- Cleanup SQL at `supabase/cleanup_seed_data.sql` (run once before launching to real users; also set `SHOW_DEMO_LOGIN=false` in `app/.env`).

### Cron jobs
- Activity expiration crons live (migration 00013): `mark-past-date-activities` daily at 00:05 UTC, `cleanup-past-date-activities` (7-day grace) at 00:10 UTC. `pg_cron` extension enabled. Both jobs scheduled and verified via `cron.job` table.
- Auto-unban hourly cron (migration 00017): runs at the top of every hour, calls `auto-unban` edge function which lifts expired temp bans.

---

## How to update this file

When Claude finishes work and identifies new manual steps, ask:
> "Update the deferred log."

Or, if you've completed something on this list:
> "Mark Google OAuth as done in the deferred log."
