# Deferred / Manual Setup Tasks

> Single source of truth for everything that requires your hands (third-party
> account creation, secret management, dashboard clicks, etc.) before we can
> ship to real users. Claude maintains this file — ask anytime to "check the
> deferred log."

**Legend:** 🔴 blocking · 🟡 needed before launch · 🟢 nice-to-have

---

## 🔴 Blocking — needed to test current build end-to-end

### Universal Links / App Links for `https://joinwannaapp.com/open` 🔴 STILL BLOCKING
- **What:** The welcome email's "Open Wanna" CTA points at `https://joinwannaapp.com/open`. Without a Universal Link / App Link association, tapping it from a phone opens the URL in a browser instead of deep-linking into the installed app.
- **Why still blocking:** we have the files written but they are NOT deployed and the two required values are NOT filled in. Without the manifests live at the right URLs and the Apple Team ID + Android fingerprint in place, iOS and Android refuse to associate the domain with the app. None of the deep-linking works until all four bullets under "Remaining work" below are done.
- **Status:** scaffold committed in `web/`, ready to deploy:
  - `web/open/index.html` — branded landing page with App Store / Play Store badges (badge image URLs are placeholder; swap once the app is live in stores). Includes a `wanna://open` custom-scheme fallback that fires after 350ms if the OS didn't intercept the navigation. Forwards any query string into the deep link.
  - `web/.well-known/apple-app-site-association` — iOS Universal Links manifest. **TODO: replace `TEAMID10` with the 10-character Apple Developer Team ID.** Find it at developer.apple.com/account → Membership.
  - `web/.well-known/assetlinks.json` — Android App Links manifest. **TODO: replace the placeholder SHA-256 fingerprint** with the upload-key fingerprint from EAS (expo.dev → project → Credentials → Android Build Credentials → SHA-256 fingerprint, formatted as uppercase hex with colons).
  - `web/netlify.toml` — config that forces `Content-Type: application/json` on both `.well-known/*` files (without this iOS / Android both reject the manifests) and aliases `/open` → `/open/index.html`.
