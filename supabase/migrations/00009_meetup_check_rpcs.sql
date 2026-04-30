-- Meetup check support: RPCs that find newly-eligible matches and
-- materialize a meetup_checks row, then return the next pending check
-- for the current user. The app calls these on every foreground
-- transition (Section 5.9).

-- =============================================================================
-- materialize_meetup_checks
-- For every active match the current user is part of, ensure a meetup_checks
-- row exists IF the match is eligible (per PRD §5.9):
--   - Dated activity: eligible the day after activity_date
--   - Undated: eligible 72h after matched_at
-- (chat_opened trigger is handled inline in ChatScreen.)
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
  -- Dated activities whose date passed yesterday or earlier
  WITH eligible AS (
    SELECT m.id AS match_id, a.activity_date,
      CASE
        WHEN a.activity_date IS NOT NULL THEN 'date_passed'
        ELSE 'timer_72h'
      END AS trigger_type
    FROM matches m
    JOIN activities a ON a.id = m.activity_id
    WHERE (m.poster_id = v_uid OR m.interested_id = v_uid)
      AND m.status = 'active'
      AND (
        (a.activity_date IS NOT NULL AND a.activity_date < CURRENT_DATE)
        OR (a.activity_date IS NULL AND m.matched_at < now() - INTERVAL '72 hours')
      )
  ),
  inserted AS (
    INSERT INTO meetup_checks (match_id, user_id, trigger_type, triggered_at)
    SELECT match_id, v_uid, trigger_type, now()
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
-- materialize_chat_opened_meetup_check
-- Called from the chat screen on first open of a thread (per PRD §5.9 trigger
-- "chat_opened"). Inserts a meetup_checks row immediately for *undated*
-- matches if none exists.
-- =============================================================================
CREATE OR REPLACE FUNCTION materialize_chat_opened_meetup_check(
  p_other_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  INSERT INTO meetup_checks (match_id, user_id, trigger_type, triggered_at)
  SELECT m.id, v_uid, 'chat_opened', now()
  FROM matches m
  JOIN activities a ON a.id = m.activity_id
  WHERE m.status = 'active'
    AND a.activity_date IS NULL
    AND (
      (m.poster_id = v_uid AND m.interested_id = p_other_user_id)
      OR (m.interested_id = v_uid AND m.poster_id = p_other_user_id)
    )
    AND NOT EXISTS (
      SELECT 1 FROM meetup_checks mc
      WHERE mc.match_id = m.id AND mc.user_id = v_uid
    );
END;
$$;

-- =============================================================================
-- get_pending_meetup_check
-- Returns the next pending meetup check the user hasn't responded to and
-- hasn't dismissed 3+ times. One row at a time so the app can show a single
-- modal per launch.
-- =============================================================================
CREATE OR REPLACE FUNCTION get_pending_meetup_check()
RETURNS TABLE (
  meetup_check_id uuid,
  match_id uuid,
  activity_id uuid,
  activity_title text,
  other_user_id uuid,
  other_user_name text,
  other_user_photo text,
  trigger_type text,
  dismiss_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  RETURN QUERY
  SELECT
    mc.id AS meetup_check_id,
    m.id AS match_id,
    a.id AS activity_id,
    a.title AS activity_title,
    other.id AS other_user_id,
    other.first_name AS other_user_name,
    other.photos[1] AS other_user_photo,
    mc.trigger_type,
    mc.dismiss_count
  FROM meetup_checks mc
  JOIN matches m ON m.id = mc.match_id
  JOIN activities a ON a.id = m.activity_id
  JOIN profiles other ON other.id = CASE
    WHEN m.poster_id = v_uid THEN m.interested_id ELSE m.poster_id
  END
  WHERE mc.user_id = v_uid
    AND mc.did_meet IS NULL
    AND mc.dismiss_count < 3
    AND m.status = 'active'
  ORDER BY mc.triggered_at ASC
  LIMIT 1;
END;
$$;
