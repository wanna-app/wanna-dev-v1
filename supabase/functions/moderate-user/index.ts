// Edge function: moderate-user
//
// Manually called (via curl or future admin dashboard) to apply a moderation
// action to a user. Requires a service-role Authorization header — only
// admins/moderators can call this.
//
// POST body:
// {
//   user_id:   string (uuid)           — user being moderated
//   action:    string                  — one of the ACTIONS below
//   reason:    string                  — explanation (shown to user in some cases)
//   report_id: string? (uuid)          — optional, to resolve an associated report
// }
//
// Actions:
//   warning          — notify user, no account restriction
//   content_removed  — notify user that content was removed
//   temp_ban_24h     — suspend for 24 hours
//   temp_ban_7d      — suspend for 7 days
//   temp_ban_30d     — suspend for 30 days
//   permanent_ban    — permanent suspension (is_active=false, banned_until=null)
//
// All emails are sent via Resend template IDs (no hardcoded HTML).
// NEVER reveals who reported the user.
//
// Deploy:  supabase functions deploy moderate-user
//
// Example curl:
//   curl -X POST https://ymztxrpkhenbcbjjfbxr.supabase.co/functions/v1/moderate-user \
//     -H "Authorization: Bearer SERVICE_ROLE_KEY" \
//     -H "Content-Type: application/json" \
//     -d '{"user_id":"...","action":"temp_ban_7d","reason":"Harassment","report_id":"..."}'

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";

const FROM = "Wanna <noreply@send.joinwannaapp.com>";

// Resend template IDs
const TEMPLATE_IDS = {
  warning: "account-warning",
  content_removed: "content-removal",
  temp_ban: "account-suspension",
  permanent_ban: "account-closure",
} as const;

const VALID_ACTIONS = [
  "warning",
  "content_removed",
  "temp_ban_24h",
  "temp_ban_7d",
  "temp_ban_30d",
  "permanent_ban",
] as const;

type Action = (typeof VALID_ACTIONS)[number];

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BAN_DURATIONS: Partial<Record<Action, number>> = {
  temp_ban_24h: 24 * 60 * 60 * 1000,
  temp_ban_7d: 7 * 24 * 60 * 60 * 1000,
  temp_ban_30d: 30 * 24 * 60 * 60 * 1000,
};

const BAN_DURATION_LABELS: Partial<Record<Action, string>> = {
  temp_ban_24h: "24 hours",
  temp_ban_7d: "7 days",
  temp_ban_30d: "30 days",
};

const REPORT_RESOLUTION: Partial<Record<Action, string>> = {
  warning: "warning",
  content_removed: "content_removed",
  temp_ban_24h: "temp_ban",
  temp_ban_7d: "temp_ban",
  temp_ban_30d: "temp_ban",
  permanent_ban: "permanent_ban",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

async function sendTemplateEmail(
  to: string,
  templateId: string,
  variables: Record<string, string>
): Promise<string | null> {
  if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not configured");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
      to: [to],
      template_id: templateId,
      variables,
      headers: {
        "List-Unsubscribe": `<mailto:hello@joinwannaapp.com?subject=unsubscribe>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    }),
  });

  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.message ?? `Resend HTTP ${res.status}`);
  return body?.id ?? null;
}

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonResponse({ error: "POST only" }, 405);

  // Require service-role key — only admins can call this function
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer /, "");
  if (token !== SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  let body: { user_id: string; action: string; reason: string; report_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid JSON" }, 400);
  }

  const { user_id, action, reason, report_id } = body;
  if (!user_id || !action || !reason) {
    return jsonResponse({ error: "user_id, action, and reason are required" }, 400);
  }
  if (!VALID_ACTIONS.includes(action as Action)) {
    return jsonResponse(
      { error: `action must be one of: ${VALID_ACTIONS.join(", ")}` },
      400
    );
  }
  const moderationAction = action as Action;

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Fetch user profile + email in parallel
  const [profileResult, authResult] = await Promise.all([
    adminClient.from("profiles").select("first_name, is_active, is_seed").eq("id", user_id).maybeSingle(),
    adminClient.auth.admin.getUserById(user_id),
  ]);

  const profile = profileResult.data;
  if (!profile) return jsonResponse({ error: "user not found" }, 404);

  const userEmail = authResult.data?.user?.email;
  if (!userEmail) return jsonResponse({ error: "user has no email address" }, 400);

  const firstName = profile.first_name ?? "there";

  // ---------- Apply profile changes ----------
  const profileUpdates: Record<string, unknown> = {};
  let bannedUntilDate: Date | null = null;

  if (moderationAction in BAN_DURATIONS) {
    const durationMs = BAN_DURATIONS[moderationAction]!;
    bannedUntilDate = new Date(Date.now() + durationMs);
    profileUpdates.is_active = false;
    profileUpdates.banned_until = bannedUntilDate.toISOString();
    profileUpdates.ban_reason = reason;
  } else if (moderationAction === "permanent_ban") {
    profileUpdates.is_active = false;
    profileUpdates.banned_until = null;
    profileUpdates.ban_reason = reason;
  }
  // warning and content_removed: no profile changes

  if (Object.keys(profileUpdates).length > 0) {
    const { error: updateErr } = await adminClient
      .from("profiles")
      .update(profileUpdates)
      .eq("id", user_id);
    if (updateErr) {
      console.error("Profile update failed:", updateErr.message);
      return jsonResponse({ error: "failed to update profile", detail: updateErr.message }, 500);
    }
  }

  // ---------- Resolve linked report ----------
  if (report_id && REPORT_RESOLUTION[moderationAction]) {
    const { error: reportErr } = await adminClient
      .from("reports")
      .update({
        status: "resolved",
        resolution: REPORT_RESOLUTION[moderationAction],
        resolved_at: new Date().toISOString(),
      })
      .eq("id", report_id);
    if (reportErr) {
      console.warn("Report update failed (non-fatal):", reportErr.message);
    }
  }

  // ---------- Send email via Resend template ----------
  let templateId: string;
  const variables: Record<string, string> = {
    user_first_name: firstName,
    ban_reason: reason,
    ban_duration: "",
    ban_expiry_date: "",
  };

  switch (moderationAction) {
    case "warning":
      templateId = TEMPLATE_IDS.warning;
      break;
    case "content_removed":
      templateId = TEMPLATE_IDS.content_removed;
      break;
    case "temp_ban_24h":
    case "temp_ban_7d":
    case "temp_ban_30d":
      templateId = TEMPLATE_IDS.temp_ban;
      variables.ban_duration = BAN_DURATION_LABELS[moderationAction]!;
      variables.ban_expiry_date = bannedUntilDate!.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "America/Los_Angeles",
      });
      break;
    case "permanent_ban":
      templateId = TEMPLATE_IDS.permanent_ban;
      break;
  }

  let messageId: string | null = null;
  try {
    messageId = await sendTemplateEmail(userEmail, templateId!, variables);
    console.log("Moderation email sent:", messageId, "action:", moderationAction, "user:", user_id, "template:", templateId);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Email send failed:", msg);
    return jsonResponse({
      status: "partial",
      warning: "profile updated but email failed",
      email_error: msg,
      action: moderationAction,
    }, 207);
  }

  return jsonResponse({
    status: "ok",
    action: moderationAction,
    user_id,
    message_id: messageId,
    banned_until: bannedUntilDate?.toISOString() ?? null,
    template_id: templateId!,
  });
});
