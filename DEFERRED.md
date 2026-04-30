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

### Google OAuth
- **What:** Set up Google OAuth credentials so "Continue with Google" works.
- **Steps:**
  1. [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials) — create OAuth client (Web application)
  2. Authorized redirect URI: `https://ymztxrpkhenbcbjjfbxr.supabase.co/auth/v1/callback`
  3. Save Client ID + Secret
  4. Paste into [Supabase Auth → Providers → Google](https://supabase.com/dashboard/project/ymztxrpkhenbcbjjfbxr/auth/providers)
  5. For native iOS/Android, also create iOS and Android OAuth clients in Google Cloud Console
- **Why deferred:** Requires Google Cloud account access (you only).

### Apple Sign-In — configured, pending in-app verification
- **Status:** Configured server-side (`external.apple: true` confirmed via `/auth/v1/settings`). Client-side button wired in `WelcomeScreen.tsx`.
- **Still to verify:** the full sign-in flow only works when running the app on a real iOS device or simulator with iCloud signed in. Tap **Continue with Apple** and confirm a profile + auth.users row gets created.

### Mixpanel — wired, pending in-app verification
- **Status:** `mixpanel-react-native` installed; project token in `app/.env` as `EXPO_PUBLIC_MIXPANEL_TOKEN`. `src/lib/analytics.ts` forwards every `track()` call to Mixpanel and **suppresses events for seed users** (per AC-SD-06) — the gate flips when AuthProvider loads the profile. `mixpanel.identify(userId)` on auth, `mixpanel.reset()` on sign-out.
- **Still to verify:** run the app, sign in as a real (non-demo) user, do some actions, and confirm events show up in [the Mixpanel project](https://mixpanel.com). Demo logins should NOT produce events.

### Link previews — code shipped, edge function needs deploy
- **Status:** Edge function written at `supabase/functions/link-preview/index.ts` (Deno; OG/Twitter card meta + `<title>` parsing, 200KB read cap, 5s timeout). Client-side `<LinkPreview>` component wired into chat bubbles (compact variant) and Discover expanded cards (full variant) with in-memory caching.
- **What you need to do:** deploy the function once. From the repo root:
  ```bash
  brew install supabase/tap/supabase   # if not installed
  supabase login                        # paste a token from https://supabase.com/dashboard/account/tokens
  supabase link --project-ref ymztxrpkhenbcbjjfbxr
  supabase functions deploy link-preview --no-verify-jwt
  ```
- **Until deployed:** chat shows the raw URL as a tappable underlined link, Discover cards just show the description text. No errors surfaced to the user.

### Photo moderation — code shipped, edge function needs deploy
- **Status:** Migration 00010 + 00011 added `photo_moderation` table (incl. `flagged_labels`) + RLS + `get_pending_photo_flags` RPC (applied to live DB). Edge function `supabase/functions/moderate-photo/index.ts` calls **Vision SafeSearch** (flagging `LIKELY`+ on `adult`, `violence`, `racy`, `spoof`) AND **LABEL_DETECTION** (flagging labels matching keyword lists for **nudity, hate speech, hate symbols, drugs, weapons**). Seed-user guard at both client + server. API key in `.env.local` as `GOOGLE_VISION_API_KEY`. Verified the combined-request shape works against the live Vision API.
- **What you need to do:** deploy the function and set the secret. From the repo root:
  ```bash
  brew install supabase/tap/supabase   # if not installed
  supabase login                        # paste a token from https://supabase.com/dashboard/account/tokens
  supabase link --project-ref ymztxrpkhenbcbjjfbxr
  supabase secrets set GOOGLE_VISION_API_KEY="$(grep ^GOOGLE_VISION_API_KEY .env.local | cut -d= -f2- | tr -d '\"')"
  supabase functions deploy moderate-photo
  ```
- **Until deployed:** photo uploads work normally; the client invocation just warns in the console and the photos aren't auto-screened.

### Push notifications (APNs + FCM)
- **What:** Send push notifications for interest alerts, matches, messages.
- **Steps:**
  - **APNs (iOS):** Apple Developer → create Auth Key (.p8) for APNs → add to Expo EAS or Supabase
  - **FCM (Android):** Firebase Console → create project → download `google-services.json` → upload Server Key to Supabase
- **Why deferred:** Will wire up when we build the chat / interest notification edge functions.

### GDPR data export (AC-PR-11)
- **What:** "Download my data" button in Settings → Edge Function gathers all user data into a zip and emails a download link.
- **Why deferred:** Needs an edge function + email delivery (e.g., Resend or Supabase email). Required for EU launch but not for early dev.

### Email confirmation — re-enable before production
- Once Google OAuth is live and email signup is well-tested, turn email confirmation back on in [Auth → Providers → Email](https://supabase.com/dashboard/project/ymztxrpkhenbcbjjfbxr/auth/providers).

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

### Mod dashboard (admin)
- The PRD describes a moderation queue dashboard for handling reports, photo flags, and verification reviews. We'll need to build this (or use Supabase Studio + custom queries) before launch.

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

---

## How to update this file

When Claude finishes work and identifies new manual steps, ask:
> "Update the deferred log."

Or, if you've completed something on this list:
> "Mark Google OAuth as done in the deferred log."
