# Deferred / Manual Setup Tasks

> Single source of truth for everything that requires your hands (third-party
> account creation, secret management, dashboard clicks, etc.) before we can
> ship to real users. Claude maintains this file — ask anytime to "check the
> deferred log."

**Legend:** 🔴 blocking · 🟡 needed before launch · 🟢 nice-to-have

---

## 🔴 Blocking — needed to test current build end-to-end

### Email preferences hosted page renders as raw source — Supabase gateway CSP blocker 🔴
- **What:** Email links pointing at `…/functions/v1/email-prefs?token=…` return correct HTML but the Supabase Edge gateway adds `Content-Security-Policy: default-src 'none'; sandbox` AND rewrites `Content-Type` to `text/plain` on every public (`--no-verify-jwt`) function response. Browsers therefore render the page as raw source code. Confirmed via curl 2026-05-06: both headers come from `sb-gateway-version: 1`, not our function — we cannot override them from inside the function.
- **Impact:** Until fixed, every Manage Preferences / Unsubscribe link in real welcome emails will look broken. The token verification + DB writes still work correctly server-side; only the rendered page is the issue.
- **Plan: host on Cloudflare Pages at `prefs.joinwannaapp.com`** (`joinwannaapp.com` is registered with Namecheap; we keep Namecheap as registrar and either point its DNS at Cloudflare or do a full nameserver migration to Cloudflare for cleaner control). Steps:
  1. Sign up for Cloudflare (free).
  2. Add `joinwannaapp.com` to Cloudflare; either (a) replace Namecheap nameservers with Cloudflare's two assigned nameservers (recommended — gives Cloudflare full DNS control + Pages auto-provisioning) or (b) leave Namecheap nameservers and just add a `CNAME prefs → <project>.pages.dev` record there.
  3. Create a Cloudflare Pages project, point it at the `wanna-dev-v1` GitHub repo, build directory `web/prefs/` (will be added in this repo), framework "None" (static HTML).
  4. Set the custom domain on the Pages project to `prefs.joinwannaapp.com`.
  5. Inside `web/prefs/`: a single `index.html` reads the `?token=…` from the URL, calls a new JSON-only Supabase function (`email-prefs-api`) for read/save/unsubscribe (POST + GET, returning JSON) using the anon key. The static page is what users see; CSP is fine because it's served from Cloudflare, not Supabase.
  6. Update `send-email`'s `EMAIL_PREFS_BASE_URL` constant from the Supabase functions URL to `https://prefs.joinwannaapp.com`.
- **For local preview right now:** `curl '<email-prefs URL>' > /tmp/x.html && open /tmp/x.html`. The HTML body is correct; only the gateway-served browser response is broken.

### Universal Links / App Links for `https://joinwannaapp.com/open`
- **What:** The welcome email's "Open Wanna" CTA points at `https://joinwannaapp.com/open`. Without a Universal Link / App Link association, tapping it from a phone falls back to opening the URL in a browser instead of deep-linking into the installed app.
- **What you need to do:**
  1. Serve `apple-app-site-association` (JSON, no extension, `Content-Type: application/json`) at `https://joinwannaapp.com/.well-known/apple-app-site-association` with the Wanna Team ID + bundle ID `com.wanna.app` and a path of `/open`.
  2. Serve `assetlinks.json` at `https://joinwannaapp.com/.well-known/assetlinks.json` for the Android `com.wanna.app` package.
  3. Add the matching `associatedDomains: ["applinks:joinwannaapp.com"]` to `app.json` (iOS) and the `intentFilters` for autoVerify on Android.
  4. Decide what `/open` actually serves on the web for users without the app installed (fallback landing page with App Store + Play Store badges).

---

## 🟡 Needed before launch


