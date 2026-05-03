-- 00036_meetup_dated_only.sql
--
-- Per product feedback: meetup check-in pushes (and the in-app modal) should
-- only fire for activities with a non-null `activity_date`, and only the day
-- AFTER the activity_date — never for undated/evergreen activities.
--
-- Changes:
--   1. Drop the undated path entirely. `materialize_chat_opened_meetup_check`
--      previously inserted a meetup_checks row when chat was first opened on
--      an UNDATED match. We now short-circuit it (no-op) so the existing
--      client call site is harmless until the client deploy lands.
--   2. Tighten `materialize_meetup_checks` to only consider DATED activities
--      whose `activity_date < CURRENT_DATE` (i.e. yesterday or earlier).
--   3. Expand `notification_log.notification_type` CHECK to allow 'meetup'
--      and 'new_activities' (added to send-push edge function in this batch).
--
-- Idempotent: CREATE OR REPLACE for functions; DROP CONSTRAINT IF EXISTS
-- + ADD CONSTRAINT for the CHECK.

-- =============================================================================
-- 1. Short-circuit chat-opened meetup-check insertion for undated matches.
--    The function is kept (and stays callable from older clients) but does
--    nothing. Once the client no longer calls it, we can drop it.
-- =============================================================================
CREATE OR REPLACE FUNCTION materialize_chat_opened_meetup_check(
  p_other_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- Intentionally no-op: meetup checks only fire for dated activities now,
  -- via materialize_meetup_checks() the day after activity_date.
  PERFORM 1 WHERE p_other_user_id IS NOT NULL;
END;
$$;

-- =============================================================================
-- 2. Tighten materialize_meetup_checks: dated activities only, day after.
-- =============================================================================
CREATE OR REPLACE FUNCTION materialize_meetup_checks()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_inserted integer := 0;
BEGIN
  WITH eligible AS (
    SELECT m.id AS match_id
    FROM matches m
    JOIN activities a ON a.id = m.activity_id
    WHERE (m.poster_id = v_uid OR m.interested_id = v_uid)
      AND m.status = 'active'
      AND a.activity_date IS NOT NULL
      AND a.activity_date < CURRENT_DATE
  ),
  inserted AS (
    INSERT INTO meetup_checks (match_id, user_id, trigger_type, triggered_at)
    SELECT match_id, v_uid, 'date_passed', now()
    FROM eligible e
    WHERE NOT EXISTS (
      SELECT 1 FROM meetup_checks mc
      WHERE mc.match_id = e.match_id AND mc.user_id = v_uid
    )
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_inserted FROM inserted;
  RETURN v_inserted;
END;
$$;

-- =============================================================================
-- 3. Expand notification_log type CHECK to allow new push types.
-- =============================================================================
ALTER TABLE notification_log
  DROP CONSTRAINT IF EXISTS notification_log_notification_type_check;

ALTER TABLE notification_log
  ADD CONSTRAINT notification_log_notification_type_check
  CHECK (notification_type IN (
    'interest', 'match', 'message', 'meetup', 'new_activities'
  ));
