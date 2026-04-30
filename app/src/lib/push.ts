// Thin client wrapper around the send-push edge function. All three
// trigger points (interest, match, message) call this in
// fire-and-forget mode — push is best-effort and should never block UX.

import { supabase } from "./supabase";

interface InterestPushArgs {
  type: "interest";
  activity_id: string;
  poster_id: string;
  interested_user_name: string;
  activity_title: string;
}
interface MatchPushArgs {
  type: "match";
  match_id: string;
  poster_id: string;
  interested_id: string;
  poster_name: string;
  interested_name: string;
  activity_title: string;
}
interface MessagePushArgs {
  type: "message";
  message_id: string;
  match_id: string;
  recipient_id: string;
  sender_id: string;
  sender_name: string;
  body_preview: string;
}

export type PushArgs = InterestPushArgs | MatchPushArgs | MessagePushArgs;

export async function sendPush(args: PushArgs): Promise<void> {
  try {
    const { error } = await supabase.functions.invoke("send-push", {
      body: args,
    });
    if (error) console.warn(`send-push (${args.type}) error:`, error.message);
  } catch (e) {
    console.warn(`send-push (${args.type}) exception:`, e);
  }
}