### In-app moderator flow doesn't email the user yet — wire `mod_resolve_report` → `moderate-user`
- **What's broken:** the `ResolveReportModal` (in-app Mod tab) calls the `mod_resolve_report` Postgres RPC. That RPC writes the report row, persists the new `removed_content_type` / `ban_duration` / `ban_reason` fields, and deactivates the user for bans — but it **does not send the user-facing email**. The Resend send lives in the `moderate-user` edge function, which is service-role only and can't be called from a regular user's mobile app.
- **What this means right now:** moderators using the in-app modal silently skip the warning / content-removed / suspension / permanent-ban email to the user. The data is captured correctly, but the user never hears about it.
- **Fix path (~30–45 min):** add a `SECURITY DEFINER` plpgsql wrapper (or extend `mod_resolve_report` itself) that, after committing the report row, fires a `pg_net` POST at `…/functions/v1/moderate-user` with the vault-stored service-role key. Body includes `user_id`, `action`, `reason`, `report_id`, plus the new override fields so the email render uses the moderator's exact values. Same pattern as the `auth.users` welcome-email trigger in migration 00042. Failure to send should log to a side table but not roll back the resolution.
- **Then:** once wired, **revise [the user-facing moderation guide](your standalone doc)** so it can describe the in-app modal as a single one-stop flow ("pick action → fill fields → tap Resolve → email goes out"). The current draft of the guide that describes manual Supabase Table-Editor edits is obsolete the moment that wiring lands. Owner-action item to update the guide is parked here so it doesn't get lost.

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

### Push notifications — fully configured, pending in-app verification on real devices
- **Status:** Pipeline is live end-to-end on both platforms:
  - Migration 00012 — `device_tokens` + `notification_log` tables with RLS
  - `usePushRegistration` hook registers Expo push tokens on auth, unregisters on sign-out
  - `send-push` edge function deployed; triggers wired in Discover/Who's In/Chat
  - **EAS project:** `@wanna-dev/wanna` (project id `f758a37f-b306-4bb5-9e06-ad6dee438066`), written into `app.json`
  - **APNs (iOS):** `.p8` uploaded to Expo. Apple Team registered as "Wanna" (Individual) using the Team ID from `.env.local`; push key (Key ID from `.env.local`) linked to that team via the Expo GraphQL API.
  - **FCM v1 (Android):** Firebase project `wanna-app-484519` created, Cloud Messaging enabled, service account JSON uploaded to Expo via GraphQL (`createGoogleServiceAccountKey` → `setGoogleServiceAccountKeyForFcmV1`), linked to Android app credentials for `com.wanna.app`. Verified clientEmail `firebase-adminsdk-fbsvc@wanna-app-484519.iam.gserviceaccount.com`.
