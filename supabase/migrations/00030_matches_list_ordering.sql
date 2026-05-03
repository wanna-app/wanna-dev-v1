-- Migration 00030: Order the matches list by latest activity per
-- conversation. Conversations with no messages yet should still surface
-- (currently get_conversations_list orders by last_message_at DESC NULLS
-- LAST so brand-new matches drop to the bottom). Switch to
-- COALESCE(last_message_at, matched_at) DESC so freshly-created matches
-- show up at the top until the first message lands.
--
-- Idempotent: CREATE OR REPLACE FUNCTION.

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
      m.matched_at,
      CASE WHEN m.poster_id = v_uid THEN m.interested_id ELSE m.poster_id END AS other_id
    FROM matches m
    WHERE m.poster_id = v_uid OR m.interested_id = v_uid
  ),
  per_other AS (
    SELECT
      um.other_id,
      array_agg(DISTINCT um.activity_id) FILTER (WHERE um.status = 'active') AS active_activity_ids,
      bool_or(um.status = 'active') AS has_active_match,
      array_agg(DISTINCT um.match_id) AS all_match_ids,
      MAX(um.matched_at) AS latest_matched_at
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
  -- Use the message timestamp when there's a message; otherwise fall back
  -- to matched_at so brand-new matches are at the top until first message.
  ORDER BY COALESCE(lm.created_at, po.latest_matched_at) DESC NULLS LAST;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
