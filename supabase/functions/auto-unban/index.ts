// Edge function: auto-unban
//
// Called every hour by pg_cron (via net.http_post — see migration 00017).
// Finds all users whose temp ban has expired:
//   is_active = false AND banned_until IS NOT NULL AND banned_until < now()
// Reactivates them, clears ban columns, sends a welcome-back email via Resend.
//
// Email HTML is embedded directly (Resend's /emails API does not support
// template_id references). The HTML below was designed in Resend; variables
// ({{ .LoginURL }}) are substituted server-side.
//
// Deploy: supabase functions deploy auto-unban

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";

const FROM = "Wanna <noreply@send.joinwannaapp.com>";
const SUBJECT = "Welcome back to Wanna";
// Universal deep link to open the app
const LOGIN_URL = "wanna://";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// =============================================================================
// HTML template (designed in Resend, pasted here verbatim).
// Placeholder syntax: {{ .LoginURL }}
// =============================================================================
const HTML_REACTIVATED = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Account reactivated – wanna</title>
  </head>
  <body style="margin:0;padding:0;background-color:#F5F5F7;-webkit-font-smoothing:antialiased;">
    <!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
    <table
      role="presentation"
      width="100%"
      cellpadding="0"
      cellspacing="0"
      border="0"
      style="background-color:#F5F5F7;"
    >
      <tr>
        <td align="center" style="padding:40px 20px;">
          <table
            role="presentation"
            width="600"
            cellpadding="0"
            cellspacing="0"
            border="0"
            style="max-width:600px;width:100%;background-color:#FFFFFF;border-radius:16px;overflow:hidden;"
          >
            <!-- Green accent bar -->
            <tr>
              <td style="height:6px;background:linear-gradient(90deg,#8C52FF,#57B8D0);font-size:0;line-height:0;">
                &nbsp;
              </td>
            </tr>

            <!-- Wordmark -->
            <tr>
              <td align="center" style="padding:36px 40px 0 40px;">
                <span
                  style="font-family:'VAG Rounded Next Bold','Nunito',Helvetica,Arial,sans-serif;font-size:28px;font-weight:700;color:#8C52FF;letter-spacing:1px;"
                  >wanna</span
                >
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding:32px 40px 12px 40px;">
                <h1
                  style="margin:0 0 16px 0;font-family:Helvetica,Arial,sans-serif;font-size:22px;font-weight:700;color:#2D2D3A;"
                >
                  Your account has been restored
                </h1>
                <p
                  style="margin:0 0 16px 0;font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:24px;color:#2D2D3A;"
                >
                  Your suspension has ended and your account has been reactivated. You can log in and use
                  <strong>wanna</strong> again.
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding:0 40px 32px 40px;">
                <p
                  style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:24px;color:#2D2D3A;"
                >
                  Please take a moment to review our community guidelines. Additional violations may result in a longer
                  suspension or permanent removal.
                </p>
              </td>
            </tr>

            <!-- CTA -->
            <tr>
              <td align="center" style="padding:0 40px 32px 40px;">
                <!--[if mso]> <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="{{ .LoginURL }}" style="height:48px;width:220px;v-text-anchor:middle;" arcsize="50%" fillcolor="#8C52FF"> <w:anchorlock /> <center style="color:#FFFFFF;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:700;">Open wanna</center> </v:roundrect> <![endif]-->
                <!--[if !mso]><!-->
                <a
                  href="{{ .LoginURL }}"
                  target="_blank"
                  style="display:inline-block;padding:14px 40px;background-color:#8C52FF;color:#FFFFFF;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:700;text-decoration:none;border-radius:24px;mso-hide:all;"
                  >Log back in</a
                >
                <!--<![endif]-->
              </td>
            </tr>

            <tr>
              <td style="padding:0 40px;">
                <hr style="border:none;border-top:1px solid #F5F5F7;margin:0;" />
              </td>
            </tr>

            <tr>
              <td style="padding:24px 40px 12px 40px;">
                <p
                  style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:18px;color:#B0B0B8;text-align:center;"
                >
                  Questions? Reach out to us at
                  <a href="mailto:support@joinwannaapp.com" style="color:#8C52FF;text-decoration:underline;"
                    >support@joinwannaapp.com</a
                  >.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 40px 32px 40px;">
                <p
                  style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:11px;line-height:16px;color:#B0B0B8;text-align:center;"
                >
                  This is an automated message — please do not reply to this email.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    <!--[if mso]></td></tr></table><![endif]-->
  </body>
</html>`;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// LoginURL is intentionally NOT html-escaped — it goes into href attributes
function render(template: string, vars: Record<string, string>, urlVars: string[] = []): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    const pattern = new RegExp(`\\{\\{\\s*\\.${k}\\s*\\}\\}`, "g");
    out = out.replace(pattern, urlVars.includes(k) ? v : escapeHtml(v));
  }
  return out;
}

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

  const html = render(HTML_REACTIVATED, { LoginURL: LOGIN_URL }, ["LoginURL"]);

  let emailsSent = 0;
  let emailsFailed = 0;

  for (const u of users) {
    try {
      const { data: authUser } = await adminClient.auth.admin.getUserById(u.id);
      const email = authUser?.user?.email;
      if (!email) {
        console.warn(`No email for user ${u.id}, skipping`);
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
          subject: SUBJECT,
          html,
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