- **Still to verify:** run the app on a real iPhone AND a real Android device (simulators can't receive APNs/FCM), sign in as real users, perform a swipe / accept / send-message action between them, and confirm pushes land on both platforms.

---

## 🟢 Nice-to-have / post-MVP

### Native iOS Calendar write — needs custom dev-client rebuild
- **What:** "Add to calendar" works today via the `.ics` share sheet (universal — routes to Apple Calendar / Google Calendar / Outlook / Fantastical / etc). The native one-tap path via `expo-calendar` is wired, but `expo-calendar` is a native module not bundled in Expo Go, so when running through Expo Go we silently fall back to the share sheet.
- **What you need to do** (one-time, ~20 min): build a custom dev client and use that instead of Expo Go for development.
  1. From `app/`, confirm you're signed in: `eas whoami`
  2. Kick off the iOS dev-client build: `eas build --profile development --platform ios`
  3. When the build finishes, install it from the link in the email / `expo.dev` build page (simulator install is free; real-device install requires a paid Apple Developer account)
  4. Start Metro with `npx expo start --dev-client` and open the new dev-client app instead of Expo Go
- After that, the action sheet's "Save to Calendar" option writes directly to iOS Calendar in one tap. The `.ics` share path still works as the fallback for non-Apple calendars.

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

### Web mod dashboard
- **What:** A separate web admin app for moderation at production scale.
- **Why deferred:** The in-app **Mod tab** (gated by `profiles.is_moderator`) covers all current needs — Reports, Photo flags, and Verifications queues with full action support. A web dashboard is nice-to-have for scale but not blocking.

### Sender avatar in recipients' inboxes — BIMI (CMC-only, post-MVP)
- **What:** The square logo shown next to the sender name in Gmail / Apple Mail / Outlook is set by the *receiving* email client based on records configured by the sender. Without one, recipients see a generic "W" letter avatar.
- **The only path Resend supports is BIMI.** Confirmed via Resend's docs: https://resend.com/docs/dashboard/domains/bimi. (There is **no** free "Brand Logo" feature on Resend — earlier draft of this doc claimed there was; it was wrong. Google Workspace avatars also wouldn't apply because we send from `noreply@send.joinwannaapp.com`, not a Workspace mailbox.)
- **Cost:** ~$1.5k/yr for the Verified Mark Certificate (VMC) issued by Entrust or DigiCert, plus DNS work. Coverage: Gmail, Yahoo, Apple Mail, Fastmail.
- **Status:** **Deferred to CMC** (Commercial Mature Company stage) — not affordable right now. Square logo already at `https://ymztxrpkhenbcbjjfbxr.supabase.co/storage/v1/object/public/assets/wanna_avatar.png` for whenever this gets revived.

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
- **Transactional templates:** `send-email` edge function exposes three templates: `match` (exactly-once per match), `interest` (1 per recipient/activity/24h), `meetup_check` (1 per recipient/match/7d). All templates use the brand purple, are skipped for `is_seed`, `is_active=false`, and recipients whose per-type email pref is off.
- **Wiring:** Discover swipe-right → interest email; Who's In accept → match email to both parties; meetup-check materialization → reminder email. All fire-and-forget alongside existing pushes; debounce makes duplicate fires harmless.
- **Per-type pref gating (server-side):** `send-email` reads the recipient's `notify_interest_email` / `notify_match_email` / `notify_meetup_email` flag and short-circuits when off. Same pattern in `send-push` for the push side. The user controls every type × channel from Settings → Notifications (matrix UI).
- **Welcome email — DEPLOYED ✅** Migration 00041 (`profiles.marketing_emails_enabled`) + 00042 (`auth.users` AFTER UPDATE OF `email_confirmed_at` trigger) live. `send-email` `welcome` template embeds the user-provided gradient HTML with `{{ .FirstName }}` / `{{ .AppURL }}` / `{{ .ManagePreferencesURL }}` / `{{ .UnsubscribeURL }}` substitutions; signs HS256 JWTs (30-day TTL) for the prefs/unsubscribe links using `EMAIL_PREFS_SECRET` (rotated 2026-05-06). Service-role calls authenticated by decoding the JWT `role` claim instead of string-comparing the bearer (more robust to vault/env drift). Marketing-emails toggle row in Settings → Notifications.
- **Email preferences hosted page — DEPLOYED ✅ (2026-05-06)** `email-prefs` edge function rewritten to expose all 6 optional email categories (interest, match, message, meetup, new_activities, marketing) in the in-app Settings order, recipient email at the top, fully-unsubscribed banner, secondary "unsubscribe from all" link. Save handler writes all six profiles columns from a single GET form submit. POST handler implements RFC 8058 `List-Unsubscribe-Post=One-Click` so Gmail/Apple Mail surface a native unsubscribe button. `send-email` injects per-recipient manage + unsubscribe URLs into every template footer (notification + welcome) and sets `List-Unsubscribe` + `List-Unsubscribe-Post` headers on every Resend send. Single source of truth: the `profiles.notify_*_email` + `marketing_emails_enabled` columns; in-app Settings and the hosted page both read/write the same rows.
- **Welcome email — TEST PENDING.** A real account with `me@averydella.com` does not exist in `auth.users` yet (one earlier successful test was for a now-deleted user). The cleanest end-to-end test is to sign up via the app with Google or Apple sign-in, confirm email, and watch for the welcome to land in `me@averydella.com`. That exercises the full trigger path (auth.users.email_confirmed_at → pg_net → send-email → Resend). Until the app's running on simulator/device, you can preview the manage-prefs page rendering by minting a token locally with `EMAIL_PREFS_SECRET` (now in `.env.local`). The earlier "verified to me@averydella.com / message b16195e8…" was for a user record that has since been removed.

