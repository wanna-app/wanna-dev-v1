// Edge function: pre-publish text moderation via OpenAI Moderations API.
//
// Called by the client before inserting user-generated text (chat
// messages, activity titles + descriptions). If the model flags the
// content as violating policy, we return allowed:false with a category
// hint; the client renders a polite "please keep messages respectful"
// error and aborts the insert.
//
// OpenAI's Moderation endpoint is FREE (zero cost per call) and
// designed exactly for this use case. We use the `omni-moderation-latest`
// model which is the current default and handles multimodal+text.
//
// Auth: caller must be a signed-in user. The function never persists
// the text itself — moderation results are not logged.
//
// Deploy with: supabase functions deploy moderate-text

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const OPENAI_MODEL = "omni-moderation-latest";

// Categories we treat as "hard reject." OpenAI returns a `categories`
// object with all flags; we whitelist what we hard-reject so that
// edge-case flags (e.g. "hate" with a low score on something innocuous)
// don't false-positive. These are the categories the model has high
// precision on.
const HARD_REJECT_CATEGORIES = new Set<string>([
  "sexual",
  "sexual/minors",
  "hate",
  "hate/threatening",
  "harassment/threatening",
  "self-harm",
  "self-harm/intent",
  "self-harm/instructions",
  "violence",
  "violence/graphic",
]);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ModerationRequest {
  text: string;
  context?: "message" | "activity"; // logged in analytics, not used in logic
}

interface ModerationResponse {
  allowed: boolean;
  // Generic, user-facing reason. Never expose category specifics —
  // attackers iterate on the rejection reason to craft borderline
  // content. Generic "doesn't meet community guidelines" is enough.
  reason?: string;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "POST only" }, 405);
  }

  // Caller must be authenticated. Same pattern as link-preview etc.
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return jsonResponse({ error: "missing auth" }, 401);
  }
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await client.auth.getUser();
  if (userErr || !userData?.user) {
    return jsonResponse({ error: "invalid auth" }, 401);
  }

  let body: ModerationRequest;
  try {
    body = (await req.json()) as ModerationRequest;
  } catch {
    return jsonResponse({ error: "invalid JSON" }, 400);
  }

  const text = (body.text ?? "").trim();
  if (!text) {
    // Empty / whitespace text isn't moderatable — let the caller's own
    // length validators reject it.
    return jsonResponse({ allowed: true } satisfies ModerationResponse);
  }

  if (!OPENAI_API_KEY) {
    // No key configured — fail open. Better than blocking every send
    // because of a misconfigured secret. Surfaced via Sentry/logs.
    console.warn("moderate-text: OPENAI_API_KEY not set, failing open");
    return jsonResponse({ allowed: true } satisfies ModerationResponse);
  }

  try {
    const res = await fetch("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        input: text,
      }),
    });
    if (!res.ok) {
      // OpenAI outage / rate limit. Fail open so users aren't blocked
      // from sending messages; rely on post-hoc reporting for the gap.
      console.warn(
        "moderate-text: OpenAI HTTP",
        res.status,
        await res.text().catch(() => "")
      );
      return jsonResponse({ allowed: true } satisfies ModerationResponse);
    }
    const data = await res.json();
    const result = data?.results?.[0];
    if (!result) {
      return jsonResponse({ allowed: true } satisfies ModerationResponse);
    }
    const categories: Record<string, boolean> = result.categories ?? {};
    // Reject if ANY hard-reject category is flagged true.
    for (const cat of Object.keys(categories)) {
      if (categories[cat] && HARD_REJECT_CATEGORIES.has(cat)) {
        return jsonResponse({
          allowed: false,
          reason:
            "This message doesn't meet our community guidelines. Please rephrase and try again.",
        } satisfies ModerationResponse);
      }
    }
    return jsonResponse({ allowed: true } satisfies ModerationResponse);
  } catch (e) {
    // Network exception — fail open, log to Sentry.
    console.warn("moderate-text: fetch error", e);
    return jsonResponse({ allowed: true } satisfies ModerationResponse);
  }
});
