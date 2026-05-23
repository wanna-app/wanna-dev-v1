// Edge function: send a transactional email via Resend.
//
// Three template types, each with sender authorization checks similar
// to send-push:
//   - match           — the poster who just accepted notifies both parties
//   - interest        — the swiper who liked notifies the activity owner
//   - meetup_check    — system reminder (callable by anyone tied to the match)
//
// Skips:
//   - profile.is_seed = true                       (PRD AC-SD-06)
//   - profile.is_active = false                    (deactivated users)
//   - profile.email_notifications_enabled = false  (opt-out)
//   - debounce per (recipient, template, context_id) to avoid spam
//
// All sends go via Resend. Sender is noreply@send.joinwannaapp.com.
//
// Deploy: supabase functions deploy send-email
// Secret: supabase secrets set RESEND_API_KEY=...

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { signEmailPrefsToken } from "../_shared/email-prefs-token.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const EMAIL_PREFS_SECRET = Deno.env.get("EMAIL_PREFS_SECRET") ?? "";
const RESEND_FROM = "Wanna <noreply@send.joinwannaapp.com>";
// Points at the marketing landing page until the app is live in TestFlight
// / the App Store. At that point this should flip to
// "https://joinwannaapp.com/open" and the Universal Link manifests in web/
// take over — tap from a phone with the app installed deep-links into
// the app; tap without the app shows the landing page with store badges.
const APP_URL = "https://joinwannaapp.com";
// Manage-prefs / unsubscribe links in every email point at the
// Cloudflare-hosted static page (notifications.joinwannaapp.com),
// not the Supabase Edge function. The supabase-hosted email-prefs
// HTML page is unreachable in browsers because the gateway adds a
// CSP sandbox header on public function responses; the static
// page on Cloudflare doesn't have that constraint and talks to
// email-prefs-api (JSON-only) for the actual reads/writes.
const EMAIL_PREFS_BASE_URL = "https://notifications.joinwannaapp.com";