### Moderation + ban system — DEPLOYED ✅
Migrations 00016 + 00017. `profiles.banned_until` and `profiles.ban_reason` columns added. `pg_net` enabled. Service role key stored encrypted in Supabase Vault (never in committed files).
- **`notify-new-report`** edge function emails `hello@joinwannaapp.com` on every report INSERT (with reporter + reported names, dashboard link, 🚨 URGENT prefix for underage reports). Wired via DB trigger on `reports`.
- **`moderate-user`** edge function (admin-only via service-role auth) takes 6 actions: `warning`, `content_removed`, `temp_ban_24h/7d/30d`, `permanent_ban`. Sets ban columns, resolves linked report, sends user-facing email (never reveals reporter).
- **`auto-unban`** runs hourly via pg_cron, reactivates expired temp bans and sends a welcome-back email.
- **In-app `BannedScreen`** intercepts before MainTabs when `is_active=false` — shows reason, expiry (for temp bans), and sign-out.
- **All 5 email templates** (account-warning, content-removal, account-suspension, account-closure, account-reactivated) designed in Resend, embedded as raw HTML in the edge functions with `{{ .Reason }}` / `{{ .BanDuration }}` / `{{ .BannedUntil }}` / `{{ .ContentType }}` / `{{ .LoginURL }}` substitution. Verified live via direct Resend send: HTTP 200, delivery confirmed in user's inbox.
- **Moderator-overridable report fields (2026-05-06):** Migration `00043_reports_moderator_fields.sql` + `00044_mod_resolve_report_fields.sql` add three nullable columns to `reports` — `removed_content_type` (activity/photo/message), `ban_duration` (custom human-readable duration, e.g. "24 hours"), `ban_reason` (short explanation shown to user, e.g. "Harassment in chat after prior warning"). `moderate-user` edge function accepts these as optional request fields, persists them on the report row alongside the resolution, and uses them as overrides in the email render with sensible fallbacks. **In-app moderator UI updated:** the previous Alert-based picker on `ReportsQueueScreen` is replaced with a proper `ResolveReportModal` (`app/src/screens/moderation/ResolveReportModal.tsx`) that conditionally shows form fields per chosen action — content-type chip selector for "Remove content", duration presets + custom input for "Temp ban", explanation textarea for any ban, plus optional internal-notes for any resolution. Values flow via the extended `mod_resolve_report` RPC.
- **Mobile mod UI does NOT send the user-facing email yet** — see "In-app moderator flow doesn't email the user yet" under 🟡 above for the full plan + guide-rewrite reminder.
- **Banned-email blocklist (migration 00020):** new `banned_emails` table (RLS-locked to service-role only) is checked by the `handle_new_user` signup trigger — any email on the list raises a generic `signup_not_allowed` error so attackers can't tell ban-rejection apart from any other signup failure. `moderate-user` upserts the email when applying `permanent_ban`, so the block persists across `auth.users` deletion. Doesn't stop a user from using a different email — device fingerprinting is a separate tier (not built).
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
- **Meetup check-in pushes** (migration 00037): `meetup-pushes-hourly` runs at `:05` every hour. Dispatches `meetup` push to both parties on a match the day after a dated activity, gated to **9:00–9:59 LOCAL** hour using `profiles.timezone` (fallback `America/Los_Angeles`). Dedupes via `notification_log`. Undated/evergreen activities never trigger meetup checks.
- **New activities weekly digest** (migration 00038): `new-activities-hourly` runs at `:10` every hour. For each user where it's currently **15:00–15:59 local on a Friday**, counts active in-radius activities posted since the last digest and POSTs a `new_activities` push. Dedupes via `notification_log` keyed on local date.

