// Email preferences hosted page + one-click unsubscribe endpoint.
//
// Linked from the footer of every optional Wanna email. The link carries
// a JWT signed with EMAIL_PREFS_SECRET that identifies the user and the
// link's intent ("manage" preferences vs one-click "unsubscribe").
//
// GET  ?token=...                                → render manage page
//                                                  (or one-click unsub if
//                                                  token.type=unsubscribe)
// GET  ?token=...&action=save&interest=on&...    → flip notify_*_email +
//                                                  marketing_emails_enabled,
//                                                  render confirmation page
// POST ?token=...  (RFC 8058 / List-Unsubscribe-Post)
//                                                → one-click unsubscribe-all,
//                                                  HTTP 200 plain text
//
// Pure HTML/CSS, no React, no client JS. Brand-styled to match the rest
// of the email surface (purple-to-cyan gradient, white card, brand purple
// buttons).
//
// One source of truth: the `profiles` columns. The in-app Settings page
// (Profile → Settings → Notifications) reads/writes these same columns,
// so changes here are reflected in the app and vice versa.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyEmailPrefsToken } from "../_shared/email-prefs-token.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EMAIL_PREFS_SECRET = Deno.env.get("EMAIL_PREFS_SECRET") ?? "";

const PURPLE = "#8C52FF";
const CYAN = "#57B8D0";
const CHARCOAL = "#2D2D3A";

// Categories shown in the manage page, in the same order as the in-app
// Settings → Notifications matrix. Each entry binds a UI key (used in
// form params) to the underlying profiles column.
interface Category {
  key: string;
  column: string;
  title: string;
  blurb: string;
}
const CATEGORIES: Category[] = [
  {
    key: "interest",
    column: "notify_interest_email",
    title: "Activity interest",
    blurb: "Someone swipes right on an activity you posted.",
  },
  {
    key: "match",
    column: "notify_match_email",
    title: "New matches",
    blurb: "You and someone else both want to do the same thing.",
  },
  {
    key: "message",
    column: "notify_message_email",
    title: "Messages",
    blurb: "New messages from your matches.",
  },
  {
    key: "meetup",
    column: "notify_meetup_email",
    title: "Meetup check-ins",
    blurb: "“Did you meet?” prompts after a planned activity.",
  },
  {
    key: "new_activities",
    column: "notify_new_activities_email",
    title: "New activities",
    blurb: "Weekly roundup of activities posted in your area.",
  },
  {
    key: "marketing",
    column: "marketing_emails_enabled",
    title: "Marketing emails",
    blurb: "Welcome emails, product updates, and the occasional feature drop.",
  },
];

type PrefsRow = Record<string, boolean>;

