-- Migration 00025: get_my_activities_with_queue_counts returns photo_url
-- so the Who's In list can render activity photo thumbnails instead of
-- the generic per-category icon.

DROP FUNCTION IF EXISTS get_my_activities_with_queue_counts(uuid);

CREATE OR REPLACE FUNCTION get_my_activities_with_queue_counts(p_user_id uuid)
RETURNS TABLE (
  activity_id uuid,
  title text,
  category text,
  intent text,        -- legacy
  intents text[],
  activity_date date,
  location_name text,
  photo_url text,
  pending_count integer,
  has_active_match boolean,
  match_id uuid,
  matched_user_id uuid,
  matched_user_name text,
  matched_user_photo text
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id AS activity_id,
    a.title,
    a.category,
    a.intent,
    a.intents,
    a.activity_date,
    a.location_name,
    a.photo_url,
    COALESCE(q.pending_count, 0)::integer AS pending_count,
    (m.id IS NOT NULL) AS has_active_match,
    m.id AS match_id,
    m.interested_id AS matched_user_id,
    p.first_name AS matched_user_name,
    p.photos[1] AS matched_user_photo
  FROM activities a
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::integer AS pending_count
    FROM interest_queue iq
    WHERE iq.activity_id = a.id AND iq.status = 'pending'
  ) q ON true
  LEFT JOIN matches m ON m.activity_id = a.id AND m.status = 'active'
  LEFT JOIN profiles p ON p.id = m.interested_id
  WHERE a.user_id = p_user_id
    AND a.status = 'active'
  ORDER BY
    (m.id IS NOT NULL) DESC,
    COALESCE(q.pending_count, 0) DESC,
    a.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
