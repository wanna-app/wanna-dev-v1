// Edge function: GDPR data export (PRD AC-PR-11).
//
// Returns the calling user's full data bundle as JSON for direct
// download by the client. Includes everything they own or are part of:
// profile, prefs, activities, swipes, interest_queue, matches,
// messages, blocks, reports they filed, photo_moderation rows.
//
// We don't email — the client triggers a Share / Save dialog with the
// returned blob. This keeps us decoupled from any email provider until
// one's wired up.
//
// Deploy: supabase functions deploy export-user-data
//
// PRD says "within 48h" — we serve synchronously since the data sizes
// are tiny for the foreseeable user base.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST")
    return jsonResponse({ error: "POST only" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return jsonResponse({ error: "missing auth" }, 401);
  }

  // Use the caller's JWT — RLS automatically scopes everything to their
  // own data, so we can't accidentally leak anyone else's rows even if
  // a query is wrong.
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    return jsonResponse({ error: "invalid auth" }, 401);
  }
  const userId = userData.user.id;

  // Pull everything in parallel
  const [
    profile,
    discoveryPrefs,
    activities,
    swipesByMe,
    queueAsInterested,
    matchesAsPoster,
    matchesAsInterested,
    messages,
    meetupChecks,
    blocksByMe,
    reportsByMe,
    photoModeration,
    deviceTokens,
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
    supabase
      .from("discovery_preferences")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.from("activities").select("*").eq("user_id", userId),
    supabase.from("swipes").select("*").eq("swiper_id", userId),
    supabase
      .from("interest_queue")
      .select("*")
      .eq("interested_user_id", userId),
    supabase.from("matches").select("*").eq("poster_id", userId),
    supabase.from("matches").select("*").eq("interested_id", userId),
    supabase.from("messages").select("*").eq("sender_id", userId),
    supabase.from("meetup_checks").select("*").eq("user_id", userId),
    supabase.from("blocks").select("*").eq("blocker_id", userId),
    supabase.from("reports").select("*").eq("reporter_id", userId),
    supabase.from("photo_moderation").select("*").eq("user_id", userId),
    supabase.from("device_tokens").select("*").eq("user_id", userId),
  ]);

  const matches = [
    ...(matchesAsPoster.data ?? []),
    ...(matchesAsInterested.data ?? []),
  ];

  const bundle = {
    exported_at: new Date().toISOString(),
    user_id: userId,
    auth_email: userData.user.email,
    auth_created_at: userData.user.created_at,
    profile: profile.data,
    discovery_preferences: discoveryPrefs.data,
    activities: activities.data ?? [],
    swipes: swipesByMe.data ?? [],
    interest_queue_entries: queueAsInterested.data ?? [],
    matches,
    messages_sent: messages.data ?? [],
    meetup_checks: meetupChecks.data ?? [],
    blocks: blocksByMe.data ?? [],
    reports_filed: reportsByMe.data ?? [],
    photo_moderation: photoModeration.data ?? [],
    device_tokens:
      deviceTokens.data?.map((t) => ({
        ...t,
        // Don't echo the actual push token — it's a credential
        expo_push_token: "[redacted]",
      })) ?? [],
    note:
      "This is your full Wanna data export. Profile photos themselves are stored in Supabase Storage; the `photos` array contains the storage paths. To request your raw image files, contact support.",
  };

  return jsonResponse(bundle);
});
