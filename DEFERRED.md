# Deferred / Manual Setup Tasks

> Single source of truth for everything that requires your hands (third-party
> account creation, secret management, dashboard clicks, etc.) before we can
> ship to real users. Claude maintains this file — ask anytime to "check the
> deferred log."

**Legend:** 🔴 blocking · 🟡 needed before launch · 🟢 nice-to-have · ⏸️ on hold

---

## 🔴 Blocking — App Store / Play Store submission cannot proceed without these

### Cloudflare Turnstile on auth forms
- **What:** Today the signup / signin endpoints rely on Supabase's default IP-based rate limit (~30 req/hr) and have no CAPTCHA. Credential-stuffing bots can hammer signin within that rate limit; bot accounts can sign up. Turnstile is Cloudflare's invisible CAPTCHA — supported natively by Supabase Auth, no user friction in the common case.
- **What to do:** create a Turnstile site at https://www.cloudflare.com/products/turnstile/ (free), paste the sitekey + secret into Supabase Dashboard → Authentication → Captcha; wire the sitekey into the email signup / signin forms client-side. ~15 min.

### MFA / TOTP support
- **What:** Users with high-stakes accounts (moderators, eventually paying users) can't add a second factor today. Supabase MFA is available on free tier via the API.
- **What to do:** add a Settings → Security screen with "Add authenticator app" enrollment (Supabase generates the TOTP secret + QR code); update signin flow to prompt for the code if MFA is enabled on the account. ~2 hr.

---

## 🟡 Needed before launch

### Mixpanel funnel definitions
- **What:** Mixpanel is collecting events but no funnels are saved. Week 1 of launch you want to see signup → first activity posted → first swipe → first match → first message drop-off at a glance.
- **What to do:** in Mixpanel → Boards / Funnels → define the activation funnel + the engagement funnel. ~30 min.

### Sub-processor DPAs — verify formal acceptance
- **What:** Privacy Policy declares we have data processing agreements with our sub-processors (Supabase, Mixpanel, Sentry, OpenAI, Resend, Google Cloud, Expo). Most vendors offer click-through DPAs that may or may not have been explicitly accepted when we signed up. GDPR posture is tighter if we've actively accepted each.
- **What to do:** ~30 min one afternoon — open each vendor's dashboard (Settings → Compliance / Legal), accept the DPA if not already, save a confirmation screenshot. Vendors to cover: Supabase, Mixpanel, Sentry, OpenAI, Resend, Google Cloud.

### Google OAuth consent screen — verify Privacy + Terms links surface
- **What:** Privacy + Terms URLs have been pasted into Google Cloud Console → Google Auth Platform → Branding (`https://www.joinwannaapp.com/privacy` and `https://www.joinwannaapp.com/terms`). Last sign-up test didn't show the links on the consent screen — likely Google cache OR Testing-mode UI differences.
- **What to do:** wait ~30 min after the Branding save, then sign up via Google with a fresh account (or Chrome incognito). Verify both links appear at the bottom of the consent dialog. If still missing, screenshot the consent screen so we can diagnose (could be a cache issue, Testing-mode UI quirk, or a saved-state issue in the Branding tab).

