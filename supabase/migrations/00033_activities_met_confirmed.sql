-- Migration 00033: confirmed-met activities disappear from Who's In + My activities
--
-- When BOTH parties on a match record "yes, we met" via meetup_checks, the
-- activity gets a `met_confirmed_at` timestamp. Activities with a non-null
-- value are filtered out of the poster's Who's In list and the My activities
-- section on ProfileScreen / UserProfileScreen. The match row itself stays
-- active=true so the chat thread persists.

ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS met_confirmed_at timestamptz NULL;

COMMENT ON COLUMN public.activities.met_confirmed_at IS
  'Set when both parties on the match confirm "yes, we met" via meetup_checks. The activity disappears from the poster''s Who''s In + My activities once non-null; the underlying match stays active so chat persists.';

-- =============================================================================
-- record_meetup_yes
-- Marks the calling user's meetup_check row as did_meet=true. If the OTHER
-- party on the match also has a did_meet=true row, set met_confirmed_at on
-- the activity so it drops out of Who's In + My activities. The match row is
-- intentionally left untouched (status='active') so the chat persists.
-- =============================================================================
CREATE OR REPLACE FUNCTION record_meetup_yes(p_meetup_check_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_match_id uuid;
  v_activity_id uuid;
  v_other_yes boolean;
BEGIN
  -- Update the caller's check row and grab match_id in one pass
  UPDATE meetup_checks
     SET did_meet = true,
         responded_at = now()
   WHERE id = p_meetup_check_id
     AND user_id = v_uid
  RETURNING match_id INTO v_match_id;

  IF v_match_id IS NULL THEN
    RETURN;
  END IF;

  SELECT m.activity_id INTO v_activity_id
    FROM matches m
   WHERE m.id = v_match_id;

  -- Did the other party also say yes?
  SELECT EXISTS (
    SELECT 1 FROM meetup_checks mc
     WHERE mc.match_id = v_match_id
       AND mc.user_id <> v_uid
       AND mc.did_meet = true
  ) INTO v_other_yes;

  IF v_other_yes AND v_activity_id IS NOT NULL THEN
    UPDATE activities
       SET met_confirmed_at = now()
     WHERE id = v_activity_id
       AND met_confirmed_at IS NULL;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION record_meetup_yes(uuid) TO authenticated;

-- =============================================================================
-- get_my_activities_with_queue_counts — copied forward from migration 00025
-- with an added `AND a.met_confirmed_at IS NULL` clause so confirmed-met
-- activities drop off the Who's In list.
-- =============================================================================
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
    AND a.met_confirmed_at IS NULL
  ORDER BY
    (m.id IS NOT NULL) DESC,
    COALESCE(q.pending_count, 0) DESC,
    a.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
