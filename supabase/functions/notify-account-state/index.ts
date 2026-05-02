// Edge function: notify-account-state
//
// Sends a transactional email when a user pauses or deactivates their own
// account. Caller must be the user themselves (anon JWT auth).
//
// POST body: { action: "paused" | "deactivated" }
//
// Email HTML is embedded directly (Resend's /emails API does not support
// template_id references). Variables ({{ .LoginURL }}) are substituted
// server-side.
//
// Deploy: supabase functions deploy notify-account-state
// Secret: RESEND_API_KEY (already set)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";

const FROM = "Wanna <noreply@send.joinwannaapp.com>";
const LOGIN_URL = "wanna://";

const SUBJECTS = {
  paused: "Your Wanna account is paused",
  deactivated: "Your Wanna account has been deactivated",
} as const;

type Action = keyof typeof SUBJECTS;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// =============================================================================
// HTML templates (designed in Resend, pasted verbatim)
// =============================================================================

const HTML_PAUSED = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Account paused – wanna</title>
</head>
<body style="margin:0;padding:0;background-color:#F5F5F7;-webkit-font-smoothing:antialiased;">

<!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F5F5F7;">
  <tr>
    <td align="center" style="padding:40px 20px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#FFFFFF;border-radius:16px;overflow:hidden;">

        <!-- Gradient bar -->
        <tr>
          <td style="height:6px;background:linear-gradient(90deg,#8C52FF,#57B8D0);font-size:0;line-height:0;">&nbsp;</td>
        </tr>

        <!-- Wordmark -->
        <tr>
          <td align="center" style="padding:36px 40px 0 40px;">
            <span style="font-family:'VAG Rounded Next Bold','Nunito',Helvetica,Arial,sans-serif;font-size:28px;font-weight:700;color:#8C52FF;letter-spacing:1px;">wanna</span>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px 40px 12px 40px;">
            <h1 style="margin:0 0 12px 0;font-family:Helvetica,Arial,sans-serif;font-size:22px;font-weight:700;color:#2D2D3A;">Your account is paused</h1>
            <p style="margin:0 0 24px 0;font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:24px;color:#2D2D3A;">
              You've paused your <strong>wanna</strong> account. Your profile won't appear in other users' feeds and you won't receive new matches while paused.
            </p>
          </td>
        </tr>

        <!-- What's preserved -->
        <tr>
          <td style="padding:0 40px 24px 40px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="background-color:#F5F5F7;border-radius:12px;padding:16px 20px;">
                  <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:20px;color:#2D2D3A;">
                    Your profile, matches, conversations, and activity history are all saved. Everything will be right where you left it when you come back.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:0 40px 32px 40px;">
            <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:24px;color:#2D2D3A;">
              Whenever you're ready, just log back in and your account will be reactivated automatically.
            </p>
          </td>
        </tr>

        <!-- CTA -->
        <tr>
          <td align="center" style="padding:0 40px 32px 40px;">
            <!--[if mso]>
            <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="{{ .LoginURL }}" style="height:48px;width:220px;v-text-anchor:middle;" arcsize="50%" fillcolor="#8C52FF">
              <w:anchorlock/>
              <center style="color:#FFFFFF;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:700;">Reactivate Account</center>
            </v:roundrect>
            <![endif]-->
            <!--[if !mso]><!-->
            <a href="{{ .LoginURL }}" target="_blank" style="display:inline-block;padding:14px 40px;background-color:#8C52FF;color:#FFFFFF;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:700;text-decoration:none;border-radius:24px;mso-hide:all;">Reactivate Account</a>
            <!--<![endif]-->
          </td>
        </tr>

        <!-- Divider -->
        <tr>
          <td style="padding:0 40px;">
            <hr style="border:none;border-top:1px solid #F5F5F7;margin:0;"/>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:24px 40px 12px 40px;">
            <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:18px;color:#B0B0B8;text-align:center;">
              Questions? Reach out to us at <a href="mailto:support@joinwannaapp.com" style="color:#8C52FF;text-decoration:underline;">support@joinwannaapp.com</a>.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:0 40px 32px 40px;">
            <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:11px;line-height:16px;color:#B0B0B8;text-align:center;">
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

const HTML_DEACTIVATED = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Account deactivated – wanna</title>
</head>
<body style="margin:0;padding:0;background-color:#F5F5F7;-webkit-font-smoothing:antialiased;">