### Notifications — preference matrix + cadence + presence (S/T phases)
- **5 × 2 matrix UI:** Settings → Notifications now shows one row per type (Activity interest / New matches / Messages / Meetup check-ins / New activities) with tap-to-toggle Push and Email pills (Bell + Envelope icons). Defaults: push ON, email OFF for every type. Migrations 00034 + 00035.
- **Push copy:** all 5 types ship per-spec titles + bodies. Match push goes only to the accepted (swiper) party. Interest pushes coalesce within a 15-min window — multi-person body fires when >1 distinct swiper.
- **Message presence suppression:** `chat_presence` table + RLS (migration 00039). ChatScreen heartbeats every 25s while mounted; `send-push` short-circuits message pushes for recipients with a fresh heartbeat (≤30s) for the sender.
- **Service-role auth bypass** in `send-push` so cron dispatchers can trigger the function without a per-user JWT.
- **`notification_log.context_id` widened to `text`** (00037) so the new-activities digest can dedupe on a local date string instead of just UUIDs.
- **Tap routing:** `usePushNavigation` handles all 5 types — interest → Who's In, match → Chat, message → Chat, meetup → Chat (modal fires via the global `useMeetupChecks` subscription), new_activities → Discover. Cold-launch + warm both handled.

### Profile — neighborhood + timezone
- **Neighborhood field** (migration 00032): `profiles.neighborhood` text (max 60 chars). Edit Profile field with MapPin icon, sits between University and Politics. Surfaced on Profile + UserProfile About cards. 13 LA-based seed users + the demo got prefilled neighborhoods.
- **Timezone field** (migration 00037): `profiles.timezone` IANA string. `useAuth` writes the device's timezone (`Intl.DateTimeFormat().resolvedOptions().timeZone`) on profile load and on drift. Drives the meetup + new-activities cron locality gates.

### Activities
- **Activity link previews:** the existing `link-preview` edge function powers preview cards on both chat AND the Discover expanded card / ActivityDetail (parity).
- **Auto-fill date from event link:** `lib/scrapeEventDate.ts` fetches the link with a desktop UA + 6s timeout, scans for JSON-LD `startDate` / OG `event:start_time` / microdata `itemprop="startDate"`. PostActivity debounces link input (500ms) and auto-fills the date picker if the page yields a future date AND the user hasn't manually edited it.
- **Edit activity** (commit `c241206`): `PostActivityScreen` is now dual-mode keyed off `route.params.editActivityId`. ActivityDetailScreen "Edit activity" button replaces the prior "Coming soon" alert. Owner-only (RLS + client guard); skips the active-count limit + public-place modal; emits `activity_edited` analytics with a fields_changed diff.
- **Met-confirmed archive** (migration 00033): once both parties confirm "yes, we met," `activities.met_confirmed_at` is stamped and the activity drops off Who's In + the poster's "My activities" + the visited user's profile activity list. Match row stays active so the chat thread persists.
- **Default discovery distance** dropped 50 → 25 mi (migration 00040).

### Add to calendar
- **`.ics` share path — DEPLOYED ✅:** `lib/icsCalendar.ts` generates an RFC-5545 VCALENDAR/VEVENT, writes to the cache dir, and opens the iOS share sheet with `mimeType=text/calendar` + UTI `public.calendar-event` so the system routes to Apple Calendar / Outlook / Google Calendar / Fantastical / etc. Wired on MatchModal (Who's In + queue accept) and on ActivityDetailScreen (non-owner viewers with an active match on that activity).
- **Native iOS Calendar write:** action sheet on the "Add to calendar" CTA gives a "Save to Calendar" option that calls `expo-calendar` to write directly. Falls back to `.ics` if `expo-calendar` isn't loaded (Expo Go) or permission denied. **Requires a custom dev-client rebuild — see "Native iOS Calendar write" entry above.**

---

## How to update this file

When Claude finishes work and identifies new manual steps, ask:
> "Update the deferred log."

Or, if you've completed something on this list:
> "Mark Google OAuth as done in the deferred log."
