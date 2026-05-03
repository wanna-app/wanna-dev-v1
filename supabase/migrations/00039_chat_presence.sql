-- 00039_chat_presence.sql
--
-- Chat presence heartbeat (T6).
--
-- Suppresses message pushes when the recipient is currently viewing the
-- chat with the sender. The client upserts a row on ChatScreen mount and
-- refreshes every 25s; the row is removed on unmount. The send-push edge
-- function checks for a heartbeat newer than 30s before queuing a push.
--
-- Idempotent.

CREATE TABLE IF NOT EXISTS chat_presence (
  viewer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  other_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  last_heartbeat timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (viewer_id, other_user_id)
);

ALTER TABLE chat_presence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "User manages own presence" ON chat_presence;
CREATE POLICY "User manages own presence"
  ON chat_presence FOR ALL TO authenticated
  USING (viewer_id = auth.uid())
  WITH CHECK (viewer_id = auth.uid());

-- Service role bypasses RLS automatically; no explicit policy needed.

CREATE INDEX IF NOT EXISTS chat_presence_heartbeat_idx
  ON chat_presence (last_heartbeat);
