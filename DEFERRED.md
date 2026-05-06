# Deferred / Manual Setup Tasks

> Single source of truth for everything that requires your hands (third-party
> account creation, secret management, dashboard clicks, etc.) before we can
> ship to real users. Claude maintains this file — ask anytime to "check the
> deferred log."

**Legend:** 🔴 blocking · 🟡 needed before launch · 🟢 nice-to-have

---

## 🔴 Blocking — needed to test current build end-to-end

### Email preferences page — code shipped, custom domain still pending 🔴
- **Original blocker:** Supabase Edge gateway adds `Content-Security-Policy: default-src 'none'; sandbox` AND rewrites `Content-Type` to `text/plain` on every public function response, making any HTML response render as raw source in browsers. Confirmed at the gateway boundary, not overridable from inside the function. So the user-facing manage-prefs / unsubscribe page **cannot** be served from a Supabase Edge function.
- **Pivot:** moved all user-facing rendering off Supabase. Now:
  - **`web/notifications/index.html`** — static page hosted on Netlify (free), lives in this repo. Reads `?token=…` from URL, renders the 6-toggle prefs UI, calls back to Supabase only for JSON.
  - **`supabase/functions/email-prefs-api`** — JSON-only sibling of `email-prefs`. GET returns email + prefs + meta; POST saves; POST `/unsubscribe` flips all six off. Token-authenticated. CSP doesn't matter because responses are JSON, not HTML.
  - **`send-email`** — `EMAIL_PREFS_BASE_URL` flipped from the Supabase functions URL to `https://notifications.joinwannaapp.com`. Welcome / interest / match / meetup_check templates and the `List-Unsubscribe` header all point at the new domain.
- **Status:** site is live at `https://wanna-notifs.netlify.app/` — manually smoke-tested, page renders perfectly. The orphaned `email-prefs` (HTML-returning) function is still deployed but no longer linked from any email; can be deleted whenever.
- **Last remaining step:** custom domain `notifications.joinwannaapp.com` → wanna-notifs.netlify.app. Netlify added the domain ownership TXT record requirement; the TXT is in Namecheap and resolving (verified via dig), but Netlify's verification poll has been pending. Workaround if it stays stuck: delete the domain entry on Netlify and re-add (the TXT stays in Namecheap and verification should hit fast on retry). Once green, add the CNAME at Namecheap (`Host: notifications`, `Value: <netlify target>`) and SSL provisions automatically.
- **Until that custom domain is live**, real welcome emails point at `notifications.joinwannaapp.com` which doesn't resolve, so the manage-prefs link in any email sent right now will 404. Either hold off on sending welcomes until the domain is live, or temporarily flip `EMAIL_PREFS_BASE_URL` back to `https://wanna-notifs.netlify.app` for testing.

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

### Recent progress
- **Mod flow finally end-to-end** — Migration `00046` extends `mod_resolve_report` so it does all data work in plpgsql (report row + override fields, profile state, parsed `profiles.banned_until` for temp bans, session revoke, `auth.users.banned_until` lockdown for permanent bans, `banned_emails` upsert) and then fires `moderate-user` over `pg_net` in the new `email_only` mode just for the user-facing email. `moderate-user` keeps a legacy direct-call mode for compatibility. Closes the two 🟡 mod gaps from yesterday (no email + temp-ban duration not enforced).
- **Email prefs page off Supabase, onto Netlify** — `supabase/functions/email-prefs-api` (JSON-only) deployed; `web/notifications/index.html` static page built and live at `https://wanna-notifs.netlify.app/`. `send-email` flipped to `https://notifications.joinwannaapp.com`. Custom domain wiring is the only remaining step (still 🔴 — see top of file).
- **Moderation guide v2** — `docs/MODERATION_GUIDE.md` is the canonical user-facing guide for moderators. Replaces every prior draft. Includes triage cheatsheet + recovery steps.
- **Universal Links scaffold** — `web/open/index.html` (App Store / Play Store landing page with `wanna://` deep-link fallback), `web/.well-known/apple-app-site-association`, `web/.well-known/assetlinks.json`, `web/netlify.toml`. Two placeholders need filling (Apple Team ID + Android SHA-256) and the `web/` directory needs to deploy as a separate Netlify project at `joinwannaapp.com` apex. Still 🔴 (see top of file).
- **CI workflow** — `.github/workflows/ci.yml` written but unpushed (workflow scope on gh OAuth token). 🟢, see below.



### Infrastructure
- Supabase project: `https://ymztxrpkhenbcbjjfbxr.supabase.co`
- All 10 tables + RLS policies + triggers + `get_feed` RPC + 12 supporting RPCs
- Storage buckets: `profile-photos`, `verification-selfies` (both private, 10MB)
- GitHub repo: `wanna-app/wanna-dev-v1` (`averydella` has push access)
- Database connection: `aws-1-us-east-1.pooler.supabase.com` (port 5432 session, 6543 transaction)

### Auth & data
- Signup trigger fixed (migrations 00007 + 00008): empty `first_name` from the auth-user-created trigger no longer fails the CHECK constraint, and the function has an explicit `search_path` so it works when called as `supabase_auth_admin`. Verified end-to-end via `/auth/v1/signup`.
- Email confirmation toggle is **ON**. Resend SMTP handles delivery; bounces go to Resend's deliverability metrics, not Supabase's shared infra.