function htmlResponse(body: string, status = 200): Response {
  // KNOWN ISSUE: the Supabase Edge gateway rewrites our Content-Type
  // to text/plain AND adds `Content-Security-Policy: default-src
  // 'none'; sandbox` on public (--no-verify-jwt) responses. Browsers
  // render the result as raw source. We can't override either header
  // from inside the function — both are applied at the gateway
  // boundary. The fix is to host this page off-platform (Cloudflare
  // Pages / Vercel). See DEFERRED.md.
  //
  // Until then, the function still returns the right HTML body — it
  // just won't render in a browser. `curl ... > foo.html && open
  // foo.html` works for local preview.
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
  h2{margin:24px 0 8px;font-size:14px;line-height:1.4;color:${CHARCOAL};font-weight:700;text-transform:uppercase;letter-spacing:0.6px}
  p{margin:0 0 16px;font-size:16px;line-height:1.55;color:${CHARCOAL}}
  .muted{color:#6b6b78;font-size:14px}
  .email-pill{display:inline-block;background:#f4f0ff;color:${PURPLE};padding:6px 12px;border-radius:999px;font-size:13px;font-weight:600;margin-bottom:8px;word-break:break-all}
  .btn{display:inline-block;padding:14px 36px;background:${PURPLE};color:#fff;font-size:16px;font-weight:700;text-decoration:none;border:none;border-radius:24px;cursor:pointer;font-family:inherit}
  .btn-secondary{background:#fff;color:${PURPLE};border:1px solid ${PURPLE}}
  .row{display:flex;align-items:flex-start;gap:12px;padding:14px 0;border-bottom:1px solid #eee}
  .row:last-child{border-bottom:none}
  .row label{flex:1;font-size:15px;line-height:1.45;cursor:pointer}
  .row label strong{display:block;font-weight:700;margin-bottom:2px}
  .row label span{color:#6b6b78;font-size:13px}
  .checkbox{appearance:none;-webkit-appearance:none;width:22px;height:22px;border:2px solid #d0d0d8;border-radius:6px;cursor:pointer;flex-shrink:0;margin-top:2px;position:relative;background:#fff}
  .checkbox:checked{background:${PURPLE};border-color:${PURPLE}}
  .checkbox:checked::after{content:"";position:absolute;left:6px;top:2px;width:6px;height:11px;border:solid #fff;border-width:0 2px 2px 0;transform:rotate(45deg)}
  .actions{margin-top:28px;display:flex;gap:12px;flex-wrap:wrap;align-items:center}
  .unsub-link{color:${PURPLE};font-size:14px;text-decoration:underline;font-weight:600}
  .unsub-link:hover{opacity:0.85}
  .banner{background:#fff7e6;border:1px solid #ffe0a3;border-radius:12px;padding:14px 16px;margin:0 0 20px;font-size:14px;line-height:1.5;color:#7a5b00}
  .footer{text-align:center;margin-top:32px;color:rgba(255,255,255,0.7);font-size:12px}
  .footer a{color:rgba(255,255,255,0.9);text-decoration:underline}
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
     <p>For your security, email preference links expire after 30 days. To update your preferences, open the Wanna app and go to <strong>Profile → Settings → Notifications</strong>.</p>`,
  );
}

function errorPage(): string {
  return page(
    "Something went wrong",
    `<h1>Something went wrong</h1>
     <p>We couldn't update your preferences just now. Please try again, or open the Wanna app and go to <strong>Profile → Settings → Notifications</strong>.</p>`,
  );
}

function unsubscribedPage(manageHref: string): string {
  return page(
    "Unsubscribed",
    `<h1>You've been unsubscribed</h1>
     <p>You're unsubscribed from all optional Wanna emails. You'll still receive important account emails like password resets, email confirmations, and security alerts.</p>
     <p class="muted">Changed your mind? <a class="unsub-link" href="${escapeHtml(manageHref)}">Manage email preferences</a> to turn any category back on.</p>`,
  );
}

function savedPage(prefs: PrefsRow, manageHref: string): string {
  const allOff = CATEGORIES.every((c) => prefs[c.column] === false);
  if (allOff) {
    return unsubscribedPage(manageHref);
  }
  const onCount = CATEGORIES.filter((c) => prefs[c.column] !== false).length;
  return page(
    "Preferences saved",
    `<h1>Preferences saved</h1>
     <p>You're now opted in to <strong>${onCount}</strong> of <strong>${CATEGORIES.length}</strong> optional email categories.</p>
     <p class="muted">Account and security emails (password resets, confirmations, security alerts) always send regardless of these settings.</p>
     <p style="margin-top:24px;"><a class="unsub-link" href="${escapeHtml(manageHref)}">Update preferences</a></p>`,
  );
}

function managePage(
  email: string,
  prefs: PrefsRow,
  token: string,
  unsubHref: string,
): string {
  const allOff = CATEGORIES.every((c) => prefs[c.column] === false);
  const banner = allOff
    ? `<div class="banner">You're currently unsubscribed from all optional emails. Toggle any category below to re-subscribe.</div>`
    : "";
  const rows = CATEGORIES.map((c) => {
    const checked = prefs[c.column] !== false ? "checked" : "";
    const id = `pref-${c.key}`;
    return `<div class="row">
       <input class="checkbox" type="checkbox" id="${id}" name="${c.key}" value="on" ${checked}>
       <label for="${id}">
         <strong>${escapeHtml(c.title)}</strong>
         <span>${escapeHtml(c.blurb)}</span>
       </label>
     </div>`;
  }).join("\n");

  return page(
    "Email preferences",
    `<h1>Email preferences</h1>
     <p class="muted" style="margin-bottom:4px;">Email preferences for</p>
     <span class="email-pill">${escapeHtml(email)}</span>
     <p style="margin-top:18px;">Choose which kinds of email you want to receive from Wanna. Account and security emails always send.</p>
     ${banner}
     <form method="GET" action="">
       <input type="hidden" name="token" value="${escapeHtml(token)}">
       <input type="hidden" name="action" value="save">
       <h2>Notifications</h2>
       ${rows}
       <div class="actions">
         <button type="submit" class="btn">Save preferences</button>
         <a class="unsub-link" href="${escapeHtml(unsubHref)}">Or unsubscribe from all optional emails</a>
       </div>
     </form>`,
  );
}

// Set every per-type flag to false. Used by:
//   - GET ?token=... where token.type === "unsubscribe"
//   - POST ?token=... (RFC 8058 List-Unsubscribe-Post one-click)
async function unsubscribeAll(
  admin: ReturnType<typeof createClient>,
  uid: string,
): Promise<{ ok: boolean; error?: string }> {
  const updates: Record<string, boolean> = {};
  for (const c of CATEGORIES) updates[c.column] = false;
  const { error } = await admin.from("profiles").update(updates).eq("id", uid);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

async function fetchPrefsAndEmail(
  admin: ReturnType<typeof createClient>,
  uid: string,
): Promise<{ prefs: PrefsRow; email: string } | null> {
  const select = CATEGORIES.map((c) => c.column).join(", ");
  const [{ data: profile, error: profErr }, { data: userData }] =
    await Promise.all([
      admin.from("profiles").select(select).eq("id", uid).maybeSingle(),
      admin.auth.admin.getUserById(uid),
    ]);
  if (profErr || !profile || !userData?.user?.email) return null;
  const prefs: PrefsRow = {};
  for (const c of CATEGORIES) {
    // marketing_emails_enabled defaults true; per-type defaults false.
    // `null`/undefined falls back to the column default.
    const v = (profile as Record<string, unknown>)[c.column];
    if (typeof v === "boolean") {
      prefs[c.column] = v;
    } else {
      prefs[c.column] = c.column === "marketing_emails_enabled";
    }
  }
  return { prefs, email: userData.user.email };
}

serve(async (req) => {
  if (!EMAIL_PREFS_SECRET) {
    console.error("EMAIL_PREFS_SECRET not configured");
    return htmlResponse(errorPage(), 500);
  }

  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  if (!token) {
    return htmlResponse(expiredPage(), 400);
  }

  const payload = await verifyEmailPrefsToken(EMAIL_PREFS_SECRET, token);
  if (!payload) {
    return htmlResponse(expiredPage(), 400);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // ---- POST: RFC 8058 List-Unsubscribe-Post one-click ----
  // Gmail / Apple Mail hit this when the user taps the native
  // Unsubscribe button. Body is `List-Unsubscribe=One-Click`. We
  // unsub-all and respond 200 plain text — no HTML, no redirect.
  if (req.method === "POST") {
    const result = await unsubscribeAll(admin, payload.uid);
    if (!result.ok) {
      console.error("email-prefs POST unsubscribe failed", result.error);
      return new Response("error", { status: 500 });
    }
    return new Response("ok", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  if (req.method !== "GET") {
    return htmlResponse(errorPage(), 405);
  }

  const action = url.searchParams.get("action") ?? "";

  // Build a manage-link URL that we can hand back from save / unsub
  // confirmation pages so the user can flip things back on without
  // touching the app.
  const manageHref = `${url.origin}${url.pathname}?token=${encodeURIComponent(token)}`;

  // ---- Save action (form submit from manage page) ----
  if (action === "save") {
    const updates: Record<string, boolean> = {};
    for (const c of CATEGORIES) {
      updates[c.column] = url.searchParams.get(c.key) === "on";
    }
    const { error } = await admin
      .from("profiles")
      .update(updates)
      .eq("id", payload.uid);
    if (error) {
      console.error("email-prefs save failed", error);
      return htmlResponse(errorPage(), 500);
    }
    return htmlResponse(savedPage(updates, manageHref));
  }

  // ---- Direct unsubscribe (one-click GET, type=unsubscribe) ----
  if (payload.type === "unsubscribe") {
    const result = await unsubscribeAll(admin, payload.uid);
    if (!result.ok) {
      console.error("email-prefs GET unsubscribe failed", result.error);
      return htmlResponse(errorPage(), 500);
    }
    return htmlResponse(unsubscribedPage(manageHref));
  }

  // ---- Secondary "unsubscribe from all" link on the manage page ----
  // We keep using the same manage-type token here rather than minting a
  // second JWT — fewer tokens to round-trip, and the manage token already
  // proves the user owns the address.
  if (action === "unsubscribe_all") {
    const result = await unsubscribeAll(admin, payload.uid);
    if (!result.ok) {
      console.error("email-prefs unsubscribe_all failed", result.error);
      return htmlResponse(errorPage(), 500);
    }
    return htmlResponse(unsubscribedPage(manageHref));
  }

  // ---- Manage page (default) ----
  const ctx = await fetchPrefsAndEmail(admin, payload.uid);
  if (!ctx) {
    console.error("email-prefs profile lookup failed for", payload.uid);
    return htmlResponse(errorPage(), 500);
  }
  const unsubAllHref =
    `${url.origin}${url.pathname}?token=${encodeURIComponent(token)}&action=unsubscribe_all`;
  return htmlResponse(managePage(ctx.email, ctx.prefs, token, unsubAllHref));
});
