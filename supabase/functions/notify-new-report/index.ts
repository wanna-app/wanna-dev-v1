// Edge function: notify-new-report
//
// Called by a Supabase Database Webhook on INSERT to the public.reports table.
// Looks up both the reported user's and reporter's first_name from profiles,
// then emails hello@joinwannaapp.com via Resend with a full report summary.
//
// Special handling: if reason === "Underage user", subject gets a 🚨 URGENT prefix.
//
// Webhook payload shape (Supabase Database Webhooks):
// {
//   type: "INSERT",
//   table: "reports",
//   schema: "public",
//   record: { id, reporter_id, reported_user_id, content_type, content_id, source, reason, description, created_at },
//   old_record: null
// }
//
// Deploy:  supabase functions deploy notify-new-report
// Secret:  RESEND_API_KEY (already set as a Supabase function secret)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";

const ADMIN_EMAIL = "hello@joinwannaapp.com";
const FROM = "Wanna <noreply@send.joinwannaapp.com>";
const TABLE_EDITOR_URL =
  "https://supabase.com/dashboard/project/ymztxrpkhenbcbjjfbxr/editor?schema=public&table=reports";

const PURPLE = "#8C52FF";
const CHARCOAL = "#2D2D3A";
const SLATE = "#B0B0B8";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ReportRecord {
  id: string;
  reporter_id: string;
  reported_user_id: string;
  content_type?: string | null;
  content_id?: string | null;
  source?: string | null;
  reason: string;
  description?: string | null;
  created_at: string;
}

interface WebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  schema: string;
  record: ReportRecord | null;
  old_record: ReportRecord | null;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function buildEmailHtml(report: ReportRecord, reportedName: string, reporterName: string): string {
  const isUnderage = report.reason === "Underage user";
  const urgencyBanner = isUnderage
    ? `<div style="background:#E53E3E;color:#FFF;font-weight:900;font-size:16px;padding:12px 32px;letter-spacing:0.5px;">
         🚨 URGENT — UNDERAGE REPORT — IMMEDIATE ACTION REQUIRED
       </div>`
    : "";

  const rows: Array<[string, string]> = [
    ["Reason", escapeHtml(report.reason)],
    ["Description", report.description ? escapeHtml(report.description) : "<em style='color:#B0B0B8;'>None provided</em>"],
    ["Reported user", `${escapeHtml(reportedName)} <span style="color:${SLATE};font-size:13px;">(${report.reported_user_id})</span>`],
    ["Reporter", `${escapeHtml(reporterName)} <span style="color:${SLATE};font-size:13px;">(${report.reporter_id})</span>`],
    ["Content type", escapeHtml(report.content_type ?? "—")],
    ["Content ID", escapeHtml(report.content_id ?? "—")],
    ["Source", escapeHtml(report.source ?? "—")],
    ["Report ID", `<span style="font-size:13px;">${report.id}</span>`],
    ["Submitted at", new Date(report.created_at).toLocaleString("en-US", { timeZone: "America/Los_Angeles" }) + " PT"],
  ];

  const tableRows = rows
    .map(([label, value], i) =>
      `<tr style="${i % 2 === 1 ? `background:#F5F5F7;` : ""}">
         <td style="padding:10px ${i % 2 === 1 ? "10px" : "10px 10px 10px 0"};color:${SLATE};width:160px;vertical-align:top;font-size:14px;">${label}</td>
         <td style="padding:10px;font-size:15px;">${value}</td>
       </tr>`
    )
    .join("\n");

  return `<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#F5F5F7;font-family:Helvetica,Arial,sans-serif;color:${CHARCOAL};">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F5F5F7;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#FFF;border-radius:16px;overflow:hidden;">
        <tr><td>
          <div style="padding:24px 32px 8px;">
            <div style="font-weight:900;font-size:28px;letter-spacing:-1px;color:${PURPLE};">wanna</div>
          </div>
          ${urgencyBanner}
          <div style="padding:16px 32px 8px;">
            <h1 style="margin:0;font-size:22px;color:${CHARCOAL};">⚠️ New User Report</h1>
          </div>
        </td></tr>
        <tr><td style="padding:0 32px 24px;">
          <table style="width:100%;border-collapse:collapse;">
            ${tableRows}
          </table>
        </td></tr>
        <tr><td style="padding:0 32px 32px;">
          <a href="${TABLE_EDITOR_URL}"
             style="display:inline-block;background:${PURPLE};color:#FFF;text-decoration:none;font-weight:700;padding:14px 24px;border-radius:999px;font-size:15px;">
            View in Supabase →
          </a>
        </td></tr>
        <tr><td style="padding:16px 32px;background:#FAFAFB;color:${SLATE};font-size:12px;text-align:center;line-height:1.6;">
          This is an automated message from Wanna. Please do not reply to this email.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonResponse({ error: "POST only" }, 405);

  let payload: WebhookPayload;
  try {
    payload = (await req.json()) as WebhookPayload;
  } catch {
    return jsonResponse({ error: "invalid JSON" }, 400);
  }

  if (payload.type !== "INSERT" || !payload.record) {
    return jsonResponse({ status: "ignored", reason: "not an INSERT" });
  }

  const report = payload.record;
  console.log("Processing report:", report.id, "reason:", report.reason);

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Fetch both profiles in parallel
  const [reportedResult, reporterResult] = await Promise.all([
    adminClient.from("profiles").select("first_name").eq("id", report.reported_user_id).maybeSingle(),
    adminClient.from("profiles").select("first_name").eq("id", report.reporter_id).maybeSingle(),
  ]);

  const reportedName = reportedResult.data?.first_name ?? "Unknown user";
  const reporterName = reporterResult.data?.first_name ?? "Unknown user";

  const isUnderage = report.reason === "Underage user";
  const subject = isUnderage
    ? `🚨 URGENT — UNDERAGE REPORT: ${report.reason}`
    : `⚠️ New Report: ${report.reason}`;

  const html = buildEmailHtml(report, reportedName, reporterName);

  if (!RESEND_API_KEY) {
    console.error("RESEND_API_KEY not configured");
    return jsonResponse({ error: "RESEND_API_KEY not configured" }, 500);
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
      to: [ADMIN_EMAIL],
      subject,
      html,
      headers: {
        // List-Unsubscribe per CAN-SPAM / RFC 2369
        "List-Unsubscribe": `<mailto:hello@joinwannaapp.com?subject=unsubscribe>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    }),
  });

  const resBody = await res.json().catch(() => null);
  if (!res.ok) {
    console.error("Resend error:", resBody);
    return jsonResponse(
      { status: "failed", error: resBody?.message ?? `HTTP ${res.status}` },
      502
    );
  }

  console.log("Report notification sent, message_id:", resBody?.id, "subject:", subject);
  return jsonResponse({ status: "sent", message_id: resBody?.id ?? null, subject });
});