### Email — DEPLOYED ✅
- **Custom SMTP:** Supabase Auth SMTP configured via Management API: host `smtp.resend.com`, port 465, user `resend`, sender `noreply@send.joinwannaapp.com` ("Wanna"). Resend domain `send.joinwannaapp.com` is verified. `RESEND_API_KEY` in `.env.local` and as a Supabase function secret. Auth confirmation/reset/magic-link emails go through Resend instead of Supabase's shared mailer (fixes earlier bounce-rate issue). Verified live: direct Resend send returned a Resend message id (delivery time ~10–30s).
- **Transactional templates:** `send-email` edge function exposes three templates: `match` (exactly-once per match), `interest` (1 per recipient/activity/24h), `meetup_check` (1 per recipient/match/7d). All templates use the brand purple, are skipped for `is_seed`, `is_active=false`, and recipients whose per-type email pref is off.
- **Wiring:** Discover swipe-right → interest email; Who's In accept → match email to both parties; meetup-check materialization → reminder email. All fire-and-forget alongside existing pushes; debounce makes duplicate fires harmless.
- **Per-type pref gating (server-side):** `send-email` reads the recipient's `notify_interest_email` / `notify_match_email` / `notify_meetup_email` flag and short-circuits when off. Same pattern in `send-push` for the push side. The user controls every type × channel from Settings → Notifications (matrix UI).
- **Welcome email — DEPLOYED ✅** Migration 00041 (`profiles.marketing_emails_enabled`) + 00042 (`auth.users` AFTER UPDATE OF `email_confirmed_at` trigger) live. `send-email` `welcome` template embeds the user-provided gradient HTML with `{{ .FirstName }}` / `{{ .AppURL }}` / `{{ .ManagePreferencesURL }}` / `{{ .UnsubscribeURL }}` substitutions; signs HS256 JWTs (30-day TTL) for the prefs/unsubscribe links using `EMAIL_PREFS_SECRET`. Service-role calls authenticated by decoding the JWT `role` claim instead of string-comparing the bearer (more robust to vault/env drift). Marketing-emails toggle row in Settings → Notifications.
- **Email preferences hosted page — DEPLOYED ✅** `email-prefs` edge function rewritten to expose all 6 optional email categories (interest, match, message, meetup, new_activities, marketing) in the in-app Settings order, recipient email at the top, fully-unsubscribed banner, secondary "unsubscribe from all" link. Save handler writes all six profiles columns from a single GET form submit. POST handler implements RFC 8058 `List-Unsubscribe-Post=One-Click` so Gmail/Apple Mail surface a native unsubscribe button. `send-email` injects per-recipient manage + unsubscribe URLs into every template footer (notification + welcome) and sets `List-Unsubscribe` + `List-Unsubscribe-Post` headers on every Resend send. Single source of truth: the `profiles.notify_*_email` + `marketing_emails_enabled` columns; in-app Settings and the hosted page both read/write the same rows.
- **Welcome email — TEST PENDING.** A real account with `me@averydella.com` does not exist in `auth.users` yet (one earlier successful test was for a now-deleted user). The cleanest end-to-end test is to sign up via the app with Google or Apple sign-in, confirm email, and watch for the welcome to land in `me@averydella.com`. That exercises the full trigger path (auth.users.email_confirmed_at → pg_net → send-email → Resend). Until the app's running on simulator/device, you can preview the manage-prefs page rendering by minting a token locally with `EMAIL_PREFS_SECRET` (now in `.env.local`). The earlier "verified to me@averydella.com / message b16195e8…" was for a user record that has since been removed.

### Moderation + ban system — DEPLOYED ✅
Migrations 00016 + 00017. `profiles.banned_until` and `profiles.ban_reason` columns added. `pg_net` enabled. Service role key stored encrypted in Supabase Vault (never in committed files).
- **`notify-new-report`** edge function emails `hello@joinwannaapp.com` on every report INSERT (with reporter + reported names, dashboard link, 🚨 URGENT prefix for underage reports). Wired via DB trigger on `reports`.
- **`moderate-user`** edge function (admin-only via service-role auth) takes 6 actions: `warning`, `content_removed`, `temp_ban_24h/7d/30d`, `permanent_ban`. Sets ban columns, resolves linked report, sends user-facing email (never reveals reporter).
- **`auto-unban`** runs hourly via pg_cron, reactivates expired temp bans and sends a welcome-back email.
- **In-app `BannedScreen`** intercepts before MainTabs when `is_active=false` — shows reason, expiry (for temp bans), and sign-out.
- **All 5 email templates** (account-warning, content-removal, account-suspension, account-closure, account-reactivated) designed in Resend, embedded as raw HTML in the edge functions with `{{ .Reason }}` / `{{ .BanDuration }}` / `{{ .BannedUntil }}` / `{{ .ContentType }}` / `{{ .LoginURL }}` substitution. Verified live via direct Resend send: HTTP 200, delivery confirmed in user's inbox.
- **In-app moderator flow — END-TO-END:** Migrations `00043` → `00046` and the `ResolveReportModal` in the app together give us a single one-tap flow. The modal collects everything (action + content type / duration / explanation), then `mod_resolve_report` does *all* data work in plpgsql — report row + new override fields, profile state, parsed `profiles.banned_until` for temp bans, session revoke (`auth.sessions` delete), `auth.users.banned_until` lockdown for permanent bans, `banned_emails` upsert — and finally fires `moderate-user` over `pg_net` in `email_only` mode just for the user-facing email render+send. `moderate-user` keeps a legacy direct-call mode for compatibility. The TODO this used to flag (no email from in-app flow) is closed; only follow-up is the user-facing guide rewrite (logged as its own 🟡 above).
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
