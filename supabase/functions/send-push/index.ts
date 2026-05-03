// Edge function: send a push via Expo Push API.
//
// The client invokes this immediately after performing one of three
// actions, and the function:
//   1. Validates that the caller has the right to push the recipient(s)
//      for that action (e.g., only the message sender can push the
//      recipient about a new message).
//   2. Checks recipient is_seed → skip (PRD AC-SD-06).
//   3. Applies dedup rules (interest alerts: max 1 per activity per
//      15min, AC-SW-09).
//   4. Looks up Expo push tokens via the service role client (so it
//      can read other users' tokens without breaking RLS).
//   5. Sends to https://exp.host/--/api/v2/push/send.
//   6. Logs the result to notification_log.
//
// Deploy:  supabase functions deploy send-push
// Secret:  SUPABASE_SERVICE_ROLE_KEY (set automatically by Supabase
//          when the function runs as the project's service role).

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const INTEREST_DEBOUNCE_MS = 15 * 60 * 1000; // PRD AC-SW-09: 15 minutes

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type NotificationType =
  | "interest"
  | "match"
  | "message"
  | "meetup"
  | "new_activities";

interface InterestPayload {
  type: "interest";
  activity_id: string;
  poster_id: string;        // recipient
  interested_user_name: string;
  activity_title: string;
}

interface MatchPayload {
  type: "match";
  match_id: string;
  poster_id: string;
  interested_id: string;
  poster_name: string;
  interested_name: string;
  activity_title: string;
}

interface MessagePayload {
  type: "message";
  message_id: string;
  match_id: string;
  recipient_id: string;     // the other user in the match
  sender_id: string;
  sender_name: string;
  body_preview: string;
}

interface MeetupPayload {
  type: "meetup";
  match_id: string;
  recipient_id: string;
  other_user_name: string;
  activity_title: string;
}

interface NewActivitiesPayload {
  type: "new_activities";
  recipient_id: string;
  count: number;
}

type Payload =
  | InterestPayload
  | MatchPayload
  | MessagePayload
  | MeetupPayload
  | NewActivitiesPayload;

