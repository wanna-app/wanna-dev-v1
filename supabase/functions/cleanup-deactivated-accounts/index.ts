// Edge function: cleanup-deactivated-accounts
//
// Called daily at 03:15 UTC by pg_cron (see migration 00019). Hard-deletes
// auth.users rows for profiles where deactivated_at < now() - 30 days.
// The auth deletion cascades to the profile row (FK ON DELETE CASCADE).
//
// Deploy: supabase functions deploy cleanup-deactivated-accounts

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const RETENTION_DAYS = 30;

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

  // Verify caller is service-role (cron / admin only)
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer /, "");
  if (token !== SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000)
    .toISOString();

  const { data: expired, error: fetchErr } = await adminClient
    .from("profiles")
    .select("id, deactivated_at")
    .not("deactivated_at", "is", null)
    .lt("deactivated_at", cutoff);

  if (fetchErr) {
    console.error("Failed to query expired deactivations:", fetchErr.message);
    return jsonResponse({ error: fetchErr.message }, 500);
  }

  const targets = expired ?? [];
  console.log(
    `cleanup-deactivated-accounts: found ${targets.length} expired account(s) to delete (cutoff ${cutoff})`
  );

  if (targets.length === 0) {
    return jsonResponse({ status: "ok", deleted: 0 });
  }

  let deleted = 0;
  let failed = 0;
  const errors: Array<{ user_id: string; error: string }> = [];

  for (const t of targets) {
    try {
      // auth.admin.deleteUser cascades to profile (FK ON DELETE CASCADE)
      const { error } = await adminClient.auth.admin.deleteUser(t.id);
      if (error) {
        failed++;
        errors.push({ user_id: t.id, error: error.message });
        console.warn(`Delete failed for ${t.id}:`, error.message);
      } else {
        deleted++;
        console.log(
          `Deleted user ${t.id} (deactivated_at=${t.deactivated_at})`
        );
      }
    } catch (e: unknown) {
      failed++;
      const msg = e instanceof Error ? e.message : String(e);
      errors.push({ user_id: t.id, error: msg });
      console.warn(`Delete threw for ${t.id}:`, msg);
    }
  }

  console.log(
    `cleanup-deactivated-accounts complete: ${deleted} deleted, ${failed} failed`
  );

  return jsonResponse({
    status: "ok",
    cutoff,
    deleted,
    failed,
    errors: errors.length > 0 ? errors : undefined,
  });
});
