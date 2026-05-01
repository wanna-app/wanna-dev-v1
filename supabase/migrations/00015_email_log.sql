-- Email observability + debouncing.
--
-- The send-email edge function logs every send attempt here so we can:
-- 1. Debounce repeats (e.g., max 1 interest email per recipient per
--    activity per 24h, max 1 match email per match)
-- 2. Audit deliverability via Resend ticket ids
-- 3. Track skips (seed users, inactive users, opted-out users) without
--    silently dropping events

CREATE TABLE email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  recipient_email text NOT NULL,           -- frozen at send time so we can audit
                                           -- even after the user deletes
  template text NOT NULL,                  -- 'match' | 'interest' | 'meetup_check' | 'auth' | 'transactional'
  context_id uuid,                         -- match_id / activity_id / meetup_check_id
  resend_message_id text,                  -- Resend's id for tracking
  status text NOT NULL DEFAULT 'sent' CHECK (status IN (
    'sent', 'failed', 'skipped'
  )),
  reason text,                             -- why skipped or how it failed
  sent_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_log_dedupe
  ON email_log(recipient_id, template, context_id, sent_at);
CREATE INDEX idx_email_log_recipient
  ON email_log(recipient_id, sent_at DESC);

ALTER TABLE email_log ENABLE ROW LEVEL SECURITY;

-- Users can see their own email log (future "email history" UI)
CREATE POLICY "Users can view their own email log"
  ON email_log FOR SELECT TO authenticated
  USING (recipient_id = auth.uid());
-- Inserts done by edge function as service role.

-- Per-user opt-out. Default true (opted in) for now; add an unsubscribe
-- mechanism + per-template granularity later (DEFERRED.md).
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS email_notifications_enabled boolean
    NOT NULL DEFAULT true;