interface PushTask {
  recipient_id: string;
  type: NotificationType;
  context_id: string;
  title: string;
  body: string;
  data: Record<string, any>;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

async function sendToExpo(
  tokens: string[],
  title: string,
  body: string,
  data: Record<string, any>
): Promise<{ ticketIds: string[]; errors: string[] }> {
  if (tokens.length === 0) return { ticketIds: [], errors: [] };
  const messages = tokens.map((to) => ({
    to,
    title,
    body,
    data,
    sound: "default" as const,
  }));
  const res = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
    },
    body: JSON.stringify(messages),
  });
  if (!res.ok) {
    return { ticketIds: [], errors: [`Expo HTTP ${res.status}`] };
  }
  const json = await res.json();
  const ticketIds: string[] = [];
  const errors: string[] = [];
  // Single message → object; multi → array
  const tickets = Array.isArray(json.data) ? json.data : [json.data];
  for (const t of tickets) {
    if (!t) continue;
    if (t.status === "ok" && t.id) ticketIds.push(t.id);
    else if (t.message) errors.push(t.message);
  }
  return { ticketIds, errors };
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

  // anonClient: scoped to the caller's JWT — used for sender authorization
  // checks. RLS prevents cross-user data leaks.
  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await anonClient.auth.getUser();
  if (userErr || !userData?.user) {
    return jsonResponse({ error: "invalid auth" }, 401);
  }
  const callerId = userData.user.id;

  // adminClient: bypasses RLS — used for token lookup and notification_log
  // inserts where we legitimately need cross-user access.
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let payload: Payload;
  try {
    payload = (await req.json()) as Payload;
  } catch {
    return jsonResponse({ error: "invalid JSON" }, 400);
  }

  const tasks: PushTask[] = [];

  // Authorization + task assembly per type
  if (payload.type === "interest") {
    // Caller must be the user who actually expressed interest. The cleanest
    // check is to verify a swipe (direction='like') exists for them on
    // this activity.
    const { data: swipe } = await anonClient
      .from("swipes")
      .select("id")
      .eq("swiper_id", callerId)
      .eq("activity_id", payload.activity_id)
      .eq("direction", "like")
      .maybeSingle();
    if (!swipe) return jsonResponse({ error: "not authorized" }, 403);

    tasks.push({
      recipient_id: payload.poster_id,
      type: "interest",
      context_id: payload.activity_id,
      title: "Someone's in 👀",
      body: `${payload.interested_user_name} wants to join you for ${payload.activity_title}`,
      data: {
        type: "interest",
        activity_id: payload.activity_id,
      },
    });
  } else if (payload.type === "match") {
    // Caller must be one of the two parties in the match.
    const { data: match } = await anonClient
      .from("matches")
      .select("poster_id, interested_id, status")
      .eq("id", payload.match_id)
      .maybeSingle();
    if (
      !match ||
      (match.poster_id !== callerId && match.interested_id !== callerId)
    )
      return jsonResponse({ error: "not authorized" }, 403);

    // Both parties get a push.
    tasks.push({
      recipient_id: payload.poster_id,
      type: "match",
      context_id: payload.match_id,
      title: "It's a match!",
      body: `You and ${payload.interested_name} are on for ${payload.activity_title}. Say hi 👋`,
      data: {
        type: "match",
        match_id: payload.match_id,
        other_user_id: payload.interested_id,
      },
    });
    tasks.push({
      recipient_id: payload.interested_id,
      type: "match",
      context_id: payload.match_id,
      title: "It's a match!",
      body: `You and ${payload.poster_name} are on for ${payload.activity_title}. Say hi 👋`,
      data: {
        type: "match",
        match_id: payload.match_id,
        other_user_id: payload.poster_id,
      },
    });
  } else if (payload.type === "message") {
    // Caller must be the sender of the message; recipient must be a
    // participant in that match.
    const { data: msg } = await anonClient
      .from("messages")
      .select("id, sender_id, match_id")
      .eq("id", payload.message_id)
      .maybeSingle();
    if (!msg || msg.sender_id !== callerId)
      return jsonResponse({ error: "not authorized" }, 403);

    const { data: match } = await anonClient
      .from("matches")
      .select("poster_id, interested_id")
      .eq("id", msg.match_id)
      .maybeSingle();
    if (!match) return jsonResponse({ error: "not authorized" }, 403);
    const recipient =
      match.poster_id === callerId ? match.interested_id : match.poster_id;
    if (recipient !== payload.recipient_id)
      return jsonResponse({ error: "recipient mismatch" }, 403);

    tasks.push({
      recipient_id: recipient,
      type: "message",
      context_id: payload.message_id,
      title: payload.sender_name,
      body: payload.body_preview.length > 80
        ? payload.body_preview.slice(0, 77) + "..."
        : payload.body_preview,
      data: {
        type: "message",
        match_id: msg.match_id,
        sender_id: callerId,
      },
    });
  } else if (payload.type === "meetup") {
    // Caller must be a participant in the match.
    const { data: match } = await anonClient
      .from("matches")
      .select("poster_id, interested_id")
      .eq("id", payload.match_id)
      .maybeSingle();
    if (
      !match ||
      (match.poster_id !== callerId && match.interested_id !== callerId)
    )
      return jsonResponse({ error: "not authorized" }, 403);

    tasks.push({
      recipient_id: payload.recipient_id,
      type: "meetup",
      context_id: payload.match_id,
      title: "How'd it go?",
      body: `Did you and ${payload.other_user_name} meet up for ${payload.activity_title}?`,
      data: {
        type: "meetup",
        match_id: payload.match_id,
      },
    });
  } else if (payload.type === "new_activities") {
    // Service-role / cron-only path: callerId must equal recipient_id, OR
    // we trust the JWT (any signed-in user can request their own digest).
    if (callerId !== payload.recipient_id)
      return jsonResponse({ error: "not authorized" }, 403);

    tasks.push({
      recipient_id: payload.recipient_id,
      type: "new_activities",
      context_id: payload.recipient_id,
      title: "New plans in your area",
      body: `${payload.count} new activities posted near you this week. Wanna?`,
      data: {
        type: "new_activities",
      },
    });
  } else {
    return jsonResponse({ error: "unknown type" }, 400);
  }

  // Per-recipient processing
  const results: Array<{
    recipient_id: string;
    status: "sent" | "skipped" | "failed";
    reason?: string;
  }> = [];

  for (const task of tasks) {
    // is_seed guard + per-type push prefs
    const { data: prof } = await adminClient
      .from("profiles")
      .select(
        "is_seed, is_active, notify_interest_push, notify_match_push, notify_message_push, notify_meetup_push, notify_new_activities_push"
      )
      .eq("id", task.recipient_id)
      .maybeSingle();
    if (!prof || !prof.is_active) {
      await adminClient.from("notification_log").insert({
        recipient_id: task.recipient_id,
        notification_type: task.type,
        context_id: task.context_id,
        status: "skipped",
        reason: prof ? "inactive" : "no profile",
      });
      results.push({
        recipient_id: task.recipient_id,
        status: "skipped",
        reason: prof ? "inactive" : "no profile",
      });
      continue;
    }
    if (prof.is_seed) {
      await adminClient.from("notification_log").insert({
        recipient_id: task.recipient_id,
        notification_type: task.type,
        context_id: task.context_id,
        status: "skipped",
        reason: "seed user",
      });
      results.push({
        recipient_id: task.recipient_id,
        status: "skipped",
        reason: "seed user",
      });
      continue;
    }

    // Per-type push pref gate. Defaults to true if column missing.
    const prefMap: Record<NotificationType, boolean> = {
      interest: (prof as any).notify_interest_push ?? true,
      match: (prof as any).notify_match_push ?? true,
      message: (prof as any).notify_message_push ?? true,
      meetup: (prof as any).notify_meetup_push ?? true,
      new_activities: (prof as any).notify_new_activities_push ?? true,
    };
    if (prefMap[task.type] === false) {
      await adminClient.from("notification_log").insert({
        recipient_id: task.recipient_id,
        notification_type: task.type,
        context_id: task.context_id,
        status: "skipped",
        reason: "pref_off",
      });
      results.push({
        recipient_id: task.recipient_id,
        status: "skipped",
        reason: "pref_off",
      });
      continue;
    }

    // Debounce: interest alerts max 1 per activity per 15 min
    if (task.type === "interest") {
      const since = new Date(Date.now() - INTEREST_DEBOUNCE_MS).toISOString();
      const { data: recent } = await adminClient
        .from("notification_log")
        .select("id")
        .eq("recipient_id", task.recipient_id)
        .eq("notification_type", "interest")
        .eq("context_id", task.context_id)
        .gte("sent_at", since)
        .limit(1);
      if (recent && recent.length > 0) {
        await adminClient.from("notification_log").insert({
          recipient_id: task.recipient_id,
          notification_type: "interest",
          context_id: task.context_id,
          status: "skipped",
          reason: "debounced",
        });
        results.push({
          recipient_id: task.recipient_id,
          status: "skipped",
          reason: "debounced",
        });
        continue;
      }
    }

    // Token lookup (admin client: cross-user reads are intentional here)
    const { data: tokens } = await adminClient
      .from("device_tokens")
      .select("expo_push_token")
      .eq("user_id", task.recipient_id);
    const tokenStrings = (tokens ?? []).map((t) => t.expo_push_token);
    if (tokenStrings.length === 0) {
      await adminClient.from("notification_log").insert({
        recipient_id: task.recipient_id,
        notification_type: task.type,
        context_id: task.context_id,
        status: "skipped",
        reason: "no tokens",
      });
      results.push({
        recipient_id: task.recipient_id,
        status: "skipped",
        reason: "no tokens",
      });
      continue;
    }

    const { ticketIds, errors } = await sendToExpo(
      tokenStrings,
      task.title,
      task.body,
      task.data
    );

    if (ticketIds.length === 0) {
      await adminClient.from("notification_log").insert({
        recipient_id: task.recipient_id,
        notification_type: task.type,
        context_id: task.context_id,
        status: "failed",
        reason: errors[0] ?? "unknown",
      });
      results.push({
        recipient_id: task.recipient_id,
        status: "failed",
        reason: errors[0] ?? "unknown",
      });
      continue;
    }

    // Log one row per ticket so we can correlate with Expo receipts later.
    for (const ticketId of ticketIds) {
      await adminClient.from("notification_log").insert({
        recipient_id: task.recipient_id,
        notification_type: task.type,
        context_id: task.context_id,
        status: "sent",
        expo_ticket_id: ticketId,
      });
    }
    results.push({ recipient_id: task.recipient_id, status: "sent" });
  }

  return jsonResponse({ results });
});