// Debounce windows per template (per recipient, per context_id)
const DEBOUNCE_MS: Record<string, number> = {
  interest: 24 * 60 * 60 * 1000,    // 1 per activity per 24h
  match: Number.POSITIVE_INFINITY,  // exactly 1 per match, ever
  meetup_check: 7 * 24 * 60 * 60 * 1000, // weekly nudge max
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// =============================================================================
// Templates — keep them inline so we can iterate without a separate package.
// HTML is intentionally minimal: brand purple buttons, clear hierarchy,
// safe across mail clients.
// =============================================================================

const PURPLE = "#8C52FF";
const CHARCOAL = "#2D2D3A";
const SLATE = "#B0B0B8";

interface FooterLinks {
  manage_url: string;
  unsubscribe_url: string;
}
function layout(title: string, body: string, links: FooterLinks): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>${title}</title></head>
<body style="margin:0;padding:0;background:#F5F5F7;font-family:Helvetica,Arial,sans-serif;color:${CHARCOAL};">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F5F5F7;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background:#FFF;border-radius:16px;overflow:hidden;">
        <tr><td style="padding:24px 32px 8px;">
          <div style="font-weight:900;font-size:28px;letter-spacing:-1px;color:${PURPLE};">wanna</div>
        </td></tr>
        <tr><td style="padding:8px 32px 32px;line-height:1.5;font-size:16px;">${body}</td></tr>
        <tr><td style="padding:16px 32px;background:#FAFAFB;color:${SLATE};font-size:12px;text-align:center;line-height:1.6;">
          You're receiving this email because of your Wanna notification settings.<br>
          <a href="${links.manage_url}" style="color:${SLATE};text-decoration:underline;">Manage email preferences</a>
          &nbsp;·&nbsp;
          <a href="${links.unsubscribe_url}" style="color:${SLATE};text-decoration:underline;">Unsubscribe from all</a>
          &nbsp;·&nbsp;
          <a href="https://www.joinwannaapp.com/privacy" style="color:${SLATE};text-decoration:underline;">Privacy policy</a><br>
          Account and security emails (password resets, confirmations) always send regardless of these settings.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function btn(label: string, href: string): string {
  return `<a href="${href}" style="display:inline-block;background:${PURPLE};color:#FFF;text-decoration:none;font-weight:700;padding:14px 24px;border-radius:999px;">${label}</a>`;
}

interface MatchTplParams {
  match_id: string;
  recipient_first_name: string;
  other_first_name: string;
  activity_title: string;
  links: FooterLinks;
}
function matchTemplate(p: MatchTplParams) {
  const subject = `It's a match with ${p.other_first_name}!`;
  const html = layout(
    subject,
    `<h1 style="margin:0 0 16px;font-size:24px;color:${CHARCOAL};">It's a match!</h1>
     <p style="margin:0 0 12px;">Hey ${p.recipient_first_name} — you and <strong>${p.other_first_name}</strong> matched for <strong>"${p.activity_title}"</strong>.</p>
     <p style="margin:0 0 24px;color:${SLATE};">Open the app to say hi and lock in plans.</p>
     ${btn("Open Wanna", "wanna://matches")}`,
    p.links,
  );
  return { subject, html };
}

interface InterestTplParams {
  activity_id: string;
  recipient_first_name: string;
  interested_first_name: string;
  activity_title: string;
  links: FooterLinks;
}
function interestTemplate(p: InterestTplParams) {
  const subject = `${p.interested_first_name} is in for "${p.activity_title}"!`;
  const html = layout(
    subject,
    `<h1 style="margin:0 0 16px;font-size:24px;color:${CHARCOAL};">Someone wants to join</h1>
     <p style="margin:0 0 12px;">Hey ${p.recipient_first_name} — <strong>${p.interested_first_name}</strong> just expressed interest in your activity <strong>"${p.activity_title}"</strong>.</p>
     <p style="margin:0 0 24px;color:${SLATE};">Open Who's In to swipe through who wants to join.</p>
     ${btn("Open Who's In", "wanna://whos-in")}`,
    p.links,
  );
  return { subject, html };
}

interface MeetupTplParams {
  match_id: string;
  recipient_first_name: string;
  other_first_name: string;
  activity_title: string;
  links: FooterLinks;
}
function meetupTemplate(p: MeetupTplParams) {
  const subject = `Did you meet up with ${p.other_first_name}?`;
  const html = layout(
    subject,
    `<h1 style="margin:0 0 16px;font-size:24px;color:${CHARCOAL};">Quick check-in</h1>
     <p style="margin:0 0 12px;">Hey ${p.recipient_first_name} — did you and <strong>${p.other_first_name}</strong> get together for <strong>"${p.activity_title}"</strong>?</p>
     <p style="margin:0 0 24px;color:${SLATE};">A quick yes/no helps us understand which matches turn into real plans.</p>
     ${btn("Open Wanna", "wanna://")}`,
    p.links,
  );
  return { subject, html };
}

// =============================================================================
// Welcome — first marketing email, sent on email confirmation.
// HTML embedded verbatim from /tmp/welcome_email.html with placeholders:
//   {{ .FirstName }}, {{ .AppURL }}, {{ .ManagePreferencesURL }},
//   {{ .UnsubscribeURL }}
// =============================================================================
const WELCOME_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Welcome to Wanna</title>
</head>
<body style="margin:0;padding:0;background-color:#8C52FF;-webkit-font-smoothing:antialiased;">


<!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:linear-gradient(165deg,#8C52FF 0%,#57B8D0 100%);">

  <!-- Top spacer with wordmark image -->
  <tr>
    <td align="center" style="padding:60px 20px 32px 20px;">
      <img src="https://ymztxrpkhenbcbjjfbxr.supabase.co/storage/v1/object/public/assets/wanna_wordmark_white.png" alt="wanna" width="200" style="display:block;width:200px;height:auto;font-family:'VAG Rounded Next Bold','Nunito',Helvetica,Arial,sans-serif;font-size:28px;font-weight:700;color:#FFFFFF;letter-spacing:1px;" />
    </td>
  </tr>

  <!-- White card -->
  <tr>
    <td align="center" style="padding:0 20px 24px 20px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#FFFFFF;border-radius:20px;overflow:hidden;">

        <!-- Body copy -->
        <tr>
          <td style="padding:40px 44px;">
            <p style="margin:0 0 16px 0;font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:26px;color:#2D2D3A;">
              Hi {{ .FirstName }},
            </p>
            <p style="margin:0 0 16px 0;font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:26px;color:#2D2D3A;">
              Welcome to <strong>Wanna</strong>! We're so glad you're here.
            </p>
            <p style="margin:0 0 16px 0;font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:26px;color:#2D2D3A;">
              Wanna started from a simple idea: the best way to meet people isn't through a profile photo — it's by doing something you both actually want to do. A concert. A morning hike. Trying that restaurant you keep seeing on social media.
            </p>
            <p style="margin:0 0 16px 0;font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:26px;color:#2D2D3A;">
              On Wanna, you post the things you wanna do, other people swipe on the plans they wanna join, and when there's a match, you make it happen. Friendship is the default; dating and networking are there if you want them.
            </p>
            <p style="margin:0 0 12px 0;font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:26px;color:#2D2D3A;">
              A few tips for getting the most out of Wanna:
            </p>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px 0;">
              <tr>
                <td width="24" valign="top" style="font-family:Helvetica,Arial,sans-serif;font-size:22px;line-height:26px;color:#2D2D3A;">&#8226;</td>
                <td style="font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:26px;color:#2D2D3A;padding-bottom:8px;">Post an activity this week, even if it's something small — coffee, a walk, a movie. Activity posts are how people find you.</td>
              </tr>
              <tr>
                <td width="24" valign="top" style="font-family:Helvetica,Arial,sans-serif;font-size:22px;line-height:26px;color:#2D2D3A;">&#8226;</td>
                <td style="font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:26px;color:#2D2D3A;padding-bottom:8px;">Swipe on what catches your eye. See something you wanna join? Swipe right and you'll land in the poster's "Who's In" queue.</td>
              </tr>
              <tr>
                <td width="24" valign="top" style="font-family:Helvetica,Arial,sans-serif;font-size:22px;line-height:26px;color:#2D2D3A;">&#8226;</td>
                <td style="font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:26px;color:#2D2D3A;padding-bottom:8px;">Fill out your profile. A bio + the optional stuff (profession, university, what you're into) helps the right people swipe right.</td>
              </tr>
              <tr>
                <td width="24" valign="top" style="font-family:Helvetica,Arial,sans-serif;font-size:22px;line-height:26px;color:#2D2D3A;">&#8226;</td>
                <td style="font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:26px;color:#2D2D3A;">Verify your photos. Verified profiles match more often, and it makes the whole community feel safer.</td>
              </tr>
            </table>

            <p style="margin:0 0 16px 0;font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:26px;color:#2D2D3A;">
              One important note: all Wanna meetups happen in public spaces. The rest is up to you.
            </p>
            <p style="margin:0 0 16px 0;font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:26px;color:#2D2D3A;">
              So... what do you wanna do?
            </p>
            <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:26px;color:#2D2D3A;">
              — The Wanna team
            </p>
          </td>
        </tr>

        <!-- CTA -->
        <tr>
          <td align="center" style="padding:0 44px 40px 44px;">
            <!--[if mso]>
            <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="{{ .AppURL }}" style="height:48px;width:260px;v-text-anchor:middle;" arcsize="50%" fillcolor="#8C52FF">
              <w:anchorlock/>
              <center style="color:#FFFFFF;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:700;">Open Wanna</center>
            </v:roundrect>
            <![endif]-->
            <!--[if !mso]><!-->
            <a href="{{ .AppURL }}" target="_blank" style="display:inline-block;padding:14px 48px;background-color:#8C52FF;color:#FFFFFF;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:700;text-decoration:none;border-radius:24px;mso-hide:all;">Open Wanna</a>
            <!--<![endif]-->
          </td>
        </tr>

      </table>
    </td>
  </tr>

  <!-- Footer on gradient bg -->
  <tr>
    <td align="center" style="padding:0 20px 12px 20px;">
      <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:11px;line-height:16px;color:rgba(255,255,255,0.6);text-align:center;">
        This is an automated message — please do not reply to this email.
      </p>
    </td>
  </tr>
  <tr>
    <td align="center" style="padding:0 20px 48px 20px;">
      <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:11px;line-height:16px;color:rgba(255,255,255,0.6);text-align:center;">
        You're receiving this because you signed up for Wanna.<br/>
        <a href="{{ .ManagePreferencesURL }}" style="color:rgba(255,255,255,0.8);text-decoration:underline;">Manage email preferences</a>&nbsp;&nbsp;&#183;&nbsp;&nbsp;<a href="{{ .UnsubscribeURL }}" style="color:rgba(255,255,255,0.8);text-decoration:underline;">Unsubscribe</a>&nbsp;&nbsp;&#183;&nbsp;&nbsp;<a href="https://www.joinwannaapp.com/privacy" style="color:rgba(255,255,255,0.8);text-decoration:underline;">Privacy policy</a>
      </p>
    </td>
  </tr>

</table>
<!--[if mso]></td></tr></table><![endif]-->

</body>
</html>`;

interface WelcomeTplParams {
  first_name: string;
  app_url: string;
  manage_url: string;
  unsubscribe_url: string;
}
function welcomeTemplate(p: WelcomeTplParams) {
  const subject = "Welcome to Wanna";
  const html = WELCOME_HTML
    .replaceAll("{{ .FirstName }}", escapeHtml(p.first_name || "there"))
    .replaceAll("{{ .AppURL }}", p.app_url)
    .replaceAll("{{ .ManagePreferencesURL }}", p.manage_url)
    .replaceAll("{{ .UnsubscribeURL }}", p.unsubscribe_url);
  return { subject, html };
}

interface OnboardingIncompleteTplParams {
  first_name: string;
  app_url: string;
  manage_url: string;
  unsubscribe_url: string;
}
// Short, focused activation nudge — fires once when a user has signed
// up but hasn't completed onboarding (no profile photos) within ~24h.
// Marketing-class email (gated by marketing_emails_enabled).
function onboardingIncompleteTemplate(p: OnboardingIncompleteTplParams) {
  const subject = "Finish setting up your Wanna profile";
  const name = escapeHtml(p.first_name || "there");
  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8" /></head>
<body style="margin:0;padding:0;background-color:#F5F4F8;font-family:Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F5F4F8;">
    <tr><td align="center" style="padding:40px 20px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#FFFFFF;border-radius:16px;padding:40px 36px;">
        <tr><td>
          <p style="margin:0 0 16px 0;font-size:20px;font-weight:700;color:#2D2D3A;">Hey ${name},</p>
          <p style="margin:0 0 16px 0;font-size:16px;line-height:24px;color:#2D2D3A;">
            You started setting up Wanna but didn't quite finish. Your profile is two steps away from going live: add a photo and post your first activity. Once those are done, people in your area can start swiping in.
          </p>
          <p style="margin:0 0 24px 0;font-size:16px;line-height:24px;color:#2D2D3A;">
            Takes about 2 minutes. Pick up where you left off below.
          </p>
          <p style="margin:0 0 24px 0;text-align:center;">
            <a href="${p.app_url}" target="_blank" style="display:inline-block;padding:14px 40px;background-color:#8C52FF;color:#FFFFFF;font-size:16px;font-weight:700;text-decoration:none;border-radius:24px;">Finish my profile</a>
          </p>
          <p style="margin:0;font-size:16px;line-height:24px;color:#2D2D3A;">
            — The Wanna team
          </p>
        </td></tr>
      </table>
      <p style="margin:24px 0 0 0;font-size:11px;color:#888;text-align:center;line-height:16px;">
        You're receiving this because you signed up for Wanna.<br/>
        <a href="${p.manage_url}" style="color:#888;">Manage email preferences</a> &middot;
        <a href="${p.unsubscribe_url}" style="color:#888;">Unsubscribe</a>
      </p>
    </td></tr>
  </table>
</body></html>`;
  return { subject, html };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// =============================================================================
// Resend HTTP call
// =============================================================================
async function sendViaResend(
  to: string,
  subject: string,
  html: string,
  unsubscribeUrl: string,
): Promise<{ id: string | null; error: string | null }> {
  if (!RESEND_API_KEY) {
    return { id: null, error: "RESEND_API_KEY not configured" };
  }
  // RFC 8058 native unsubscribe headers. Gmail / Apple Mail surface a
  // one-tap "Unsubscribe" button at the top of the email when these are
  // set; tapping it POSTs to unsubscribeUrl with the body
  // `List-Unsubscribe=One-Click` (handled by email-prefs).
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: [to],
      subject,
      html,
      headers: {
        "List-Unsubscribe": `<${unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    return {
      id: null,
      error: body?.message ?? `Resend HTTP ${res.status}`,
    };
  }
  return { id: body?.id ?? null, error: null };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// =============================================================================
// Request shape (one of three template payloads)
// =============================================================================
type SendEmailPayload =
  | { template: "match"; recipient_id: string; match_id: string }
  | { template: "interest"; recipient_id: string; activity_id: string }
  | { template: "meetup_check"; recipient_id: string; match_id: string }
  // Welcome is fired by the auth.users email_confirmed_at trigger using
  // the service role key — no per-user JWT, no context_id.
  | { template: "welcome"; recipient_id: string }
  // Onboarding-incomplete nudge. Fired by pg_cron for users who signed
  // up 24h+ ago and never finished onboarding (no photos uploaded).
  // Service-role only; dedupes via email_log.
  | { template: "onboarding_incomplete"; recipient_id: string };

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonResponse({ error: "POST only" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return jsonResponse({ error: "missing auth" }, 401);
  }
  const bearerToken = authHeader.slice("Bearer ".length).trim();
  // Decode the JWT role claim instead of string-comparing the bearer
  // to SUPABASE_SERVICE_ROLE_KEY. The vault-stored service role key
  // can drift from the runtime env var (key rotation, copy/paste
  // whitespace, etc.) and a string compare is brittle. The platform
  // already verified the JWT signature before our handler runs, so
  // trusting `role: "service_role"` here is safe.
  const isServiceRole = (() => {
    try {
      const parts = bearerToken.split(".");
      if (parts.length !== 3) return false;
      const payload = JSON.parse(atob(parts[1]));
      return payload?.role === "service_role";
    } catch {
      return false;
    }
  })();
  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Per-user templates need a real user JWT (caller authorization checks).
  // The welcome template is fired by a DB trigger with the service role
  // key — there is no caller user to authorize against.
  let callerId = "";
  if (!isServiceRole) {
    const { data: userData, error: userErr } = await anonClient.auth.getUser();
    if (userErr || !userData?.user) {
      return jsonResponse({ error: "invalid auth" }, 401);
    }
    callerId = userData.user.id;
  }

  let payload: SendEmailPayload;
  try {
    payload = (await req.json()) as SendEmailPayload;
  } catch {
    return jsonResponse({ error: "invalid JSON" }, 400);
  }

  const { template, recipient_id } = payload;
  if (!template || !recipient_id) {
    return jsonResponse({ error: "template and recipient_id required" }, 400);
  }

  // ---------- Authorization per template ----------
  let contextId: string;
  let templateData: { subject: string; html: string };

  // Recipient profile (admin client: cross-user reads are intentional).
  // Per-template email prefs come from the SettingsScreen matrix
  // (`profiles.notify_<template>_email`); we short-circuit below if the
  // recipient has the relevant flag turned off.
  const { data: recipientProfile } = await adminClient
    .from("profiles")
    .select(
      "first_name, is_seed, is_active, email_notifications_enabled, marketing_emails_enabled, notify_interest_email, notify_match_email, notify_message_email, notify_meetup_email, notify_new_activities_email"
    )
    .eq("id", recipient_id)
    .maybeSingle();
  if (!recipientProfile) {
    return jsonResponse({ error: "recipient not found" }, 404);
  }

  // Recipient email (from auth.users)
  const { data: recipientUser } = await adminClient.auth.admin.getUserById(
    recipient_id
  );
  const recipientEmail = recipientUser?.user?.email;
  if (!recipientEmail) {
    return jsonResponse({ error: "recipient has no email" }, 400);
  }

  // Per-recipient prefs URLs. The footer of every email points to these,
  // and the unsubscribe URL is what the RFC 8058 List-Unsubscribe header
  // resolves to (Gmail / Apple Mail one-tap unsubscribe).
  if (!EMAIL_PREFS_SECRET) {
    return jsonResponse({ error: "EMAIL_PREFS_SECRET not configured" }, 500);
  }
  const [manageToken, unsubToken] = await Promise.all([
    signEmailPrefsToken(EMAIL_PREFS_SECRET, recipient_id, "manage"),
    signEmailPrefsToken(EMAIL_PREFS_SECRET, recipient_id, "unsubscribe"),
  ]);
  const manageUrl = `${EMAIL_PREFS_BASE_URL}?token=${manageToken}`;
  const unsubscribeUrl = `${EMAIL_PREFS_BASE_URL}?token=${unsubToken}`;
  const footerLinks = { manage_url: manageUrl, unsubscribe_url: unsubscribeUrl };

  if (template === "match") {
    if (!("match_id" in payload) || !payload.match_id) {
      return jsonResponse({ error: "match_id required" }, 400);
    }
    contextId = payload.match_id;
    const { data: match } = await anonClient
      .from("matches")
      .select("activity_id, poster_id, interested_id")
      .eq("id", contextId)
      .maybeSingle();
    if (
      !match ||
      (match.poster_id !== callerId && match.interested_id !== callerId)
    ) {
      return jsonResponse({ error: "not authorized" }, 403);
    }
    if (recipient_id !== match.poster_id && recipient_id !== match.interested_id) {
      return jsonResponse({ error: "recipient not in match" }, 403);
    }
    const otherId =
      recipient_id === match.poster_id
        ? match.interested_id
        : match.poster_id;
    const [otherProfile, activity] = await Promise.all([
      adminClient.from("profiles").select("first_name").eq("id", otherId).maybeSingle(),
      adminClient.from("activities").select("title").eq("id", match.activity_id).maybeSingle(),
    ]);
    templateData = matchTemplate({
      match_id: contextId,
      recipient_first_name: recipientProfile.first_name,
      other_first_name: otherProfile.data?.first_name ?? "Someone",
      activity_title: activity.data?.title ?? "your activity",
      links: footerLinks,
    });
  } else if (template === "interest") {
    if (!("activity_id" in payload) || !payload.activity_id) {
      return jsonResponse({ error: "activity_id required" }, 400);
    }
    contextId = payload.activity_id;
    // Caller must have a like-direction swipe on this activity
    const { data: swipe } = await anonClient
      .from("swipes")
      .select("id")
      .eq("swiper_id", callerId)
      .eq("activity_id", contextId)
      .eq("direction", "like")
      .maybeSingle();
    if (!swipe) return jsonResponse({ error: "not authorized" }, 403);
    // Recipient must be the activity owner
    const { data: activity } = await anonClient
      .from("activities")
      .select("user_id, title")
      .eq("id", contextId)
      .maybeSingle();
    if (!activity || activity.user_id !== recipient_id) {
      return jsonResponse({ error: "recipient mismatch" }, 403);
    }
    const { data: caller } = await adminClient
      .from("profiles")
      .select("first_name")
      .eq("id", callerId)
      .maybeSingle();
    templateData = interestTemplate({
      activity_id: contextId,
      recipient_first_name: recipientProfile.first_name,
      interested_first_name: caller?.first_name ?? "Someone",
      activity_title: activity.title,
      links: footerLinks,
    });
  } else if (template === "meetup_check") {
    if (!("match_id" in payload) || !payload.match_id) {
      return jsonResponse({ error: "match_id required" }, 400);
    }
    contextId = payload.match_id;
    // Either party in the match can trigger this (handles self-send too)
    const { data: match } = await anonClient
      .from("matches")
      .select("poster_id, interested_id, activity_id")
      .eq("id", contextId)
      .maybeSingle();
    if (
      !match ||
      (match.poster_id !== callerId && match.interested_id !== callerId)
    ) {
      return jsonResponse({ error: "not authorized" }, 403);
    }
    if (recipient_id !== match.poster_id && recipient_id !== match.interested_id) {
      return jsonResponse({ error: "recipient not in match" }, 403);
    }
    const otherId =
      recipient_id === match.poster_id
        ? match.interested_id
        : match.poster_id;
    const [otherProfile, activity] = await Promise.all([
      adminClient.from("profiles").select("first_name").eq("id", otherId).maybeSingle(),
      adminClient.from("activities").select("title").eq("id", match.activity_id).maybeSingle(),
    ]);
    templateData = meetupTemplate({
      match_id: contextId,
      recipient_first_name: recipientProfile.first_name,
      other_first_name: otherProfile.data?.first_name ?? "your match",
      activity_title: activity.data?.title ?? "your activity",
      links: footerLinks,
    });
  } else if (template === "welcome") {
    // Marketing-class. Service-role only — fired by the auth.users
    // email_confirmed_at trigger. No per-user authorization, no
    // context id. We dedupe via email_log: if any prior sent welcome
    // exists for this recipient, skip.
    if (!isServiceRole) {
      return jsonResponse({ error: "not authorized" }, 403);
    }
    contextId = ""; // welcome has no context; email_log.context_id is nullable
    templateData = welcomeTemplate({
      first_name: recipientProfile.first_name,
      app_url: APP_URL,
      manage_url: manageUrl,
      unsubscribe_url: unsubscribeUrl,
    });
  } else if (template === "onboarding_incomplete") {
    // Fired by pg_cron, service-role only. Dedupes via email_log
    // (skip-side enforces exactly-once).
    if (!isServiceRole) {
      return jsonResponse({ error: "not authorized" }, 403);
    }
    contextId = "";
    templateData = onboardingIncompleteTemplate({
      first_name: recipientProfile.first_name,
      app_url: APP_URL,
      manage_url: manageUrl,
      unsubscribe_url: unsubscribeUrl,
    });
  } else {
    return jsonResponse({ error: "unknown template" }, 400);
  }

  // ---------- Skips ----------
  // email_log.context_id is uuid, so pass null when we don't have one
  // (welcome). Other templates always set a uuid contextId.
  const logContextId: string | null = contextId || null;
  const skip = (reason: string) => {
    void adminClient.from("email_log").insert({
      recipient_id,
      recipient_email: recipientEmail,
      template,
      context_id: logContextId,
      status: "skipped",
      reason,
    });
    return jsonResponse({ status: "skipped", reason });
  };

  if (recipientProfile.is_seed) return skip("seed user");
  if (!recipientProfile.is_active) return skip("inactive");

  if (template === "welcome" || template === "onboarding_incomplete") {
    // Both are marketing-class. Gated by marketing_emails_enabled.
    if ((recipientProfile as any).marketing_emails_enabled === false) {
      return skip("user_pref");
    }
    // Exactly-once-per-recipient.
    const { data: prior } = await adminClient
      .from("email_log")
      .select("id")
      .eq("recipient_id", recipient_id)
      .eq("template", template)
      .eq("status", "sent")
      .limit(1);
    if (prior && prior.length > 0) return skip("already sent");
  } else {
    // Notification-class skips
    if (!recipientProfile.email_notifications_enabled) return skip("opted out");

    // Per-template pref gate. The SettingsScreen matrix writes to these
    // columns; if the user turned the corresponding row's email switch off,
    // skip server-side regardless of who fired the call.
    const perTypePrefMap: Record<string, boolean> = {
      interest: (recipientProfile as any).notify_interest_email ?? true,
      match: (recipientProfile as any).notify_match_email ?? true,
      meetup_check: (recipientProfile as any).notify_meetup_email ?? true,
      // Future templates (no senders yet, but the column is the source
      // of truth for the prefs page so we honor it here too):
      message: (recipientProfile as any).notify_message_email ?? false,
      new_activities:
        (recipientProfile as any).notify_new_activities_email ?? false,
    };
    if (perTypePrefMap[template] === false) return skip("user_pref");

    // Debounce
    const window = DEBOUNCE_MS[template] ?? 0;
    if (window > 0 && Number.isFinite(window)) {
      const since = new Date(Date.now() - window).toISOString();
      const { data: recent } = await adminClient
        .from("email_log")
        .select("id")
        .eq("recipient_id", recipient_id)
        .eq("template", template)
        .eq("context_id", contextId)
        .eq("status", "sent")
        .gte("sent_at", since)
        .limit(1);
      if (recent && recent.length > 0) return skip("debounced");
    } else if (window === Number.POSITIVE_INFINITY) {
      // exactly-once-per-context (used for match)
      const { data: any_prior } = await adminClient
        .from("email_log")
        .select("id")
        .eq("recipient_id", recipient_id)
        .eq("template", template)
        .eq("context_id", contextId)
        .eq("status", "sent")
        .limit(1);
      if (any_prior && any_prior.length > 0) return skip("already sent");
    }
  }

  // ---------- Send ----------
  const { id: messageId, error: sendError } = await sendViaResend(
    recipientEmail,
    templateData.subject,
    templateData.html,
    unsubscribeUrl,
  );
  if (sendError) {
    await adminClient.from("email_log").insert({
      recipient_id,
      recipient_email: recipientEmail,
      template,
      context_id: logContextId,
      status: "failed",
      reason: sendError,
    });
    return jsonResponse({ status: "failed", error: sendError }, 502);
  }
  await adminClient.from("email_log").insert({
    recipient_id,
    recipient_email: recipientEmail,
    template,
    context_id: logContextId,
    status: "sent",
    resend_message_id: messageId,
  });
  return jsonResponse({ status: "sent", message_id: messageId });
});
