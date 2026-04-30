-- Push notifications infrastructure.
--
-- device_tokens: one row per Expo Push Token a user has registered.
-- A user can have multiple (phone + tablet, etc.). Tokens are NOT
-- shared across users — when a user signs out we delete the row.
--
-- notification_log: per-recipient ledger of sent pushes. Used for
-- debouncing repeated notifications (e.g., AC-SW-09: max 1 interest
-- alert per activity per 15 minutes).

CREATE TABLE device_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  expo_push_token text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  device_name text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_token UNIQUE (expo_push_token)
);

CREATE INDEX idx_device_tokens_user ON device_tokens(user_id);

ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own device tokens"
  ON device_tokens FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- =============================================================================
CREATE TABLE notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  notification_type text NOT NULL CHECK (notification_type IN (
    'interest', 'match', 'message'
  )),
  context_id uuid,                  -- activity_id / match_id / message_id
  expo_ticket_id text,              -- Expo's receipt id, if recorded
  status text NOT NULL DEFAULT 'sent' CHECK (status IN (
    'sent', 'failed', 'skipped'
  )),
  reason text,                      -- why skipped or how it failed
  sent_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notif_log_dedupe
  ON notification_log(recipient_id, notification_type, context_id, sent_at);

ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;

-- Users can view notifications sent to them (for an in-app inbox later).
CREATE POLICY "Users can view their own notification log"
  ON notification_log FOR SELECT TO authenticated
  USING (recipient_id = auth.uid());
-- Inserts are done by the edge function (service role bypass).
