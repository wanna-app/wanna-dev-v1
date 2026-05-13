// JSON-only backend for the email-preferences page.
//
// Why JSON-only: the Supabase Edge gateway adds
// `Content-Security-Policy: default-src 'none'; sandbox` and rewrites
// `Content-Type: text/plain` on every public (--no-verify-jwt)
// function response, which makes browsers render HTML responses as
// raw source. Neither header is overridable from inside the function.
//
// So the user-facing page is hosted off-platform (Netlify, at
// `notifications.joinwannaapp.com`, source in `web/notifications/`)
// and calls this function for the actual reads/writes.
//
// All requests carry the JWT-signed token minted by `send-email`'s
// shared `signEmailPrefsToken` helper — the link itself authenticates
// the user, no supabase.auth needed.
//
// Endpoints (all JSON):
//   GET  /                       → { email, prefs: { … }, all_off: bool }
//   POST /                       → save prefs from request body
//   POST /unsubscribe            → flip every category off (one-click)
//
// Request body for POST / save:
//   { token, prefs: { interest, match, message, meetup, new_activities, marketing } }
//
// Request body for POST /unsubscribe:
//   { token }
//
// CORS: open. The static page at notifications.joinwannaapp.com
// fetches us directly from the browser, so we need permissive CORS.
// The signed token in the URL/body is the only thing gating writes.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyEmailPrefsToken } from "../_shared/email-prefs-token.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EMAIL_PREFS_SECRET = Deno.env.get("EMAIL_PREFS_SECRET") ?? "";

// Source of truth is the profiles table. Both the in-app Settings
// page and the static notifications.joinwannaapp.com page read/write
// these same six columns. Same column set / ordering as the in-app
// SettingsScreen matrix UI.
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

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

async function getToken(req: Request, url: URL): Promise<string> {
  // Token can come from query string (GET) or body (POST). The
  // shape of the request differs by method but the token field is
  // always called `token`.
  const qs = url.searchParams.get("token");
  if (qs) return qs;
  if (req.method === "POST") {
    try {
      const body = await req.clone().json();
      return typeof body?.token === "string" ? body.token : "";
    } catch {
      return "";
    }
  }
  return "";
}

function defaultsForRow(): Record<string, boolean> {
  // marketing defaults true (welcome emails should reach by default);
  // all per-type notifs default false (opt-in).
  const out: Record<string, boolean> = {};
  for (const c of CATEGORIES) {
    out[c.column] = c.column === "marketing_emails_enabled";
  }
  return out;
}

function categoriesMeta() {
  // Shape the static page renders from. Stable order, no DB-column
  // names — the front-end shouldn't need to know those.
  return CATEGORIES.map((c) => ({
    key: c.key,
    title: c.title,
    blurb: c.blurb,
  }));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (!EMAIL_PREFS_SECRET) {
    return jsonResponse({ error: "EMAIL_PREFS_SECRET not configured" }, 500);
  }

  const url = new URL(req.url);
  const token = await getToken(req, url);
  if (!token) {
    return jsonResponse({ error: "missing token" }, 400);
  }
  const payload = await verifyEmailPrefsToken(EMAIL_PREFS_SECRET, token);
  if (!payload) {
    return jsonResponse({ error: "invalid or expired token" }, 401);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // ---- POST /unsubscribe — one-click flip everything off ----
  if (req.method === "POST" && url.pathname.endsWith("/unsubscribe")) {
    const updates: Record<string, boolean> = {};
    for (const c of CATEGORIES) updates[c.column] = false;
    const { error } = await admin
      .from("profiles")
      .update(updates)
      .eq("id", payload.uid);
    if (error) {
      return jsonResponse({ error: error.message }, 500);
    }
    return jsonResponse({ ok: true, all_off: true });
  }

  // ---- POST / — save prefs ----
  if (req.method === "POST") {
    let body: { token?: string; prefs?: Record<string, unknown> };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "invalid JSON body" }, 400);
    }
    const incoming = body.prefs ?? {};
    const updates: Record<string, boolean> = {};
    for (const c of CATEGORIES) {
      // Each key on the incoming `prefs` object is the category `key`;
      // we map back to the DB column name. Anything missing or
      // non-bool is treated as "off" — the static page should always
      // send the full set, but we don't want a partial payload to
      // partially write.
      updates[c.column] = incoming[c.key] === true;
    }
    const { error } = await admin
      .from("profiles")
      .update(updates)
      .eq("id", payload.uid);
    if (error) {
      return jsonResponse({ error: error.message }, 500);
    }
    const all_off = CATEGORIES.every((c) => updates[c.column] === false);
    return jsonResponse({ ok: true, prefs: prefsForFrontend(updates), all_off });
  }

  // ---- GET / — read current prefs + email ----
  if (req.method === "GET") {
    const select = CATEGORIES.map((c) => c.column).join(", ");
    const [{ data: profile, error: profErr }, { data: userData }] =
      await Promise.all([
        admin.from("profiles").select(select).eq("id", payload.uid)
          .maybeSingle(),
        admin.auth.admin.getUserById(payload.uid),
      ]);
    const email = userData?.user?.email ?? null;
    // Distinguish two failure modes:
    //   - profErr is set → an actual DB error (return 500)
    //   - profile or email missing → the auth.users row was deleted
    //     (account hard-deleted, e.g. via dashboard). The JWT is still
    //     cryptographically valid but points at nothing. Return 410
    //     Gone so the static page can render a clean "this account no
    //     longer exists" message instead of the generic error.
    if (profErr) {
      return jsonResponse({ error: "profile lookup failed" }, 500);
    }
    if (!profile || !email) {
      return jsonResponse({ error: "account no longer exists" }, 410);
    }
    const row: Record<string, boolean> = {};
    const defaults = defaultsForRow();
    for (const c of CATEGORIES) {
      const v = (profile as Record<string, unknown>)[c.column];
      row[c.column] = typeof v === "boolean" ? v : defaults[c.column];
    }
    const all_off = CATEGORIES.every((c) => row[c.column] === false);
    return jsonResponse({
      email,
      prefs: prefsForFrontend(row),
      all_off,
      categories: categoriesMeta(),
    });
  }

  return jsonResponse({ error: "method not allowed" }, 405);
});

// Map DB-column-keyed booleans → category-key-keyed booleans (which is
// what the static page consumes, indistinguishable from the input
// shape on save).
function prefsForFrontend(
  row: Record<string, boolean>,
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const c of CATEGORIES) {
    out[c.key] = row[c.column];
  }
  return out;
}
