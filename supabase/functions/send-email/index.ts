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

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const RESEND_FROM = "Wanna <noreply@send.joinwannaapp.com>";

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

function layout(title: string, body: string): string {
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
        <tr><td style="padding:16px 32px;background:#FAFAFB;color:${SLATE};font-size:12px;text-align:center;">
          You're receiving this because you have email notifications on for Wanna. Manage in the app under Settings → Privacy.
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
}
function matchTemplate(p: MatchTplParams) {
  const subject = `It's a match with ${p.other_first_name}!`;
  const html = layout(
    subject,
    `<h1 style="margin:0 0 16px;font-size:24px;color:${CHARCOAL};">It's a match!</h1>
     <p style="margin:0 0 12px;">Hey ${p.recipient_first_name} — you and <strong>${p.other_first_name}</strong> matched for <strong>"${p.activity_title}"</strong>.</p>
     <p style="margin:0 0 24px;color:${SLATE};">Open the app to say hi and lock in plans.</p>
     ${btn("Open Wanna", "wanna://matches")}`
  );
  return { subject, html };
}

interface InterestTplParams {
  activity_id: string;
  recipient_first_name: string;
  interested_first_name: string;
  activity_title: string;
}
function interestTemplate(p: InterestTplParams) {
  const subject = `${p.interested_first_name} is in for "${p.activity_title}"!`;
  const html = layout(
    subject,
    `<h1 style="margin:0 0 16px;font-size:24px;color:${CHARCOAL};">Someone wants to join</h1>
     <p style="margin:0 0 12px;">Hey ${p.recipient_first_name} — <strong>${p.interested_first_name}</strong> just expressed interest in your activity <strong>"${p.activity_title}"</strong>.</p>
     <p style="margin:0 0 24px;color:${SLATE};">Open Who's In to swipe through who wants to join.</p>
     ${btn("Open Who's In", "wanna://whos-in")}`
  );
  return { subject, html };
}

interface MeetupTplParams {
  match_id: string;
  recipient_first_name: string;
  other_first_name: string;
  activity_title: string;
}
function meetupTemplate(p: MeetupTplParams) {
  const subject = `Did you meet up with ${p.other_first_name}?`;
  const html = layout(
    subject,
    `<h1 style="margin:0 0 16px;font-size:24px;color:${CHARCOAL};">Quick check-in</h1>
     <p style="margin:0 0 12px;">Hey ${p.recipient_first_name} — did you and <strong>${p.other_first_name}</strong> get together for <strong>"${p.activity_title}"</strong>?</p>
     <p style="margin:0 0 24px;color:${SLATE};">A quick yes/no helps us understand which matches turn into real plans.</p>
     ${btn("Open Wanna", "wanna://")}`
  );
  return { subject, html };
}

// =============================================================================
// Resend HTTP call
// =============================================================================
async function sendViaResend(
  to: string,
  subject: string,
  html: string
): Promise<{ id: string | null; error: string | null }> {
  if (!RESEND_API_KEY) {
    return { id: null, error: "RESEND_API_KEY not configured" };
  }
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
  | { template: "meetup_check"; recipient_id: string; match_id: string };

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonResponse({ error: "POST only" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return jsonResponse({ error: "missing auth" }, 401);
  }
  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await anonClient.auth.getUser();
  if (userErr || !userData?.user) {
    return jsonResponse({ error: "invalid auth" }, 401);
  }
  const callerId = userData.user.id;
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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

  // Recipient profile (admin client: cross-user reads are intentional)
  const { data: recipientProfile } = await adminClient
    .from("profiles")
    .select("first_name, is_seed, is_active, email_notifications_enabled")
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
    });
  } else {
    return jsonResponse({ error: "unknown template" }, 400);
  }

  // ---------- Skips ----------
  const skip = (reason: string) => {
    void adminClient.from("email_log").insert({
      recipient_id,
      recipient_email: recipientEmail,
      template,
      context_id: contextId,
      status: "skipped",
      reason,
    });
    return jsonResponse({ status: "skipped", reason });
  };

  if (recipientProfile.is_seed) return skip("seed user");
  if (!recipientProfile.is_active) return skip("inactive");
  if (!recipientProfile.email_notifications_enabled) return skip("opted out");

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

  // ---------- Send ----------
  const { id: messageId, error: sendError } = await sendViaResend(
    recipientEmail,
    templateData.subject,
    templateData.html
  );
  if (sendError) {
    await adminClient.from("email_log").insert({
      recipient_id,
      recipient_email: recipientEmail,
      template,
      context_id: contextId,
      status: "failed",
      reason: sendError,
    });
    return jsonResponse({ status: "failed", error: sendError }, 502);
  }
  await adminClient.from("email_log").insert({
    recipient_id,
    recipient_email: recipientEmail,
    template,
    context_id: contextId,
    status: "sent",
    resend_message_id: messageId,
  });
  return jsonResponse({ status: "sent", message_id: messageId });
});
