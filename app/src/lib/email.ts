// Thin client wrapper around the send-email edge function. All callers
// fire-and-forget — email is best-effort and should never block UX.
//
// Server-side `send-email` enforces:
//   - sender authorization per template
//   - is_seed / is_active / email_notifications_enabled gates
//   - debouncing per (recipient, template, context_id)
//
// So callers can safely fire on every relevant event without
// over-emailing the recipient.

import { supabase } from "./supabase";

interface SendMatchEmailArgs {
  recipient_id: string;
  match_id: string;
}
interface SendInterestEmailArgs {
  recipient_id: string;
  activity_id: string;
}
interface SendMeetupCheckEmailArgs {
  recipient_id: string;
  match_id: string;
}

type EmailArgs =
  | ({ template: "match" } & SendMatchEmailArgs)
  | ({ template: "interest" } & SendInterestEmailArgs)
  | ({ template: "meetup_check" } & SendMeetupCheckEmailArgs);

export async function sendEmail(args: EmailArgs): Promise<void> {
  try {
    const { error } = await supabase.functions.invoke("send-email", {
      body: args,
    });
    if (error) console.warn(`send-email (${args.template}) error:`, error.message);
  } catch (e) {
    console.warn(`send-email (${args.template}) exception:`, e);
  }
}

export const sendMatchEmail = (a: SendMatchEmailArgs) =>
  sendEmail({ template: "match", ...a });

export const sendInterestEmail = (a: SendInterestEmailArgs) =>
  sendEmail({ template: "interest", ...a });

export const sendMeetupCheckEmail = (a: SendMeetupCheckEmailArgs) =>
  sendEmail({ template: "meetup_check", ...a });
