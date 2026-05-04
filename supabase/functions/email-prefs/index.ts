// Email preferences hosted page.
//
// Linked from the welcome email's footer. The link carries a JWT signed
// with EMAIL_PREFS_SECRET that identifies the user and the link's intent
// ("manage" preferences vs one-click "unsubscribe").
//
// GET ?token=...                 → render manage page (or one-click unsub)
// GET ?token=...&action=save&marketing=on|off
//                                → flip marketing_emails_enabled, render
//                                  confirmation page
//
// Pure HTML/CSS, no React, no client JS. Brand-styled to match the rest
// of the email surface (purple-to-cyan gradient, white card, brand purple
// buttons).

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyEmailPrefsToken } from "../_shared/email-prefs-token.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EMAIL_PREFS_SECRET = Deno.env.get("EMAIL_PREFS_SECRET") ?? "";

const PURPLE = "#8C52FF";
const CYAN = "#57B8D0";
const CHARCOAL = "#2D2D3A";

function htmlResponse(body: string, status = 200): Response {
  // Use the Headers constructor explicitly. With a plain object, the
  // Supabase Edge gateway was mangling our `Content-Type: text/html`
  // into `text/plain`, which made email clients render the page
  // source as raw text instead of HTML. The Headers API serializes
  // cleanly through the gateway.
  const headers = new Headers();
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(body, { status, headers });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function page(title: string, innerHtml: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} · Wanna</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;padding:0;font-family:Helvetica,Arial,sans-serif;color:${CHARCOAL};background:linear-gradient(165deg,${PURPLE} 0%,${CYAN} 100%);min-height:100vh;-webkit-font-smoothing:antialiased}
  .wrap{max-width:560px;margin:0 auto;padding:48px 20px}
  .wordmark{display:block;margin:0 auto 32px;width:160px;height:auto}
  .card{background:#fff;border-radius:20px;padding:40px 36px;box-shadow:0 8px 32px rgba(0,0,0,0.08)}
  h1{margin:0 0 16px;font-size:24px;line-height:1.3;color:${CHARCOAL}}
  p{margin:0 0 16px;font-size:16px;line-height:1.55;color:${CHARCOAL}}
  .muted{color:#6b6b78;font-size:14px}
  .btn{display:inline-block;padding:14px 36px;background:${PURPLE};color:#fff;font-size:16px;font-weight:700;text-decoration:none;border:none;border-radius:24px;cursor:pointer;font-family:inherit}
  .btn-secondary{background:#fff;color:${PURPLE};border:1px solid ${PURPLE}}
  .row{display:flex;align-items:flex-start;gap:12px;padding:14px 0;border-bottom:1px solid #eee}
  .row:last-child{border-bottom:none}
  .row label{flex:1;font-size:15px;line-height:1.45}
  .row label strong{display:block;font-weight:700;margin-bottom:2px}
  .row label span{color:#6b6b78;font-size:13px}
  .checkbox{appearance:none;-webkit-appearance:none;width:22px;height:22px;border:2px solid #d0d0d8;border-radius:6px;cursor:pointer;flex-shrink:0;margin-top:2px;position:relative;background:#fff}
  .checkbox:checked{background:${PURPLE};border-color:${PURPLE}}
  .checkbox:checked::after{content:"";position:absolute;left:6px;top:2px;width:6px;height:11px;border:solid #fff;border-width:0 2px 2px 0;transform:rotate(45deg)}
  .actions{margin-top:28px;display:flex;gap:12px;flex-wrap:wrap}
  .footer{text-align:center;margin-top:32px;color:rgba(255,255,255,0.7);font-size:12px}
</style>
</head>
<body>
  <div class="wrap">
    <img class="wordmark" src="https://ymztxrpkhenbcbjjfbxr.supabase.co/storage/v1/object/public/assets/wanna_wordmark_white.png" alt="wanna">
    <div class="card">${innerHtml}</div>
    <p class="footer">Wanna · joinwannaapp.com</p>
  </div>
</body>
</html>`;
}

function expiredPage(): string {
  return page(
    "Link expired",
    `<h1>This link has expired</h1>
     <p>For your security, email preference links expire after 30 days. To update your preferences, open the Wanna app and go to <strong>Settings → Notifications</strong>.</p>`,
  );
}

function errorPage(): string {
  return page(
    "Something went wrong",
    `<h1>Something went wrong</h1>
     <p>We couldn't update your preferences just now. Please try again, or open the Wanna app and go to <strong>Settings → Notifications</strong>.</p>`,
  );
}

function unsubscribedPage(): string {
  return page(
    "Unsubscribed",
    `<h1>You've been unsubscribed</h1>
     <p>You're unsubscribed from Wanna marketing emails. You'll still receive account, security, and notification emails (matches, messages, and the things you've turned on in Settings).</p>
     <p class="muted">Changed your mind? Open the Wanna app, go to <strong>Settings → Notifications</strong>, and turn <em>Marketing emails</em> back on.</p>`,
  );
}

function savedPage(marketingOn: boolean): string {
  return page(
    "Preferences saved",
    `<h1>Preferences saved</h1>
     <p>Marketing emails are now <strong>${marketingOn ? "on" : "off"}</strong>.</p>
     <p class="muted">Account, security, and notification emails are unaffected by this setting — manage those in <strong>Settings → Notifications</strong> inside the Wanna app.</p>`,
  );
}

function managePage(token: string, marketingOn: boolean): string {
  // Form GETs back to the same function with action=save so we don't
  // need any JS / CORS / preflight handling. The token round-trips so
  // we can re-verify the user on submit.
  const checked = marketingOn ? "checked" : "";
  return page(
    "Email preferences",
    `<h1>Email preferences</h1>
     <p>Choose which kinds of email you want to receive from Wanna.</p>
     <form method="GET" action="">
       <input type="hidden" name="token" value="${escapeHtml(token)}">
       <input type="hidden" name="action" value="save">
       <div class="row">
         <input class="checkbox" type="checkbox" id="marketing" name="marketing" value="on" ${checked}>
         <label for="marketing">
           <strong>Marketing emails</strong>
           <span>Welcome emails, weekly digests, and product updates.</span>
         </label>
       </div>
       <p class="muted" style="margin-top:20px;">Account and security emails (sign-in confirmations, password resets) and notification emails (matches, messages — manage these in the app) always send.</p>
       <div class="actions">
         <button type="submit" class="btn">Save preferences</button>
       </div>
     </form>`,
  );
}

serve(async (req) => {
  if (req.method !== "GET") {
    return htmlResponse(errorPage(), 405);
  }

  if (!EMAIL_PREFS_SECRET) {
    console.error("EMAIL_PREFS_SECRET not configured");
    return htmlResponse(errorPage(), 500);
  }

  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  const action = url.searchParams.get("action") ?? "";

  if (!token) {
    return htmlResponse(expiredPage(), 400);
  }

  const payload = await verifyEmailPrefsToken(EMAIL_PREFS_SECRET, token);
  if (!payload) {
    return htmlResponse(expiredPage(), 400);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // ---- Save action (form submit from manage page) ----
  if (action === "save") {
    const marketingOn = url.searchParams.get("marketing") === "on";
    const { error } = await admin
      .from("profiles")
      .update({ marketing_emails_enabled: marketingOn })
      .eq("id", payload.uid);
    if (error) {
      console.error("email-prefs save failed", error);
      return htmlResponse(errorPage(), 500);
    }
    return htmlResponse(savedPage(marketingOn));
  }

  // ---- Direct unsubscribe (one-click) ----
  if (payload.type === "unsubscribe") {
    const { error } = await admin
      .from("profiles")
      .update({ marketing_emails_enabled: false })
      .eq("id", payload.uid);
    if (error) {
      console.error("email-prefs unsubscribe failed", error);
      return htmlResponse(errorPage(), 500);
    }
    return htmlResponse(unsubscribedPage());
  }

  // ---- Manage page (default) ----
  const { data: profile, error } = await admin
    .from("profiles")
    .select("marketing_emails_enabled")
    .eq("id", payload.uid)
    .maybeSingle();
  if (error || !profile) {
    console.error("email-prefs profile lookup failed", error);
    return htmlResponse(errorPage(), 500);
  }
  return htmlResponse(
    managePage(token, profile.marketing_emails_enabled !== false),
  );
});
