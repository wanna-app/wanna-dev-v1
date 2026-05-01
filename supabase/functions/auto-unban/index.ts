// Edge function: auto-unban
//
// Called every hour by pg_cron (via net.http_post — see migration 00017).
// Finds all users whose temp ban has expired
// (is_active = false AND banned_until IS NOT NULL AND banned_until < now()),
// reactivates them, clears ban columns, and sends a welcome-back email
// via Resend template "account-reactivated".
//
// Deploy:  supabase functions deploy auto-unban

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";

const FROM = "Wanna <noreply@send.joinwannaapp.com>";
const TEMPLATE_ID = "account-reactivated";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonResponse({ error: "POST only" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer /, "");
  if (token !== SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Find all expired temp-banned users
  const now = new Date().toISOString();
  const { data: expiredUsers, error: fetchErr } = await adminClient
    .from("profiles")
    .select("id, first_name, ban_reason")
    .eq("is_active", false)
    .not("banned_until", "is", null)
    .lt("banned_until", now);

  if (fetchErr) {
    console.error("Failed to fetch expired bans:", fetchErr.message);
    return jsonResponse({ error: fetchErr.message }, 500);
  }

  const users = expiredUsers ?? [];
  console.log(`auto-unban: found ${users.length} expired ban(s)`);

  if (users.length === 0) {
    return jsonResponse({ status: "ok", unbanned: 0 });
  }

  const userIds = users.map((u) => u.id);

  // Reactivate all at once
  const { error: updateErr } = await adminClient
    .from("profiles")
    .update({
      is_active: true,
      banned_until: null,
      ban_reason: null,
    })
    .in("id", userIds);

  if (updateErr) {
    console.error("Failed to reactivate users:", updateErr.message);
    return jsonResponse({ error: updateErr.message }, 500);
  }

  // Send welcome-back emails via Resend template
  let emailsSent = 0;
  let emailsFailed = 0;

  for (const u of users) {
    try {
      const { data: authUser } = await adminClient.auth.admin.getUserById(u.id);
      const email = authUser?.user?.email;
      if (!email) {
        console.warn(`No email for user ${u.id}, skipping email`);
        continue;
      }

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: FROM,
          to: [email],
          template_id: TEMPLATE_ID,
          variables: {
            user_first_name: u.first_name ?? "there",
            ban_reason: u.ban_reason ?? "",
            ban_duration: "",
            ban_expiry_date: "",
          },
          headers: {
            "List-Unsubscribe": `<mailto:hello@joinwannaapp.com?subject=unsubscribe>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        }),
      });

      if (res.ok) {
        emailsSent++;
        console.log(`Welcome-back email sent to user ${u.id}`);
      } else {
        const resBody = await res.json().catch(() => null);
        emailsFailed++;
        console.warn(`Email failed for user ${u.id}: HTTP ${res.status}`, resBody?.message);
      }
    } catch (e: unknown) {
      emailsFailed++;
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`Email error for user ${u.id}:`, msg);
    }
  }

  console.log(
    `auto-unban complete: ${users.length} unbanned, ${emailsSent} emails sent, ${emailsFailed} failed`
  );

  return jsonResponse({
    status: "ok",
    unbanned: users.length,
    emails_sent: emailsSent,
    emails_failed: emailsFailed,
    user_ids: userIds,
  });
});
