# Deferred / Manual Setup Tasks

> Single source of truth for everything that requires your hands (third-party
> account creation, secret management, dashboard clicks, etc.) before we can
> ship to real users. Claude maintains this file — ask anytime to "check the
> deferred log."

**Legend:** 🔴 blocking · 🟡 needed before launch · 🟢 nice-to-have · ⏸️ on hold

---

## 🔴 Blocking — App Store / Play Store submission cannot proceed without these

### Cloudflare Turnstile on auth forms
- **What:** Today the signup / signin endpoints rely on Supabase's default IP-based rate limit (~30 req/hr) and have no CAPTCHA. Credential-stuffing bots can hammer signin within that rate limit; bot accounts can sign up. Turnstile is Cloudflare's invisible CAPTCHA — supported natively by Supabase Auth.
- **Status:** Turnstile widget created on Cloudflare (site key `0x4AAAAAADWB31IDAXE7C1DV`, secret stored in Supabase vault). Hostname `joinwannaapp.com` added in Cloudflare. Supabase CAPTCHA toggle was briefly enabled but **is currently OFF** because the RN client wasn't passing `captchaToken` and email signup was completely broken (`captcha protection: request disallowed (no captcha_token found)`). Toggle must stay OFF until the client-side widget integration is shipped; otherwise email signup/signin/password-reset all fail.
- **Why this is harder for RN than for web:** Turnstile is web-first — it renders an iframe and requires a DOM. For React Native we have to host the widget on a small web page and embed it via WebView, then bridge the token back to RN via `postMessage`. Estimated ~2.5 hr focused work + ~30 min for a fresh `eas build`.
- **Roadmap:**
  1. **Phase 1 (~30 min) — Host the widget page.** Write `web/turnstile/index.html` rendering the Turnstile widget (sitekey `0x4AAAAAADWB31IDAXE7C1DV`); on success, call `window.parent.postMessage({type: 'turnstile-token', token})`. Add Netlify redirect rule. Two-repo sync: push to `wanna-dev-v1/web/turnstile/` AND `wanna-app/landing-page/turnstile/`. Verify at https://joinwannaapp.com/turnstile.
  2. **Phase 2 (~60 min) — RN WebView component.** Confirm `react-native-webview` is installed (Expo SDK 54 typically includes it). Build `<TurnstileWidget>` component: renders ~300×65px WebView pointed at the widget URL; listens for `onMessage` with the token; exposes `onToken(token: string)` callback; handles error/timeout/invisible variants. **New `eas build --profile development --platform ios` required** if the WebView module needs a native rebuild.
  3. **Phase 3 (~45 min) — Auth form integration.** Update `WelcomeScreen.tsx` (or wherever signup/signin lives): show `<TurnstileWidget>` when the form is ready to submit; disable Create-Account / Sign-In buttons until token arrives; pass token via `supabase.auth.signUp({ ..., options: { captchaToken } })` and the same for `signInWithPassword` and `resetPasswordForEmail`. Google + Apple OAuth flows don't need the token — Supabase only enforces CAPTCHA on password-based flows.
  4. **Phase 4 (~15 min) — Re-enable + test.** Flip Supabase Dashboard → Authentication → Attack Protection → "Enable Captcha protection" toggle back ON. Test email signup / email signin / password reset on the dev build. Verify Google + Apple OAuth still work unaffected.
- **Alternative to consider before starting:** for an iOS-only app pre-launch, **Apple App Attest** is a more native fit than Turnstile — purpose-built for validating that requests come from a genuine unmodified copy of your iOS app. Worth a 30-min comparison before committing to the Turnstile roadmap above. If App Attest wins, we keep the Turnstile setup parked for when a web signup flow exists.

### Stale service_role key in vault — `auto-unban-hourly` cron returning 401s ✅ FIX APPLIED (pending greenlight)
**Status:** Root cause was the project's JWT signing secret was rotated, invalidating all previously-issued JWT keys. Edge functions were also deployed with default `verify_jwt=true`, blocking pg_net callers. Resolution: redeployed `auto-unban`, `send-email`, `moderate-user`, `notify-account-state` (and `cleanup-deactivated-accounts` if applicable) with `--no-verify-jwt`; legacy JWT service_role key stored in vault so function internal role-decode still works. Manual test fire returned `200 {"status":"ok","unbanned":0}`. Pending: verify next `:00 UTC` cron tick logs `200` in `net._http_response`, then user greenlight to remove from DEFERRED.

