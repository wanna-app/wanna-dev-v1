-- 00034_notification_prefs.sql
--
-- Per-type x per-channel notification preferences. Replaces the single
-- `email_notifications_enabled` flag (kept for backward compatibility) with
-- a structured grid: 5 notification types (interest, match, message,
-- meetup, new_activities) x 2 channels (push, email).
--
-- New code reads the per-type columns directly. The legacy column stays so
-- existing edge functions / cron jobs don't break mid-deploy.
--
-- Idempotent: safe to re-run.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notify_interest_push        boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_interest_email       boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_match_push           boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_match_email          boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_message_push         boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_message_email        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_meetup_push          boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_meetup_email         boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_new_activities_push  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_new_activities_email boolean NOT NULL DEFAULT false;

-- Backfill: respect any existing email-off setting on the legacy column.
-- Only updates rows that were explicitly opted out, leaving everyone else
-- on the new defaults.
UPDATE public.profiles
SET notify_interest_email = false,
    notify_match_email    = false,
    notify_meetup_email   = false
WHERE email_notifications_enabled = false;
