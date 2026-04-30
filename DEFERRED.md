# Deferred / Manual Setup Tasks

> Single source of truth for everything that requires your hands (third-party
> account creation, secret management, dashboard clicks, etc.) before we can
> ship to real users. Claude maintains this file — ask anytime to "check the
> deferred log."

**Legend:** 🔴 blocking · 🟡 needed before launch · 🟢 nice-to-have

---

## 🔴 Blocking — needed to test current build end-to-end

### Email confirmation (optional dev tweak)
- **What:** Disable "Confirm email" requirement in Supabase Auth so signup → onboarding flow can be tested without checking inbox.
- **Where:** [Auth → Sign In / Up → Email](https://supabase.com/dashboard/project/ymztxrpkhenbcbjjfbxr/auth/providers) → toggle "Confirm email" off.
- **Why deferred:** Personal preference; not required for production. Re-enable before launch.

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

### Apple Sign-In
- **What:** Set up Sign In with Apple (required for iOS App Store submission).
- **Cost:** $99/yr Apple Developer account.
- **Steps:**
  1. [Apple Developer → Identifiers](https://developer.apple.com/account/resources/identifiers/list) — register App ID with Sign In with Apple capability
  2. Register a Service ID
  3. Configure Service ID redirect: `https://ymztxrpkhenbcbjjfbxr.supabase.co/auth/v1/callback`
  4. Create a Sign In with Apple key (.p8)
  5. In [Supabase Auth → Providers → Apple](https://supabase.com/dashboard/project/ymztxrpkhenbcbjjfbxr/auth/providers): paste Service ID, Team ID, Key ID, .p8 contents
- **Why deferred:** Requires paid Apple Developer account (you only).

### Google Cloud Vision SafeSearch (photo moderation)
- **What:** API key for automated photo moderation on profile photo uploads.
- **Cost:** Free for first 1,000 images/month, then $1.50 per 1,000.
- **Steps:**
  1. [Google Cloud Console → APIs](https://console.cloud.google.com/apis/library/vision.googleapis.com) — enable Cloud Vision API
  2. Create API key (or service account JSON)
  3. Store as Supabase Edge Function secret: `GCP_VISION_API_KEY`
- **Why deferred:** Will wire up when we build the `moderate-photo` edge function.

### Push notifications (APNs + FCM)
- **What:** Send push notifications for interest alerts, matches, messages.
- **Steps:**
  - **APNs (iOS):** Apple Developer → create Auth Key (.p8) for APNs → add to Expo EAS or Supabase
  - **FCM (Android):** Firebase Console → create project → download `google-services.json` → upload Server Key to Supabase
- **Why deferred:** Will wire up when we build the chat / interest notification edge functions.

### Offline swipe queue (AC-SW-07)
- **What:** Cache last 20 cards locally, queue swipes when offline, sync on reconnect (FIFO), show offline banner.
- **Why deferred:** Needs `@react-native-async-storage/async-storage` + a connectivity listener. Current build assumes online; works fine for development. Wire up before App Store submission for resilience.

### Realtime feed auto-refresh (AC-SW-06)
- **What:** Subscribe to `activities` Realtime channel and auto-prepend new matching cards to the deck.
- **Why deferred:** Pull-to-refresh handles it for now. Adds complexity; revisit during Realtime polish phase.

### Link previews in cards and chat (AC-SW-08, AC-CH-05)
- **What:** Detect URLs in description / message body, fetch metadata (Open Graph), render thumbnail + title + domain.
- **Why deferred:** Needs an edge function or third-party metadata API (e.g., LinkPreview.net, Microlink). Will tackle alongside chat link previews so the same fetcher is used.

### Offline message queue (AC-CH-11)
- **What:** Queue messages locally when offline, send in order on reconnect.
- **Why deferred:** Chat works online today. Add when wiring AsyncStorage for the offline swipe queue too — same primitives.

### Viewport-based read receipts (AC-CH-07)
- **What:** Currently we mark all-read on chat open. PRD specifies messages mark read when visible in viewport for ≥300ms.
- **Why deferred:** Needs FlatList `onViewableItemsChanged` + per-message debounce. Current behaviour is good enough for v1 but worth tightening before launch.

### Drag-to-reorder photos in Edit Profile
- **What:** Currently users tap up/down arrow buttons or a star icon to set primary. PRD calls for drag-to-reorder.
- **Why deferred:** Requires `react-native-draggable-flatlist` or similar. Functional with current UX; polish before launch.

### GDPR data export (AC-PR-11)
- **What:** "Download my data" button in Settings → Edge Function gathers all user data into a zip and emails a download link.
- **Why deferred:** Needs an edge function + email delivery (e.g., Resend or Supabase email). Required for EU launch but not for early dev.

### Meetup check popup (Section 5.9)
- **What:** In-app modal "Did you meet up with [Name] for [Activity]?" with Yes/Not yet/dismiss. Triggered the day after `activity_date`, OR 72h after match for evergreen, OR when chat opened. Never push.
- **Why deferred:** Needs an app-level lifecycle listener that runs on every foreground transition, plus a small queue of triggered checks per user. Will tackle alongside the Profile tab.
- **Schema:** `meetup_checks` table is already created.

### ~~Demo user + seed data~~ ✅ DONE
Demo + seed data live: 16 profiles, 31 activities, 15 interest queue
entries, 2 matches, 6 messages. Demo login verified end-to-end.

### Analytics (Mixpanel or Amplitude)
- **What:** Wire up analytics SDK to track every event the PRD specifies (signup_completed, swipe_like, match_modal_shown, etc.)
- **Steps:**
  1. Pick provider (PRD suggests Mixpanel or Amplitude — both have free tiers)
  2. Create project, get write key
  3. Install SDK in app, initialize, fire events
  4. Configure analytics dashboard to **exclude `is_seed = true` users** (per AC-SD-06)
- **Why deferred:** Will wire up after core features ship and we know which events matter.

### Email confirmation re-enabled
- Once Google + Apple OAuth are live and email signup is well-tested, turn email confirmation back on.

---

## 🟢 Nice-to-have / post-MVP

### EAS Build (CI for iOS/Android binaries)
- **What:** Expo Application Services for app store builds. PRD has it as deferred / post-MVP. $99/mo for unlimited.
- **Why deferred:** Local Expo Go works for development; production builds aren't needed until App Store submission.

### GitHub Actions CI
- PRD lists this as post-MVP. Add when we want automated tests / type checks on PRs.

### Mod dashboard (admin)
- The PRD describes a moderation queue dashboard for handling reports, photo flags, and verification reviews. We'll need to build this (or use Supabase Studio + custom queries) before launch.

---

## ✅ Already configured (for reference)

- Supabase project: `https://ymztxrpkhenbcbjjfbxr.supabase.co`
- All 10 tables + RLS policies + triggers + `get_feed` RPC
- Storage buckets: `profile-photos`, `verification-selfies` (both private, 10MB)
- GitHub repo: `wanna-app/wanna-dev-v1` (`averydella` has push access)
- Database connection: `aws-1-us-east-1.pooler.supabase.com` (port 5432 session, 6543 transaction)
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
