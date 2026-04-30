-- RPCs for the Who's In tab and queue swipe flow

-- =============================================================================
-- get_my_activities_with_queue_counts
-- Returns the user's active activities with pending count + current match info
-- Sorted: most pending first, zero-pending last (greyed-out)
-- =============================================================================
CREATE OR REPLACE FUNCTION get_my_activities_with_queue_counts(p_user_id uuid)
RETURNS TABLE (
  activity_id uuid,
  title text,
  category text,
  intent text,
  activity_date date,
  location_name text,
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
    a.activity_date,
    a.location_name,
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

-- =============================================================================
-- get_total_pending_interest
-- Returns the total unreviewed users across all of the user's active activities
-- (drives the Who's In tab badge)
-- =============================================================================
CREATE OR REPLACE FUNCTION get_total_pending_interest(p_user_id uuid)
RETURNS integer AS $$
DECLARE
  total integer;
BEGIN
  SELECT COUNT(*)::integer INTO total
  FROM interest_queue iq
  JOIN activities a ON a.id = iq.activity_id
  WHERE a.user_id = p_user_id
    AND a.status = 'active'
    AND iq.status = 'pending';
  RETURN COALESCE(total, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- get_interest_queue_batch
-- Fetches up to 10 pending interested users for a given activity, with profile.
-- Activity owner only.
-- =============================================================================
CREATE OR REPLACE FUNCTION get_interest_queue_batch(
  p_activity_id uuid,
  p_limit integer DEFAULT 10
)
RETURNS TABLE (
  queue_id uuid,
  user_id uuid,
  first_name text,
  photos text[],
  bio text,
  age integer,
  is_verified boolean,
  activity_preferences text[],
  distance_miles numeric,
  created_at timestamptz
) AS $$
DECLARE
  v_owner_id uuid;
  v_owner_lat numeric;
  v_owner_lng numeric;
BEGIN
  SELECT a.user_id INTO v_owner_id FROM activities a WHERE a.id = p_activity_id;
  IF v_owner_id != auth.uid() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT location_lat, location_lng
    INTO v_owner_lat, v_owner_lng
    FROM profiles WHERE id = v_owner_id;

  RETURN QUERY
  SELECT
    iq.id AS queue_id,
    p.id AS user_id,
    p.first_name,
    p.photos,
    p.bio,
    EXTRACT(YEAR FROM age(p.date_of_birth))::integer AS age,
    p.is_verified,
    p.activity_preferences,
    haversine_miles(v_owner_lat, v_owner_lng, p.location_lat, p.location_lng) AS distance_miles,
    iq.created_at
  FROM interest_queue iq
  JOIN profiles p ON p.id = iq.interested_user_id
  WHERE iq.activity_id = p_activity_id
    AND iq.status = 'pending'
    AND p.is_active = true
    -- Exclude users who blocked the owner or are blocked by the owner
    AND NOT EXISTS (
      SELECT 1 FROM blocks b
      WHERE (b.blocker_id = v_owner_id AND b.blocked_user_id = p.id)
         OR (b.blocker_id = p.id AND b.blocked_user_id = v_owner_id)
    )
  ORDER BY iq.created_at ASC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- accept_interest
-- Atomic: insert match + update queue entry, only if no active match exists.
-- Returns the new match id (or raises if already locked).
-- =============================================================================
CREATE OR REPLACE FUNCTION accept_interest(
  p_queue_id uuid
)
RETURNS uuid AS $$
DECLARE
  v_activity_id uuid;
  v_interested_id uuid;
  v_owner_id uuid;
  v_existing_match uuid;
  v_new_match_id uuid;
BEGIN
  SELECT iq.activity_id, iq.interested_user_id
    INTO v_activity_id, v_interested_id
    FROM interest_queue iq
    WHERE iq.id = p_queue_id AND iq.status = 'pending';

  IF v_activity_id IS NULL THEN
    RAISE EXCEPTION 'Queue entry not found or already reviewed';
  END IF;

  SELECT user_id INTO v_owner_id FROM activities WHERE id = v_activity_id;
  IF v_owner_id != auth.uid() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Lock check
  SELECT id INTO v_existing_match
    FROM matches
    WHERE activity_id = v_activity_id AND status = 'active';
  IF v_existing_match IS NOT NULL THEN
    RAISE EXCEPTION 'Activity already has an active match';
  END IF;

  -- Create match
  INSERT INTO matches (activity_id, poster_id, interested_id, status)
  VALUES (v_activity_id, v_owner_id, v_interested_id, 'active')
  RETURNING id INTO v_new_match_id;

  -- Mark queue entry accepted
  UPDATE interest_queue
    SET status = 'accepted', reviewed_at = now()
    WHERE id = p_queue_id;

  RETURN v_new_match_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- reject_interest
-- =============================================================================
CREATE OR REPLACE FUNCTION reject_interest(p_queue_id uuid)
RETURNS void AS $$
DECLARE
  v_activity_id uuid;
  v_owner_id uuid;
BEGIN
  SELECT iq.activity_id INTO v_activity_id
    FROM interest_queue iq
    WHERE iq.id = p_queue_id AND iq.status = 'pending';

  IF v_activity_id IS NULL THEN
    RAISE EXCEPTION 'Queue entry not found or already reviewed';
  END IF;

  SELECT user_id INTO v_owner_id FROM activities WHERE id = v_activity_id;
  IF v_owner_id != auth.uid() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE interest_queue
    SET status = 'rejected', reviewed_at = now()
    WHERE id = p_queue_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- unmatch
-- Unmatch (either party). Sets match status, unlocks the queue.
-- =============================================================================
CREATE OR REPLACE FUNCTION unmatch(p_match_id uuid)
RETURNS void AS $$
DECLARE
  v_poster_id uuid;
  v_interested_id uuid;
BEGIN
  SELECT poster_id, interested_id
    INTO v_poster_id, v_interested_id
    FROM matches WHERE id = p_match_id;

  IF v_poster_id IS NULL THEN
    RAISE EXCEPTION 'Match not found';
  END IF;
  IF auth.uid() NOT IN (v_poster_id, v_interested_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE matches
    SET status = 'unmatched', unmatched_at = now(), unmatched_by = auth.uid()
    WHERE id = p_match_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
