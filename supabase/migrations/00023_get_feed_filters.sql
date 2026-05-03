-- Migration 00023: get_feed accepts optional mode + category filters
--
-- Powers the Discover screen's mode switcher pill (Friends/Dating/
-- Networking) and category filter chips ("For you" / Outdoors / Food /
-- etc.). When both filters are NULL, falls back to the previous behavior
-- (intersect with discovery_preferences.modes, no category filter).

DROP FUNCTION IF EXISTS get_feed(uuid, timestamptz, integer);

CREATE OR REPLACE FUNCTION get_feed(
  p_user_id          uuid,
  p_cursor           timestamptz DEFAULT NULL,
  p_limit            integer     DEFAULT 20,
  p_mode_filter      text        DEFAULT NULL,  -- 'friends' | 'dating' | 'networking'
  p_category_filter  text        DEFAULT NULL   -- one of ACTIVITY_CATEGORIES
)
RETURNS TABLE (
  activity_id uuid,
  title text,
  description text,
  category text,
  intent text,
  location_lat numeric,
  location_lng numeric,
  location_name text,
  activity_date date,
  created_at timestamptz,
  poster_id uuid,
  poster_name text,
  poster_photo text,
  poster_verified boolean,
  poster_age integer,
  distance_miles numeric,
  interest_score integer,
  link text,
  photo_url text,
  photo_source text,
  photo_attribution jsonb
) AS $$
DECLARE
  v_prefs record;
  v_user record;
BEGIN
  SELECT * INTO v_prefs FROM discovery_preferences WHERE user_id = p_user_id;
  SELECT p.location_lat, p.location_lng, p.activity_preferences
    INTO v_user FROM profiles p WHERE p.id = p_user_id;

  RETURN QUERY
  SELECT
    a.id AS activity_id,
    a.title,
    a.description,
    a.category,
    a.intent,
    a.location_lat,
    a.location_lng,
    a.location_name,
    a.activity_date,
    a.created_at,
    p.id AS poster_id,
    p.first_name AS poster_name,
    p.photos[1] AS poster_photo,
    p.is_verified AS poster_verified,
    EXTRACT(YEAR FROM age(p.date_of_birth))::integer AS poster_age,
    haversine_miles(v_user.location_lat, v_user.location_lng, a.location_lat, a.location_lng) AS distance_miles,
    CASE WHEN a.category = ANY(v_user.activity_preferences) THEN 1 ELSE 0 END AS interest_score,
    a.link,
    a.photo_url,
    a.photo_source,
    a.photo_attribution
  FROM activities a
  JOIN profiles p ON p.id = a.user_id
  WHERE a.status = 'active'
    AND a.user_id != p_user_id
    AND p.is_active = true
    AND p.is_paused = false
    -- Exclude seed data from real users
    AND (a.is_seed = false OR EXISTS (SELECT 1 FROM profiles WHERE id = p_user_id AND is_seed = true))
    -- Exclude already swiped
    AND NOT EXISTS (
      SELECT 1 FROM swipes s WHERE s.swiper_id = p_user_id AND s.activity_id = a.id
    )
    -- Exclude blocked users (both directions)
    AND NOT EXISTS (
      SELECT 1 FROM blocks b
      WHERE (b.blocker_id = p_user_id AND b.blocked_user_id = a.user_id)
         OR (b.blocker_id = a.user_id AND b.blocked_user_id = p_user_id)
    )
    -- Mode filter: when p_mode_filter is set, only that intent. Otherwise
    -- intersect with the user's discovery_preferences.modes.
    AND (
      (p_mode_filter IS NOT NULL AND a.intent = p_mode_filter)
      OR (p_mode_filter IS NULL AND a.intent = ANY(v_prefs.modes))
    )
    -- Category filter: when p_category_filter is set, only that category.
    AND (p_category_filter IS NULL OR a.category = p_category_filter)
    -- Gender filter
    AND (
      v_prefs.show_me = 'everyone'
      OR (v_prefs.show_me = 'men' AND p.gender = 'man')
      OR (v_prefs.show_me = 'women' AND p.gender = 'woman')
    )
    -- Age filter
    AND EXTRACT(YEAR FROM age(p.date_of_birth))::integer BETWEEN v_prefs.age_min AND v_prefs.age_max
    -- Distance filter
    AND (
      v_user.location_lat IS NULL
      OR a.location_lat IS NULL
      OR haversine_miles(v_user.location_lat, v_user.location_lng, a.location_lat, a.location_lng) <= v_prefs.max_distance_miles
    )
    -- Cursor pagination
    AND (p_cursor IS NULL OR a.created_at < p_cursor)
  ORDER BY
    CASE WHEN a.category = ANY(v_user.activity_preferences) THEN 0 ELSE 1 END,
    haversine_miles(v_user.location_lat, v_user.location_lng, a.location_lat, a.location_lng) NULLS LAST,
    a.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