---

<details><summary>Original investigation notes (kept until greenlight)</summary>
- **What:** The hourly `auto-unban-hourly` pg_cron job calls `send-email` via `pg_net` with an `Authorization: Bearer <get_service_role_key()>` header, where `get_service_role_key()` reads from `vault.secrets`. Every hour at `:00` it's logging `401 unauthorized` in `net._http_response` (confirmed via SQL Editor query of `net._http_response`). The key stored in the vault no longer matches the project's current valid service_role key (likely rotated at some point and the vault entry was never refreshed). Same key is read by `cleanup-deactivated-accounts` cron, so that job is silently failing too. Impact: temp-banned users are NOT being auto-unbanned on schedule; deactivated accounts are NOT being cleaned up. Both are user-visible failures pre-launch.
- **What to do:**
  1. Supabase Dashboard → **Project Settings → API Keys** → copy the current `service_role` `secret` key.
  2. In SQL Editor, compare prefixes:
     ```sql
     SELECT substring(decrypted_secret, 1, 20) FROM vault.decrypted_secrets WHERE name = 'service_role_key';
     ```
     If it differs from the first 20 chars of the dashboard key, run:
     ```sql
     SELECT vault.update_secret(
       (SELECT id FROM vault.secrets WHERE name = 'service_role_key'),
       'PASTE_CURRENT_SERVICE_ROLE_KEY_HERE'
     );
     ```
  3. Wait for the next `:00` UTC tick and re-query `net._http_response` — expect `status_code = 200` from `auto-unban-hourly` going forward.
  4. Also check Project Settings → API Keys for any "legacy JWT keys deprecated" banner — Supabase's new publishable/secret API key format may require updating the vault entry to the new secret key format and updating consumers.
</details>

### MFA / TOTP support
- **What:** Users with high-stakes accounts (moderators, eventually paying users) can't add a second factor today. Supabase MFA is available on free tier via the API.
- **What to do:** add a Settings → Security screen with "Add authenticator app" enrollment (Supabase generates the TOTP secret + QR code); update signin flow to prompt for the code if MFA is enabled on the account. ~2 hr.

---

## 🟡 Needed before launch

### Mixpanel funnel definitions
- **What:** Mixpanel is collecting events but no funnels are saved. Week 1 of launch you want to see signup → first activity posted → first swipe → first match → first message drop-off at a glance.
- **What to do:** in Mixpanel → Boards / Funnels → define the activation funnel + the engagement funnel. ~30 min.

### Sub-processor DPAs — verify formal acceptance
- **What:** Privacy Policy declares we have data processing agreements with our sub-processors. GDPR posture is tighter if we've actively accepted each.
- **Signed / accepted (records on file):**
  - ✅ Supabase
  - ✅ Sentry
  - ✅ OpenAI
- **Awaiting countersigned copy:**
  - ⏳ Mixpanel
  - ⏳ Resend
  - ⏳ Google Cloud
  - ⏳ Expo
- **What to do:** keep tracking inbound replies. Save each reply + countersigned PDF under `legal/dpas/<vendor>/`. Close out once all four respond.

