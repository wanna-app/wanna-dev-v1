-- Chat RPCs: consolidated conversation list, unified message thread,
-- mark-as-read, and unread-count helper. Conversations are consolidated
-- per user-pair across all shared matches (Section 6.2).

-- =============================================================================
-- get_conversations_list
-- One row per other-user the current user has matches with (active or
-- read-only). Returns last message preview, unread count, and the list of
-- shared activity ids/titles.
-- =============================================================================
CREATE OR REPLACE FUNCTION get_conversations_list()
RETURNS TABLE (
  other_user_id uuid,
  other_user_name text,
  other_user_photo text,
  other_user_verified boolean,
  shared_activity_ids uuid[],
  shared_activity_titles text[],
  has_active_match boolean,
  last_message_id uuid,
  last_message_body text,
  last_message_at timestamptz,
  last_message_from_me boolean,
  unread_count integer
) AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  RETURN QUERY
  WITH user_matches AS (
    SELECT
      m.id AS match_id,
      m.activity_id,
      m.status,
      CASE WHEN m.poster_id = v_uid THEN m.interested_id ELSE m.poster_id END AS other_id
    FROM matches m
    WHERE m.poster_id = v_uid OR m.interested_id = v_uid
  ),
  per_other AS (
    SELECT
      um.other_id,
      array_agg(DISTINCT um.activity_id) FILTER (WHERE um.status = 'active') AS active_activity_ids,
      bool_or(um.status = 'active') AS has_active_match,
      array_agg(DISTINCT um.match_id) AS all_match_ids
    FROM user_matches um
    GROUP BY um.other_id
  ),
  last_msg AS (
    SELECT DISTINCT ON (po.other_id)
      po.other_id,
      msg.id AS msg_id,
      msg.body,
      msg.created_at,
      (msg.sender_id = v_uid) AS from_me
    FROM per_other po
    LEFT JOIN messages msg ON msg.match_id = ANY(po.all_match_ids)
    ORDER BY po.other_id, msg.created_at DESC NULLS LAST
  ),
  unread AS (
    SELECT
      po.other_id,
      COUNT(msg.id)::integer AS cnt
    FROM per_other po
    LEFT JOIN messages msg ON msg.match_id = ANY(po.all_match_ids)
      AND msg.sender_id != v_uid
      AND msg.read_at IS NULL
    GROUP BY po.other_id
  )
  SELECT
    p.id,
    p.first_name,
    p.photos[1],
    p.is_verified,
    COALESCE(po.active_activity_ids, ARRAY[]::uuid[]),
    COALESCE(
      (SELECT array_agg(a.title ORDER BY a.created_at)
        FROM activities a WHERE a.id = ANY(COALESCE(po.active_activity_ids, ARRAY[]::uuid[]))),
      ARRAY[]::text[]
    ),
    COALESCE(po.has_active_match, false),
    lm.msg_id,
    lm.body,
    lm.created_at,
    COALESCE(lm.from_me, false),
    COALESCE(u.cnt, 0)
  FROM per_other po
  JOIN profiles p ON p.id = po.other_id
  LEFT JOIN last_msg lm ON lm.other_id = po.other_id
  LEFT JOIN unread u ON u.other_id = po.other_id
  -- Exclude conversations where the only context is users blocked by either party
  WHERE NOT EXISTS (
    SELECT 1 FROM blocks b
    WHERE (b.blocker_id = v_uid AND b.blocked_user_id = po.other_id)
       OR (b.blocker_id = po.other_id AND b.blocked_user_id = v_uid)
  )
  ORDER BY lm.created_at DESC NULLS LAST;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- get_chat_thread
-- Returns all messages across all matches between current user and the
-- other user, with the activity title for each message.
-- =============================================================================
CREATE OR REPLACE FUNCTION get_chat_thread(p_other_user_id uuid)
RETURNS TABLE (
  message_id uuid,
  match_id uuid,
  activity_id uuid,
  activity_title text,
  sender_id uuid,
  body text,
  status text,
  created_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz
) AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  RETURN QUERY
  SELECT
    msg.id,
    msg.match_id,
    a.id AS activity_id,
    a.title AS activity_title,
    msg.sender_id,
    msg.body,
    msg.status,
    msg.created_at,
    msg.delivered_at,
    msg.read_at
  FROM messages msg
  JOIN matches m ON m.id = msg.match_id
  JOIN activities a ON a.id = m.activity_id
  WHERE (
    (m.poster_id = v_uid AND m.interested_id = p_other_user_id)
    OR (m.interested_id = v_uid AND m.poster_id = p_other_user_id)
  )
  ORDER BY msg.created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- get_active_matches_with_user
-- Lists active matches between current user and another user (used for
-- "send to which match" picker when posting messages and for the context
-- header in the chat screen).
-- =============================================================================
CREATE OR REPLACE FUNCTION get_active_matches_with_user(p_other_user_id uuid)
RETURNS TABLE (
  match_id uuid,
  activity_id uuid,
  activity_title text,
  matched_at timestamptz
) AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  RETURN QUERY
  SELECT m.id, a.id, a.title, m.matched_at
  FROM matches m
  JOIN activities a ON a.id = m.activity_id
  WHERE m.status = 'active'
    AND (
      (m.poster_id = v_uid AND m.interested_id = p_other_user_id)
      OR (m.interested_id = v_uid AND m.poster_id = p_other_user_id)
    )
  ORDER BY m.matched_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- mark_thread_read
-- Marks all of the other user's unread messages (across all shared matches)
-- as read.
-- =============================================================================
CREATE OR REPLACE FUNCTION mark_thread_read(p_other_user_id uuid)
RETURNS integer AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_count integer;
BEGIN
  WITH updated AS (
    UPDATE messages msg
      SET status = 'read', read_at = now(), delivered_at = COALESCE(msg.delivered_at, now())
      FROM matches m
      WHERE msg.match_id = m.id
        AND msg.sender_id = p_other_user_id
        AND msg.read_at IS NULL
        AND (
          (m.poster_id = v_uid AND m.interested_id = p_other_user_id)
          OR (m.interested_id = v_uid AND m.poster_id = p_other_user_id)
        )
      RETURNING msg.id
  )
  SELECT COUNT(*)::integer INTO v_count FROM updated;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- get_total_unread_messages
-- Drives the Matches tab badge.
-- =============================================================================
CREATE OR REPLACE FUNCTION get_total_unread_messages()
RETURNS integer AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_count integer;
BEGIN
  SELECT COUNT(*)::integer INTO v_count
  FROM messages msg
  JOIN matches m ON m.id = msg.match_id
  WHERE msg.sender_id != v_uid
    AND msg.read_at IS NULL
    AND (m.poster_id = v_uid OR m.interested_id = v_uid);
  RETURN COALESCE(v_count, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- Enable Realtime for messages so subscribers can listen for INSERT/UPDATE.
-- (No-op if already added.)
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE messages;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'matches'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE matches;
  END IF;
END $$;