### Login alert email — smoke test
- **What:** Login-alert pipeline shipped (migration `00056` + `send-email`'s `login_alert` template). Triggers on novel device sign-ins (new user_agent + ip not seen for that user in the last 30 days).
- **What to do:** verify end-to-end by signing in from a "novel" context — e.g., a desktop browser session OR a different network OR after clearing cookies. Confirm an alert email arrives with: real-looking device label, IP in the Location field, working Reset Password link (should open Supabase's hosted recovery page). Also verify NO alert fires on repeat sign-ins from the same device + network.

### Community Guidelines doc
- **What:** Terms of Service references a separate Community Guidelines document that describes acceptable conduct on the platform in plain language (vs. the more legalese ToS). Apple + Google reviewers look for this on user-generated-content apps; users also benefit from a clear, readable reference for what's allowed.
- **What to do:** write a `community-guidelines/index.html` page in the same style as `web/privacy/` — short, plain-English sections covering: respectful conduct, no harassment / threats / hate speech, identity authenticity (no impersonation / fake profiles), no commercial spam / solicitation, age requirements (18+), in-person safety reminders, reporting process, and consequences (warning → content removal → temp ban → permanent ban — mirroring the in-app `mod_resolve_report` flow). Host alongside the privacy policy via the `landing-page` repo at `joinwannaapp.com/community-guidelines`. ~1–2 hr to draft + style.

---

## ⏸️ On hold — blocked on something outside our control

> Items we've intentionally parked. Each is unblocked by an external
> milestone or budget gate. Revisit when the gate clears.

### "Open Wanna" deep-link in email — blocked on TestFlight / App Store availability
- **Why on hold:** the welcome email's "Open Wanna" CTA points at `https://joinwannaapp.com` (marketing landing page) for now. A Universal Link only opens the app when the app is **installed on the device** — which won't be true for real users until we're at least on TestFlight, and ideally live in the App Store / Play Store.
- **What's already done:** Universal Links scaffold is fully written in `web/` (apple-app-site-association with Apple Team ID `J442U4M7JC` and bundle ID `com.joinwannaapp.wanna` filled in; assetlinks.json template; netlify.toml content-type forcing; branded landing page in `web/open/index.html` with App Store / Play Store badge slots).
- **When to revisit:** alongside TestFlight submission. At that point:
  1. Drop in Android SHA-256 fingerprint in `web/.well-known/assetlinks.json` (from expo.dev → Credentials → Android Build Credentials).
  2. Deploy `web/` as a second Netlify project; point `joinwannaapp.com` apex at it.
  3. Add `associatedDomains: ["applinks:joinwannaapp.com"]` to `app/app.json` under the `ios` key + matching Android `intentFilters` with `autoVerify: true`.
  4. Run a fresh `eas build --profile development --platform ios` (and Android) so the entitlement is provisioned.
  5. Flip `APP_URL` in `supabase/functions/send-email/index.ts` from `https://joinwannaapp.com` to `https://joinwannaapp.com/open`.

### Firebase Cloud Messaging on Android — blocked on tester device purchase
- **Why on hold:** FCM v1 push delivery can't be reliably verified on the Android emulator (the default image has no Google Play Services; the Play-flavored image is flaky for push). A real Android device is required to prove the pipeline works end-to-end.
- **What's already done:** Firebase project `wanna-app-484519` created; service account key uploaded to Expo for FCM v1; `device_tokens` table + `send-push` edge function fully wired; `usePushRegistration` hook handles registration/unregistration on auth.
- **When to revisit:** after purchasing a test Android device (used Pixel 4a or Pixel 5 on Swappa / eBay ~$80–100 is enough; Wi-Fi only, no SIM needed).
  1. Re-link the FCM v1 service account key to the new `com.joinwannaapp.wanna` package — runbook at [`docs/FIREBASE_ANDROID_RELINK.md`](docs/FIREBASE_ANDROID_RELINK.md).
  2. `eas build --profile development --platform android` and install on the test device.
  3. Sign in, confirm `device_tokens` gets a row with `platform = 'android'`.
  4. Trigger pushes from another account (interest / match / message / meetup) — confirm receipt on the device.

### Sender avatar in recipients' inboxes (BIMI) — blocked on CMC budget
- **Why on hold:** the only path Resend supports for sender-avatar branding in Gmail / Apple Mail / Outlook is BIMI, which requires either a VMC (~$1.5k/yr, needs a registered trademark) or a CMC (~$1k/yr, works for unregistered / common-law marks). Neither is in budget pre-launch.
- **What's already done:** square logo SVG / PNG is staged at `https://ymztxrpkhenbcbjjfbxr.supabase.co/storage/v1/object/public/assets/wanna_avatar.png` for the day we revive this.
- **When to revisit:** after launch, when a CMC purchase is justified by send volume. Purchase from Entrust or DigiCert, publish a BIMI DNS TXT record at `default._bimi.send.joinwannaapp.com` referencing the SVG + the CMC PEM, and Resend should pick it up automatically.

### Leaked-password protection — blocked on Supabase Pro upgrade
- **Why on hold:** Supabase only exposes the "Check passwords against haveibeenpwned.org" toggle on Pro and above. Surfaced by the Security Advisor as `auth_leaked_password_protection` warning.
- **When to revisit:** after upgrading the project to Supabase Pro. Toggle is in Dashboard → Authentication → Providers → Email. One click; protects users from credential-stuffing on signup / password reset.

### Google sign-in branded host — blocked on Supabase Pro upgrade
- **Why on hold:** Google's OAuth account picker currently shows "Choose an account to continue to **ymztxrpkhenbcbjjfbxr.supabase.co**" — Google's UX surfaces the redirect host, not the OAuth consent-screen App Name. The fix is to configure a **custom auth domain** on Supabase (Pro plan, ~$25/mo add-on) so the redirect host becomes `auth.joinwannaapp.com` (or similar) and the picker reads "...continue to **joinwannaapp.com**" instead.
- **What's already done:** consent-screen branding is fully configured — App name "Wanna", wanna avatar logo, home / privacy / terms URLs all set in Google Cloud Console.
- **When to revisit:** after upgrading to Supabase Pro. Configure custom auth domain via Dashboard → Settings → Authentication; add `auth.joinwannaapp.com` CNAME at Namecheap; update Google OAuth client's authorized redirect URIs to the new host; re-test.

---

## 🟢 Nice-to-have / post-MVP

### Web mod dashboard
- **What:** A separate web admin app for moderation at production scale.
- **Why deferred:** The in-app **Mod tab** (gated by `profiles.is_moderator`) covers all current needs — Reports, Photo flags, and Verifications queues with full action support. A web dashboard is nice-to-have for scale but not blocking.
  - **Convert the moderation guide to PDF.** The canonical Markdown lives at `docs/MODERATION_GUIDE.md`. To hand it to non-developer moderators, export it as a PDF and distribute (e.g. via a Drive link or attached to the moderator's onboarding email). Easiest path: open the file in VS Code with a Markdown PDF extension installed, or `brew install pandoc && pandoc docs/MODERATION_GUIDE.md -o moderation-guide.pdf`. Re-export whenever the in-app modal flow changes meaningfully.

---

## ✅ Already configured (for reference)

> A new dev joining the team can read this top-to-bottom and know what's
> live in production today. Items group by feature area, not by when
> they were built. The 🔴 / 🟡 / 🟢 sections above cover what's still
> open.

### Infrastructure
- **Supabase project:** `https://ymztxrpkhenbcbjjfbxr.supabase.co`. 10 tables with RLS policies, triggers, the `get_feed` RPC + 12 supporting RPCs, and the standard set of extensions (`pg_cron`, `pg_net`, `vault`).
- **Storage buckets:** `profile-photos` and `verification-selfies` (both private, 10MB limit). Public assets bucket `assets` for shared images (wordmark, avatars, gradient PNG).
- **GitHub:** `wanna-app/wanna-dev-v1` (`averydella` has push access). CI runs `npx tsc --noEmit` against `app/` on every push to `main` and every PR (`.github/workflows/ci.yml`).
- **Hosting (web):** Netlify hosts the email-prefs static page at `notifications.joinwannaapp.com`. Domain `joinwannaapp.com` is registered with Namecheap; DNS lives at Namecheap with a CNAME pointing the subdomain at Netlify. SSL auto-provisions.
- **Database connection:** `aws-1-us-east-1.pooler.supabase.com` (port 5432 session, 6543 transaction).

### Auth
- **Custom SMTP via Resend** for all auth-issued mail (confirmation / reset / magic-link). `smtp.resend.com:465`, sender `noreply@send.joinwannaapp.com` ("Wanna"). The Resend domain `send.joinwannaapp.com` is verified. Bounces go against Resend's deliverability metrics, not Supabase's shared mailer.
- **Apple Hide-My-Email forwarding verified end-to-end.** `send.joinwannaapp.com` is registered as an Email Source in the Apple Developer portal (SPF-green), so Apple's private relay forwards transactional mail to users who chose "Hide My Email" at signup. New domains may land in spam initially — pure reputation, improves with engagement.
- **Email confirmation required on signup.** The `handle_new_user` trigger creates a `profiles` row in lockstep with the `auth.users` insert; explicit `search_path` so it works under `supabase_auth_admin` (migrations `00007` + `00008`).
- **Sign-in providers verified end-to-end on real iPhone via dev build:** Google OAuth, Apple Sign-In, and email/password all create `auth.users` + `profiles` rows correctly. Native wiring in `WelcomeScreen.tsx` uses `expo-linking`'s `wanna://auth-callback` deep link.
- **Supabase Auth URL config:** Site URL set to `https://joinwannaapp.com`; Redirect Allowlist contains `wanna://**`. Without the wildcard entry, Supabase silently falls back to Site URL after OAuth and Safari errors with "couldn't connect to the server."
- **Google consent-screen branding done:** App name `Wanna`, wanna avatar logo, home/privacy/terms URLs set. The `supabase.co` redirect host stays visible in the Google account picker (Google's security UX) until we either pay for Supabase Pro's custom auth domain (~$25/mo) or stand up a redirect proxy on `joinwannaapp.com`. Both deferred to launch.
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
- **Credentials.** EAS project `@wanna-dev/wanna` (id `f758a37f-b306-4bb5-9e06-ad6dee438066`). iOS APNs `.p8` uploaded; Apple Team registered. Android FCM v1 service-account key uploaded for Firebase project `wanna-app-484519`. iOS verified end-to-end on real hardware (interest / match / message pushes deliver + tap-route correctly). Android verification parked under ⏸️ On hold pending tester device.
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
- **Mixpanel** SDK wired with seed-user exclusion (events suppressed when `profile.is_seed = true`). Verified on-device: real-account events flow through; demo / seed accounts produce zero events.
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