### Google OAuth consent screen — swap support email
- **What:** Privacy + Terms URLs are set correctly in Google Cloud Console → Google Auth Platform → Branding (`https://www.joinwannaapp.com/privacy` and `https://www.joinwannaapp.com/terms`). With just `email` + `profile` scopes, Google doesn't show these on the standard consent dialog — but they're configured for any cases where Google does surface them and for future OAuth verification.
- **Remaining step:** swap the User support email from `me@averydella.com` to `support@joinwannaapp.com`. Requires either adding `support@joinwannaapp.com` as a verified alternate email on the Google account (https://myaccount.google.com → Personal info → Contact info → Email → Alternate emails), OR creating a Google Group with that address with you as owner. After verification, return to Google Cloud Console → APIs & Services → OAuth consent screen → Edit App → set User support email = `support@joinwannaapp.com`.

### Login alert email — smoke test
- **What:** Login-alert pipeline shipped (migration `00056` + `send-email`'s `login_alert` template). Triggers on novel device sign-ins (new user_agent + ip not seen for that user in the last 30 days).
- **What to do:** verify end-to-end by signing in from a "novel" context — e.g., a desktop browser session OR a different network OR after clearing cookies. Confirm an alert email arrives with: real-looking device label, IP in the Location field, working Reset Password link (should open Supabase's hosted recovery page). Also verify NO alert fires on repeat sign-ins from the same device + network.

### Apple OAuth consent screen — verify Privacy + Terms URLs ✅ VERIFIED (pending greenlight)
- **What:** Apple Developer Console checked. App ID `com.joinwannaapp.wanna` has Sign in with Apple enabled as a primary capability, no Service ID needed (Service IDs are only required for web-based Sign in with Apple; native iOS doesn't need one). Apple's native Sign in with Apple sheet doesn't surface Privacy/Terms URLs at the App ID level — there are no fields in the Apple Developer Console for them on the native flow.
- **Where the URLs actually surface for Apple users:** App Store Connect → My Apps → Wanna → App Information → "Privacy Policy URL" + App Privacy questionnaire. Both happen at TestFlight / App Store submission time, not now. Tracked indirectly by the App Store submission workflow.
- **What to do:** nothing further on the Apple Developer Console side. Confirm with user before removing this entry.

### Native iOS Calendar write — verify on dev build
- **What:** `expo-calendar` one-tap calendar write is wired in the action sheet ("Save to Calendar"). Worked-around for Expo Go by falling back to the `.ics` share sheet, but the native path was untestable until the dev build. Dev build now exists, so this needs on-device verification.
- **What to do:** in the dev build, find a match where calendar add is available (Who's In accept, MatchModal, or ActivityDetail for non-owner with active match) → tap "Add to calendar" → choose "Save to Calendar" → confirm iOS Calendar prompts for permission → confirm event appears in iOS Calendar with the right title / date / time / location. ~10 min.

### Community Guidelines doc
- **What:** Terms of Service references a separate Community Guidelines document that describes acceptable conduct on the platform in plain language (vs. the more legalese ToS). Apple + Google reviewers look for this on user-generated-content apps; users also benefit from a clear, readable reference for what's allowed.
- **What to do:** write a `community-guidelines/index.html` page in the same style as `web/privacy/` — short, plain-English sections covering: respectful conduct, no harassment / threats / hate speech, identity authenticity (no impersonation / fake profiles), no commercial spam / solicitation, age requirements (18+), in-person safety reminders, reporting process, and consequences (warning → content removal → temp ban → permanent ban — mirroring the in-app `mod_resolve_report` flow). Host alongside the privacy policy via the `landing-page` repo at `joinwannaapp.com/community-guidelines`. ~1–2 hr to draft + style.

---

## ⏸️ On hold — blocked on something outside our control

> Items we've intentionally parked, **grouped by what's blocking them**.
> Each group is unblocked by a single external milestone or gate —
> when the gate clears, address everything in that group together.

### Blocked on: Supabase Pro upgrade (~$25/mo)
Both of the below unlock the moment the project flips to Pro. Plan to do them as a single sitting after the upgrade.

- **Leaked-password protection.** Supabase only exposes the "Check passwords against haveibeenpwned.org" toggle on Pro and above. Surfaced by the Security Advisor as `auth_leaked_password_protection` warning. *Action:* Dashboard → Authentication → Providers → Email → "Prevent use of leaked passwords". One click. Protects users from credential-stuffing on signup / password reset.
- **Google sign-in branded host.** Google's OAuth account picker currently shows "Choose an account to continue to **ymztxrpkhenbcbjjfbxr.supabase.co**" — Google's UX surfaces the redirect host, not the OAuth consent-screen App Name. Fix: configure a **custom auth domain** so the redirect host becomes `auth.joinwannaapp.com`. Consent-screen branding (App name "Wanna", logo, home/privacy/terms URLs) is already done. *Action after Pro:* Dashboard → Settings → Authentication → custom auth domain → set `auth.joinwannaapp.com` → add CNAME at Namecheap → update Google OAuth client's authorized redirect URIs to the new host → re-test.

### Blocked on: TestFlight / App Store availability
Items only meaningful once the app is installable from a public store.

- **"Open Wanna" deep-link in email.** The welcome email's "Open Wanna" CTA points at `https://joinwannaapp.com` (marketing landing page) for now. A Universal Link only opens the app when the app is **installed on the device** — which won't be true for real users until we're at least on TestFlight. *Already done:* Universal Links scaffold is fully written in `web/` (apple-app-site-association with Apple Team ID `J442U4M7JC` and bundle ID `com.joinwannaapp.wanna` filled in; assetlinks.json template; netlify.toml content-type forcing; branded landing page in `web/open/index.html` with App Store / Play Store badge slots). *Action alongside TestFlight submission:*
  1. Drop in Android SHA-256 fingerprint in `web/.well-known/assetlinks.json` (from expo.dev → Credentials → Android Build Credentials).
  2. Deploy `web/` as a second Netlify project; point `joinwannaapp.com` apex at it.
  3. Add `associatedDomains: ["applinks:joinwannaapp.com"]` to `app/app.json` under the `ios` key + matching Android `intentFilters` with `autoVerify: true`.
  4. Run a fresh `eas build --profile development --platform ios` (and Android) so the entitlement is provisioned.
  5. Flip `APP_URL` in `supabase/functions/send-email/index.ts` from `https://joinwannaapp.com` to `https://joinwannaapp.com/open`.

### Blocked on: Android tester device purchase (~$80–100)
- **Firebase Cloud Messaging on Android verification.** FCM v1 push delivery can't be reliably verified on the Android emulator (the default image has no Google Play Services; the Play-flavored image is flaky for push). A real Android device is required. *Already done:* Firebase project `wanna-app-484519` created; service account key uploaded to Expo for FCM v1; `device_tokens` table + `send-push` edge function fully wired; `usePushRegistration` hook handles registration/unregistration on auth. *Action after buying device (used Pixel 4a or Pixel 5 on Swappa / eBay; Wi-Fi only, no SIM needed):*
  1. Re-link the FCM v1 service account key to the new `com.joinwannaapp.wanna` package — runbook at [`docs/FIREBASE_ANDROID_RELINK.md`](docs/FIREBASE_ANDROID_RELINK.md).
  2. `eas build --profile development --platform android` and install on the test device.
  3. Sign in, confirm `device_tokens` gets a row with `platform = 'android'`.
  4. Trigger pushes from another account (interest / match / message / meetup) — confirm receipt on the device.

### Blocked on: Supabase legacy JWT key deprecation deadline
- **Migrate cron jobs + pg_net callers off the legacy JWT service_role key.** Supabase has moved to a new API key format (`sb_secret_...`); the legacy JWT-format service_role key (`eyJ...`) is currently still issued under "Legacy JWT-based API keys" in Project Settings → API Keys, but will be deprecated on a future date Supabase announces. Today our pg_cron jobs (`auto-unban-hourly`, `cleanup-deactivated-accounts`) call `pg_net.http_post` with `Authorization: Bearer ' || public.get_service_role_key()` where the function returns the JWT from `vault.secrets`. When the legacy JWT key stops working, all cron-driven edge function calls will start failing with `UNAUTHORIZED_INVALID_JWT_FORMAT`. *Action when Supabase announces deprecation date:* (1) update `get_service_role_key()` to return the new `sb_secret_...` key, (2) update edge function gateway config or call patterns so the new key format is accepted, (3) audit all `pg_net` callers across migrations for the same pattern, (4) re-verify all cron jobs successfully log `200`s in `net._http_response`.

### Blocked on: CMC budget (~$1k/yr)
- **Sender avatar in recipients' inboxes (BIMI).** The only path Resend supports for sender-avatar branding in Gmail / Apple Mail / Outlook is BIMI, which requires either a VMC (~$1.5k/yr, needs a registered trademark) or a CMC (~$1k/yr, works for unregistered / common-law marks). Neither is in budget pre-launch. *Already done:* square logo SVG / PNG is staged at `https://ymztxrpkhenbcbjjfbxr.supabase.co/storage/v1/object/public/assets/wanna_avatar.png` for the day we revive this. *Action after launch when send volume justifies a CMC:* purchase from Entrust or DigiCert, publish a BIMI DNS TXT record at `default._bimi.send.joinwannaapp.com` referencing the SVG + the CMC PEM, and Resend should pick it up automatically.
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
- **DMCA designated agent registered** with the US Copyright Office. Gives Wanna DMCA safe harbor protection — rightsholders send copyright takedown notices to our registered agent, we action them, we're shielded from liability. The agent contact is referenced in the Terms of Service's copyright section. Renew at the Copyright Office every 3 years to keep registration active.

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
- **Native iOS Calendar write.** Action sheet on "Add to calendar" gives a "Save to Calendar" option that calls `expo-calendar` to write directly. Falls back to `.ics` when `expo-calendar` isn't loaded or permission is denied. Native path requires the custom dev build (now available) — in-app verification pending (🟡 above).

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
