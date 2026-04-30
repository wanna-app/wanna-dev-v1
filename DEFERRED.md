# Deferred / Manual Setup Tasks

> Single source of truth for everything that requires your hands (third-party
> account creation, secret management, dashboard clicks, etc.) before we can
> ship to real users. Claude maintains this file — ask anytime to "check the
> deferred log."

**Legend:** 🔴 blocking · 🟡 needed before launch · 🟢 nice-to-have

---

## 🔴 Blocking — needed to test current build end-to-end

_(Nothing blocking right now — email confirmation off, signup trigger fixed.)_

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

### Link previews — DEPLOYED ✅
- `link-preview` edge function deployed at `https://ymztxrpkhenbcbjjfbxr.supabase.co/functions/v1/link-preview`. Verified: returns title + domain for a Wikipedia URL. Chat bubbles and Discover expanded cards now render preview cards for any pasted URL.

### Photo moderation — DEPLOYED ✅
- Migrations 00010 + 00011 applied. `moderate-photo` edge function deployed at `https://ymztxrpkhenbcbjjfbxr.supabase.co/functions/v1/moderate-photo` with `GOOGLE_VISION_API_KEY` set as a function secret. Verified live: demo user (`is_seed=true`) correctly returns `result: skipped, reason: seed user` — no Vision credits burned on demo traffic.

### Push notifications — fully configured, pending in-app verification
- **Status:** Pipeline is live end-to-end:
  - Migration 00012 — `device_tokens` + `notification_log` tables with RLS
  - `usePushRegistration` hook registers Expo push tokens on auth, unregisters on sign-out
  - `send-push` edge function deployed; triggers wired in Discover/Who's In/Chat
  - **EAS project created:** `@wanna-dev/wanna` (project id `f758a37f-b306-4bb5-9e06-ad6dee438066`), written into `app.json`
  - **APNs `.p8` uploaded to Expo:** Apple Team registered as "Wanna" (Individual) using the Team ID from `.env.local`; push key (Key ID from `.env.local`) linked to that team via the Expo GraphQL API. Verified via account credentials query.