- **Remaining work:**
  1. Drop in your Apple Team ID in the AASA file. Drop in your Android SHA-256 fingerprint in assetlinks.json.
  2. Deploy `web/` as a second Netlify project (separate from the existing `web/notifications` one) and point `joinwannaapp.com` apex + `www.joinwannaapp.com` at it via Namecheap CNAMEs (or A records pointing at Netlify's load balancer).
  3. Add `associatedDomains: ["applinks:joinwannaapp.com"]` to `app/app.json` under the `ios` key. Add the matching `intentFilters` with `autoVerify: true` under `android.intentFilters` for `com.wanna.app` on the `https` scheme.
  4. Run a fresh `eas build --profile development --platform ios` (and Android) so the entitlement is provisioned. Without a fresh dev build, iOS won't even attempt to validate the AASA file.

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

### GitHub Actions CI — file written, NOT yet on remote
- **Status:** `.github/workflows/ci.yml` exists in the working tree but is **untracked / unpushed** as of last check (`git status` shows `?? .github/`, `git ls-tree origin/main` empty). Earlier attempt to push as part of a larger commit was rejected with: *"refusing to allow an OAuth App to create or update workflow … without `workflow` scope"*. So the workflow file is sitting on disk but never made it to GitHub.
- **Unblock command** (one-liner; run from anywhere):
  ```
  cd /Users/averyneal/Developer/wanna-dev-v1 && gh auth refresh -s workflow && git add .github && git commit -m "ci: typecheck workflow" && git push
  ```
- **What it does once live:** typechecks the `app/` workspace on every push to `main` and every PR. Just `npx tsc --noEmit` in CI, fast (~1 min). Add lint / test jobs later if useful.

### Web mod dashboard
- **What:** A separate web admin app for moderation at production scale.
- **Why deferred:** The in-app **Mod tab** (gated by `profiles.is_moderator`) covers all current needs — Reports, Photo flags, and Verifications queues with full action support. A web dashboard is nice-to-have for scale but not blocking.
  - **Convert the moderation guide to PDF.** The canonical Markdown lives at `docs/MODERATION_GUIDE.md`. To hand it to non-developer moderators, export it as a PDF and distribute (e.g. via a Drive link or attached to the moderator's onboarding email). Easiest path: open the file in VS Code with a Markdown PDF extension installed, or `brew install pandoc && pandoc docs/MODERATION_GUIDE.md -o moderation-guide.pdf`. Re-export whenever the in-app modal flow changes meaningfully.

### Sender avatar in recipients' inboxes — BIMI (defer until we get a CMC)
- **What:** The square logo shown next to the sender name in Gmail / Apple Mail / Outlook is set by the *receiving* email client based on records configured by the sender. Without one, recipients see a generic "W" letter avatar.
- **The only path Resend supports is BIMI.** Confirmed via Resend's docs: https://resend.com/docs/dashboard/domains/bimi. (There is **no** free "Brand Logo" feature on Resend — earlier draft of this doc claimed there was; it was wrong. Google Workspace avatars also wouldn't apply because we send from `noreply@send.joinwannaapp.com`, not a Workspace mailbox.)
- **Why this is deferred:** BIMI requires either a **VMC** (Verified Mark Certificate, ~$1.5k/yr — requires a registered trademark) or a **CMC** (Common Mark Certificate, ~$1k/yr — works for unregistered / common-law marks, supported by Gmail and Apple Mail since 2023). Wanna's wordmark isn't a registered trademark yet, so a VMC isn't an option; a CMC is the realistic path but still costs real money and we can't justify it pre-launch. Revive once we have a CMC in hand.
- **What's needed when we revive it:** purchase a CMC from Entrust or DigiCert against the wanna wordmark, publish a BIMI DNS TXT record at `default._bimi.send.joinwannaapp.com` referencing an SVG of the logo + the CMC PEM, and Resend should pick it up. Square logo SVG / PNG is already at `https://ymztxrpkhenbcbjjfbxr.supabase.co/storage/v1/object/public/assets/wanna_avatar.png` for whenever this happens.

---

## ✅ Already configured (for reference)

> A new dev joining the team can read this top-to-bottom and know what's
> live in production today. Items group by feature area, not by when
> they were built. The 🔴 / 🟡 / 🟢 sections above cover what's still
> open.

### Infrastructure
- **Supabase project:** `https://ymztxrpkhenbcbjjfbxr.supabase.co`. 10 tables with RLS policies, triggers, the `get_feed` RPC + 12 supporting RPCs, and the standard set of extensions (`pg_cron`, `pg_net`, `vault`).
- **Storage buckets:** `profile-photos` and `verification-selfies` (both private, 10MB limit). Public assets bucket `assets` for shared images (wordmark, avatars, gradient PNG).
- **GitHub:** `wanna-app/wanna-dev-v1` (`averydella` has push access).
- **Hosting (web):** Netlify hosts the email-prefs static page at `notifications.joinwannaapp.com`. Domain `joinwannaapp.com` is registered with Namecheap; DNS lives at Namecheap with a CNAME pointing the subdomain at Netlify. SSL auto-provisions.
- **Database connection:** `aws-1-us-east-1.pooler.supabase.com` (port 5432 session, 6543 transaction).

### Auth
- **Custom SMTP via Resend** for all auth-issued mail (confirmation / reset / magic-link). `smtp.resend.com:465`, sender `noreply@send.joinwannaapp.com` ("Wanna"). The Resend domain `send.joinwannaapp.com` is verified. Bounces go against Resend's deliverability metrics, not Supabase's shared mailer.
- **Email confirmation required on signup.** The `handle_new_user` trigger creates a `profiles` row in lockstep with the `auth.users` insert; explicit `search_path` so it works under `supabase_auth_admin` (migrations `00007` + `00008`).
- **Sign-in providers configured server-side:** Google OAuth + Apple Sign-In + email/password. Native client wiring lives in `WelcomeScreen.tsx` using `expo-linking` for the `wanna://auth-callback` deep link. (Both providers still need on-device verification — see 🟡 above.)
- **Banned-email blocklist** (migration `00020`): `banned_emails` table is checked by `handle_new_user`; matching emails raise a generic `signup_not_allowed` error so attackers can't distinguish ban-rejection from any other signup failure. `moderate-user` and `mod_resolve_report` upsert into this table on permanent ban so the block persists across `auth.users` row deletion.

### Database & cron jobs
- **Activity lifecycle** (migration `00013`): `mark-past-date-activities` runs daily at `00:05 UTC` (flips dated activities past their date to `expired`); `cleanup-past-date-activities` runs at `00:10 UTC` (hard-deletes after a 7-day grace).
- **Auto-unban** (migration `00017`): runs hourly, calls the `auto-unban` edge function which lifts expired temp bans and sends a welcome-back email.
- **Meetup check-in pushes** (migration `00037`): `meetup-pushes-hourly` at `:05`. Dispatches the `meetup` push to both parties on a match the day after a dated activity, gated to the local 9:00–9:59 hour using `profiles.timezone`. Dedupes via `notification_log`. Undated / evergreen activities never trigger.
- **New-activities weekly digest** (migration `00038`): `new-activities-hourly` at `:10`. For each user where it's currently 15:00–15:59 local on a Friday, counts in-radius activities posted since the last digest and posts a `new_activities` push. Dedupes via `notification_log` keyed on local date.

### Email — sending
- **Edge function `send-email`.** One entry point, four templates: `welcome`, `match` (exactly-once per match), `interest` (1 per recipient/activity/24h), `meetup_check` (1 per recipient/match/7d). Wired from Discover swipe-right (interest), Who's In accept (match → both parties), the meetup-check materialization (`meetup_check`), and the `auth.users.email_confirmed_at` UPDATE trigger (welcome — migration `00042`).
- **Skip rules** apply to every send: `is_seed`, `is_active=false`, missing email, debounce window per template, and the per-type `notify_*_email` profiles flag (or `marketing_emails_enabled` for the welcome/marketing class).
- **Per-recipient signed prefs URLs.** Every send mints two HS256 JWTs (30-day TTL, `EMAIL_PREFS_SECRET`) and substitutes them into the template's `{{ .ManagePreferencesURL }}` and `{{ .UnsubscribeURL }}` placeholders. Both URLs point at `https://notifications.joinwannaapp.com/?token=…`.
- **RFC 8058 List-Unsubscribe headers** are set on every Resend POST (`List-Unsubscribe` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click`) so Gmail / Apple Mail surface a native unsubscribe button.
- **Service-role detection** in `send-email` and `moderate-user` decodes the JWT `role` claim instead of string-comparing the bearer to `SUPABASE_SERVICE_ROLE_KEY` — robust to vault/env drift. Any new privileged edge function should follow the same pattern.

### Email — preferences page
- **Hosted at `https://notifications.joinwannaapp.com/`** (Netlify, static HTML in `web/notifications/`). The Supabase Edge gateway adds a CSP-sandbox header on every public function response that prevents browsers from rendering HTML, so user-facing pages can't live on Supabase.
- **JSON API: `email-prefs-api`** (Supabase edge function). Static page reads `?token=…` from the URL, GETs to fetch current prefs + recipient email, POSTs to save, POSTs to `/unsubscribe` to flip everything off. Token-authenticated; CORS open.
- **Six categories** in the in-app Settings order: Activity interest, New matches, Messages, Meetup check-ins, New activities, Marketing emails. Maps 1:1 to `profiles.notify_*_email` + `profiles.marketing_emails_enabled` columns. The hosted page and the in-app Settings → Notifications screen both read/write the same rows — single source of truth, no drift.
- **Page UX:** recipient email pill at top, fully-unsubscribed banner when all six are off, secondary "Unsubscribe from all optional emails" link. Confirmation toast on save; the unsubscribe path renders a "you've been unsubscribed" page with a way back to the manage view.

### Push notifications
- **Pipeline** (migration `00012`): `device_tokens` + `notification_log` tables with RLS. `usePushRegistration` hook registers Expo push tokens on auth, unregisters on sign-out. `send-push` edge function dispatches via Expo Push API.
- **Credentials.** EAS project `@wanna-dev/wanna` (id `f758a37f-b306-4bb5-9e06-ad6dee438066`). iOS APNs `.p8` uploaded; Apple Team registered. Android FCM v1 service-account key uploaded for Firebase project `wanna-app-484519` and linked to `com.wanna.app`. (Cross-device verification is still 🟡 — needs real iOS + Android hardware.)
- **Tap routing** (`usePushNavigation`): interest → Who's In; match → Chat; message → Chat; meetup → Chat (popup fires via the global `useMeetupChecks` subscription); new_activities → Discover. Cold-launch + warm both handled.
- **Service-role bypass** in `send-push` so cron dispatchers can trigger the function without a per-user JWT.

### Notification preference matrix
- **Settings → Notifications matrix UI:** one row per type (5 types), each with tap-to-toggle Push and Email pills (Bell + Envelope icons). Defaults: push ON, email OFF (migrations `00034` + `00035`). Marketing emails appear as a separate row that controls only the welcome / marketing-class email flag.
- **Server-side gating.** Both `send-push` and `send-email` short-circuit on the recipient's per-type pref; pushing only ever requires checking the toggle, the user can't be spammed via either channel after they opt out.
- **Push copy** ships per-spec titles + bodies for all 5 types. Match push goes only to the accepted (swiper) party. Interest pushes coalesce within a 15-min window — multi-person body fires when >1 distinct swiper.
- **Message presence suppression** (`chat_presence` table + RLS, migration `00039`). ChatScreen heartbeats every 25s while mounted; `send-push` skips message pushes when the recipient has a heartbeat ≤30s old for the sender. (Email is unaffected.)
- **`notification_log.context_id`** widened to `text` (migration `00037`) so the new-activities digest can dedupe on a local date string instead of just UUIDs.

### Moderation & safety
- **Reports table** schema in `00001`; moderator-overridable fields `removed_content_type`, `ban_duration`, `ban_reason` added in `00043`.
- **Ban columns on profiles** (`00016` + `00017`): `is_active`, `banned_until`, `ban_reason`. Vault-stored service-role key for `pg_net` callbacks.
- **In-app moderator flow.** Mod tab visible only when `profiles.is_moderator = true` (migration `00014`). Three queue screens — Reports, Photo flags, Verifications — backed by 7 moderator-gated RPCs that all check `is_current_user_moderator()` first. Storage RLS extended so moderators can read `verification-selfies`. Activate via `UPDATE profiles SET is_moderator = true WHERE id = '...';`.
- **Resolve flow.** `ResolveReportModal` collects the chosen action plus its required fields (content type / duration / explanation as relevant), then calls `mod_resolve_report` which does **everything** in one plpgsql call: resolves the report row + new override fields, deactivates the user for bans, parses the duration string into `profiles.banned_until` for temp bans, deletes every active `auth.sessions` row (force sign-out), locks `auth.users.banned_until` to year 9999 for permanent bans, upserts into `banned_emails` for permanent bans, then fires `moderate-user` over `pg_net` in `email_only` mode for the user-facing email render+send. Migrations `00043` → `00046`.
- **Edge functions:** `moderate-user` renders + sends the user-facing email (5 templates: warning / content-removal / temp-ban / permanent-ban / reactivation) and supports both legacy direct-call mode and the new `email_only` mode used by the in-app flow. `notify-new-report` emails `hello@joinwannaapp.com` on every report INSERT (with reporter / reported names, dashboard link, 🚨 prefix for underage reports). `auto-unban` lifts expired temp bans hourly.
- **In-app `BannedScreen`** intercepts before MainTabs when `is_active=false` — shows reason, expiry, and sign-out.
- **Photo moderation** (migrations `00010` + `00011`): `moderate-photo` edge function (Google Vision API, key in function secrets). Skips seed users (no Vision credits burned on demo traffic).
- **Moderator guide:** canonical version at `docs/MODERATION_GUIDE.md`. Triage cheatsheet, recovery steps, the obsolete-manual-steps callout — distribute to moderators as the canonical onboarding doc.
- **Security review:** `docs/SECURITY_REVIEW_MOD_FLOW.md` covers migrations `00043` → `00046` and the `moderate-user` changes that landed alongside them. Use it as the template for security-reviewing any new privileged path.

### Activities
- **Posting + editing.** `PostActivityScreen` is dual-mode keyed off `route.params.editActivityId`. Owner-only edit (RLS + client guard), skips the active-count limit + public-place modal, emits an `activity_edited` analytics event with a fields_changed diff.
- **Auto-fill date from event link.** `lib/scrapeEventDate.ts` fetches the linked URL with a desktop UA + 6s timeout, scans for JSON-LD `startDate` / OG `event:start_time` / microdata `itemprop="startDate"`. PostActivity debounces link input (500ms) and auto-fills the date picker if the page yields a future date AND the user hasn't manually edited it.
- **Activity link previews.** `link-preview` edge function powers preview cards on both chat bubbles AND the Discover expanded card / ActivityDetail (parity).
- **Met-confirmed archive** (migration `00033`): once both parties confirm "yes, we met," `activities.met_confirmed_at` is stamped and the activity drops off Who's In + the poster's "My activities" + the visited user's profile activity list. The match row stays active so the chat thread persists.
- **Default discovery radius** is 25 mi (migration `00040`, dropped from 50).
- **Evergreen activities** (no date) display "Anytime" without an "Evergreen" sublabel anywhere in the app.

### Profile
- **Neighborhood** (migration `00032`): free-text `profiles.neighborhood` (max 60 chars). Edit Profile field with MapPin icon, between University and Politics. Surfaced on Profile + UserProfile About cards. Seed users + demo prefilled.
- **Timezone** (migration `00037`): IANA string (`profiles.timezone`). `useAuth` writes the device's timezone (`Intl.DateTimeFormat().resolvedOptions().timeZone`) on profile load and on drift. Drives the meetup-check + new-activities cron locality gates.

### Chat
- **Viewport-based read receipts.** Messages flip read after ≥300ms in viewport (AC-CH-07).
- **Realtime feed auto-refresh.** Discover prepends new matching activities as they're posted (AC-SW-06).
- **Offline queues.** AsyncStorage + NetInfo back swipe + message queues (AC-SW-07 / AC-CH-11), with a global offline banner.
- **Meetup check popup** (PRD §5.9): modal mounted globally, fires on every foreground transition; chat-opened trigger materialized inline from ChatScreen.
- **Chat link previews** via the same `link-preview` edge function used for activities.

### Calendar integration
- **`.ics` share path:** `lib/icsCalendar.ts` generates an RFC-5545 VCALENDAR/VEVENT, writes to the cache dir, opens the iOS share sheet with `mimeType=text/calendar` + UTI `public.calendar-event` so the system routes to Apple Calendar / Outlook / Google Calendar / Fantastical / etc. Wired on MatchModal (Who's In + queue accept) and on ActivityDetailScreen (non-owner viewers with an active match on that activity).
- **Native iOS Calendar write.** Action sheet on "Add to calendar" gives a "Save to Calendar" option that calls `expo-calendar` to write directly. Falls back to `.ics` when `expo-calendar` isn't loaded (Expo Go) or permission is denied. The native path requires a custom dev-client rebuild — tracked under 🟢 above.

### Privacy & data export
- **GDPR data export.** `export-user-data` edge function. Settings tab has a "Download my data" row that fetches the user's full bundle (profile, prefs, activities, swipes, queue entries, matches, messages sent, meetup checks, blocks, reports, photo moderation, device tokens — push tokens redacted), writes a temp JSON file, and opens the system share sheet. 17 top-level keys.

### Analytics & polish
- **Mixpanel** SDK wired with seed-user exclusion (events suppressed when `profile.is_seed = true`). On-device verification still pending (🟡 above).
- **VAG Rounded Bold** brand font loaded via `expo-font` in `App.tsx`, wired into the theme.

### Seed / demo data
- **Demo account:** `demo@joinwannaapp.com` / `WannaDemo2026!` with full profile, posted activities, queues, matches, and chat history.
- **15 LA-based seed profiles + 28 seed activities**, all flagged `is_seed = true`.
- **Cleanup before launch:** run `supabase/cleanup_seed_data.sql` and set `SHOW_DEMO_LOGIN=false` in `app/.env`.

---

## How to update this file

When Claude finishes work and identifies new manual steps, ask:
> "Update the deferred log."

Or, if you've completed something on this list:
> "Mark Google OAuth as done in the deferred log."