<!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F5F5F7;">
  <tr>
    <td align="center" style="padding:40px 20px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#FFFFFF;border-radius:16px;overflow:hidden;">

        <!-- Gradient bar -->
        <tr>
          <td style="height:6px;background:linear-gradient(90deg,#8C52FF,#57B8D0);font-size:0;line-height:0;">&nbsp;</td>
        </tr>

        <!-- Wordmark -->
        <tr>
          <td align="center" style="padding:36px 40px 0 40px;">
            <span style="font-family:'VAG Rounded Next Bold','Nunito',Helvetica,Arial,sans-serif;font-size:28px;font-weight:700;color:#8C52FF;letter-spacing:1px;">wanna</span>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px 40px 12px 40px;">
            <h1 style="margin:0 0 12px 0;font-family:Helvetica,Arial,sans-serif;font-size:22px;font-weight:700;color:#2D2D3A;">Your account has been deactivated</h1>
            <p style="margin:0 0 24px 0;font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:24px;color:#2D2D3A;">
              As requested, your <strong>wanna</strong> account has been deactivated. Your profile has been removed and you'll no longer appear in other users' feeds.
            </p>
          </td>
        </tr>

        <!-- What happens next -->
        <tr>
          <td style="padding:0 40px 24px 40px;">
            <p style="margin:0 0 8px 0;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:700;color:#2D2D3A;">What happens next</p>
            <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:24px;color:#2D2D3A;">
              Your account data will be retained for 30 days in case you change your mind. After that, it will be permanently deleted and cannot be recovered.
            </p>
          </td>
        </tr>

        <!-- Changed your mind -->
        <tr>
          <td style="padding:0 40px 24px 40px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="background-color:#F5F5F7;border-radius:12px;padding:16px 20px;">
                  <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:20px;color:#2D2D3A;">
                    <strong>Changed your mind?</strong> Log back in within 30 days to restore your account and all your data.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- CTA -->
        <tr>
          <td align="center" style="padding:0 40px 32px 40px;">
            <!--[if mso]>
            <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="{{ .LoginURL }}" style="height:48px;width:220px;v-text-anchor:middle;" arcsize="50%" fillcolor="#8C52FF">
              <w:anchorlock/>
              <center style="color:#FFFFFF;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:700;">Restore Account</center>
            </v:roundrect>
            <![endif]-->
            <!--[if !mso]><!-->
            <a href="{{ .LoginURL }}" target="_blank" style="display:inline-block;padding:14px 40px;background-color:#8C52FF;color:#FFFFFF;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:700;text-decoration:none;border-radius:24px;mso-hide:all;">Restore Account</a>
            <!--<![endif]-->
          </td>
        </tr>

        <!-- Divider -->
        <tr>
          <td style="padding:0 40px;">
            <hr style="border:none;border-top:1px solid #F5F5F7;margin:0;"/>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:24px 40px 12px 40px;">
            <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:18px;color:#B0B0B8;text-align:center;">
              We're sorry to see you go. If you have feedback, we'd love to hear from you at <a href="mailto:support@joinwannaapp.com" style="color:#8C52FF;text-decoration:underline;">support@joinwannaapp.com</a>.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:0 40px 32px 40px;">
            <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:11px;line-height:16px;color:#B0B0B8;text-align:center;">
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

// LoginURL is intentionally NOT html-escaped — it goes into href attributes.
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

  // Authenticate the caller (the user themselves)
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
  const callerEmail = userData.user.email;
  if (!callerEmail) {
    return jsonResponse({ error: "user has no email" }, 400);
  }

  let body: { action?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid JSON" }, 400);
  }

  const action = body.action as Action | undefined;
  if (!action || !(action in SUBJECTS)) {
    return jsonResponse(
      { error: `action must be one of: ${Object.keys(SUBJECTS).join(", ")}` },
      400
    );
  }

  // Skip seed users so demo + AI accounts never burn email credits
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: profile } = await adminClient
    .from("profiles")
    .select("is_seed")
    .eq("id", callerId)
    .maybeSingle();

  if (profile?.is_seed) {
    console.log("Skipping email for seed user:", callerId);
    return jsonResponse({ status: "skipped", reason: "seed user" });
  }

  if (!RESEND_API_KEY) {
    return jsonResponse({ error: "RESEND_API_KEY not configured" }, 500);
  }

  const subject = SUBJECTS[action];
  const template = action === "paused" ? HTML_PAUSED : HTML_DEACTIVATED;
  const html = render(template, { LoginURL: LOGIN_URL }, ["LoginURL"]);

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
      to: [callerEmail],
      subject,
      html,
      headers: {
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

  console.log("account-state email sent:", resBody?.id, "action:", action, "user:", callerId);
  return jsonResponse({ status: "sent", message_id: resBody?.id ?? null, action });
});