- **Still to verify:** run the app on a real iPhone (simulators can't receive APNs), sign in as a real user, perform a swipe / accept / send-message action targeting a different real user, and confirm the push lands. iOS simulators are permanently push-disabled.

### FCM for Android pushes
- **What:** Same Expo Push pipeline, but Expo needs an FCM v1 service account JSON to deliver to Android devices.
- **Steps:** Firebase Console → create project → settings → service accounts → generate private key → upload via `eas credentials` for Android.
- **Why deferred:** iOS first; Android push works without this only on Expo Go (which uses Expo's shared FCM project). For production Android builds it's required.

### GDPR data export — DEPLOYED ✅
- `export-user-data` edge function deployed at `https://ymztxrpkhenbcbjjfbxr.supabase.co/functions/v1/export-user-data`. Settings tab has a "Download my data" row that fetches the user's full bundle (profile, prefs, activities, swipes, queue entries, matches, messages sent, meetup checks, blocks, reports, photo moderation, device tokens — push tokens redacted), writes it to a temp JSON file, and opens the system share sheet. No email provider needed. Verified live with the demo account: returns 17 top-level keys with correct counts.

### Email confirmation — re-enable before production
- Once Google OAuth is live and email signup is well-tested, turn email confirmation back on in [Auth → Providers → Email](https://supabase.com/dashboard/project/ymztxrpkhenbcbjjfbxr/auth/providers).

### Custom SMTP provider — recommended before re-enabling confirmations
- **Why:** Supabase's shared mailer emailed us a deliverability warning after my early signup tests bounced. Their fix is to switch to a real SMTP provider so bounces and complaints don't pool against the shared infra.
- **Status of bounces:** I deleted the 3 bogus test users I'd created (`test+*@joinwannaapp.com`, `verify+*@joinwannaapp.com`) and CLAUDE.md now has a "don't test signup against bogus addresses" rule for future sessions. So new bounces should stop. But if you're going to ever turn email confirmation back on for real users, configuring custom SMTP first is the right move.
- **Steps:**
  1. Pick a provider with a free or cheap tier — Resend (3,000/mo free), SendGrid (100/day free), AWS SES (62k/mo free if you're already on AWS), Postmark, Mailgun
  2. Verify a domain you control (probably `joinwannaapp.com` if you own it — otherwise use the provider's sandbox domain)
  3. In [Supabase → Project Settings → Authentication → SMTP Settings](https://supabase.com/dashboard/project/ymztxrpkhenbcbjjfbxr/settings/auth) plug in host/port/username/password/sender email
  4. Send a test email from the dashboard to confirm
- **Why deferred:** Same email provider can also be reused for the GDPR data export edge function (already in this list).

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

### Mod dashboard — IN-APP, ready ✅
- Migration 00014 added `profiles.is_moderator` flag and 7 mod-gated RPCs (`mod_get_pending_reports`, `mod_resolve_report`, `mod_get_pending_photo_flags`, `mod_resolve_photo_flag`, `mod_get_pending_verifications`, `mod_resolve_verification`, `mod_pending_counts`). All check `is_current_user_moderator()` first, raising 42501 otherwise.
- New tab in the app called **Mod** that only renders when `profile.is_moderator = true`. Three queue screens: Reports (with reporter/reported/reason/repeat-offender count), Photo flags (with image preview, SafeSearch likelihoods, label list), Verifications (selfie + primary photo side-by-side).
- Storage RLS extended so moderators can read the `verification-selfies` bucket; everyone else still write-only.
- **To use it:** flip the flag on a real user via SQL — `UPDATE profiles SET is_moderator = true WHERE id = '...';` — and a Mod tab appears at the bottom of the app on next launch.
- A separate web admin app is still nice-to-have for production scale but not blocking.

---

## ✅ Already configured (for reference)

- Supabase project: `https://ymztxrpkhenbcbjjfbxr.supabase.co`
- All 10 tables + RLS policies + triggers + `get_feed` RPC + 12 supporting RPCs
- Storage buckets: `profile-photos`, `verification-selfies` (both private, 10MB)
- GitHub repo: `wanna-app/wanna-dev-v1` (`averydella` has push access)
- Database connection: `aws-1-us-east-1.pooler.supabase.com` (port 5432 session, 6543 transaction)
- Signup trigger fixed (migrations 00007 + 00008): empty `first_name` from the auth-user-created trigger no longer fails the CHECK constraint, and the function has an explicit `search_path` so it works when called as `supabase_auth_admin`. Verified end-to-end via `/auth/v1/signup`.
- Email confirmation toggle is OFF — verified via `/auth/v1/settings` → `mailer_autoconfirm: true`.
- Drag-to-reorder photos in Edit Profile (long-press to drag via `react-native-draggable-flatlist`)
- Viewport-based read receipts (≥300ms in viewport, AC-CH-07)
- Realtime feed auto-refresh (Discover prepends new matching activities, AC-SW-06)
- Offline swipe queue + offline message queue (AsyncStorage + NetInfo, AC-SW-07 / AC-CH-11) with global offline banner
- Meetup check popup (PRD §5.9) — modal mounted globally, fires on every foreground transition; chat-opened trigger materialized inline from ChatScreen
- Mixpanel SDK wired with seed-user exclusion (events suppressed when `profile.is_seed = true`)
- VAG Rounded Bold font (loaded via `expo-font` in App.tsx, wired into theme)
- Demo account `demo@joinwannaapp.com` / `WannaDemo2026!` with full profile, posted activities, queues, matches, and chat history
- 15 LA-based seed profiles + 28 seed activities (all flagged `is_seed = true`)
- Cleanup SQL at `supabase/cleanup_seed_data.sql` (run once before launching to real users; also set `SHOW_DEMO_LOGIN=false` in `app/.env`)
- Activity expiration crons live (migration 00013): `mark-past-date-activities` daily at 00:05 UTC, `cleanup-past-date-activities` (7-day grace) at 00:10 UTC. `pg_cron` extension enabled. Both jobs scheduled and verified via `cron.job` table.
- Notification deep linking: tap a push → opens Who's In (interest), Chat (match/message). Handles both warm tap and cold-launch tap.
- GDPR data export edge function deployed; Settings has "Download my data" row.
- Mod dashboard live in-app (gated by `profiles.is_moderator`); Reports / Photo flags / Verifications queues with full action support.

---

## How to update this file

When Claude finishes work and identifies new manual steps, ask:
> "Update the deferred log."

Or, if you've completed something on this list:
> "Mark Google OAuth as done in the deferred log."
