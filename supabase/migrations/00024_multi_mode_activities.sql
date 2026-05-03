-- Migration 00024: Multi-mode activities
--
-- Posters can now choose multiple intents per activity (e.g. open to both
-- friends AND dating). When someone swipes right, we record which mode
-- THEY were in so the poster sees the right context in Who's In.
--
-- Schema changes:
--   activities      — new `intents text[]` (backfilled from `intent`).
--                     Old `intent` column is kept temporarily for
--                     compatibility; future migration will drop it once
--                     every read path uses `intents`.
--   swipes          — new `swiper_mode` text (the mode the swiper was in
--                     at swipe time). Nullable for legacy rows.
--   interest_queue  — new `swiper_mode` text propagated from the swipe.
--
-- RPC updates:
--   get_feed                      — filters using ANY(a.intents) instead
--                                   of a.intent equality.
--   get_interest_queue_batch      — returns swiper_mode so Who's In can
--                                   render the mode badge per person.
--   get_my_activities_with_queue_counts — returns intents text[].

-- ============================================================================
-- 1. activities.intents
-- ============================================================================
ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS intents text[] NULL;

UPDATE public.activities
SET intents = ARRAY[intent]
WHERE intents IS NULL;

ALTER TABLE public.activities
  ALTER COLUMN intents SET NOT NULL;

ALTER TABLE public.activities
  DROP CONSTRAINT IF EXISTS activities_intents_check;
ALTER TABLE public.activities
  ADD CONSTRAINT activities_intents_check
  CHECK (
    array_length(intents, 1) >= 1
    AND intents <@ ARRAY['friends', 'dating', 'networking']::text[]
  );

CREATE INDEX IF NOT EXISTS idx_activities_intents
  ON public.activities USING GIN (intents);

COMMENT ON COLUMN public.activities.intents IS
  'Modes the poster is open to for this activity. One or more of: friends | dating | networking.';

-- ============================================================================
-- 2. swipes.swiper_mode + interest_queue.swiper_mode
-- ============================================================================
ALTER TABLE public.swipes
  ADD COLUMN IF NOT EXISTS swiper_mode text NULL;
ALTER TABLE public.swipes
  DROP CONSTRAINT IF EXISTS swipes_swiper_mode_check;
ALTER TABLE public.swipes
  ADD CONSTRAINT swipes_swiper_mode_check
  CHECK (swiper_mode IS NULL OR swiper_mode IN ('friends', 'dating', 'networking'));

ALTER TABLE public.interest_queue
  ADD COLUMN IF NOT EXISTS swiper_mode text NULL;
ALTER TABLE public.interest_queue
  DROP CONSTRAINT IF EXISTS interest_queue_swiper_mode_check;
ALTER TABLE public.interest_queue
  ADD CONSTRAINT interest_queue_swiper_mode_check
  CHECK (swiper_mode IS NULL OR swiper_mode IN ('friends', 'dating', 'networking'));

COMMENT ON COLUMN public.swipes.swiper_mode IS
  'Mode the swiper was in at swipe time. Lets multi-mode activities show the poster which mode the interested user is in.';
COMMENT ON COLUMN public.interest_queue.swiper_mode IS
  'Propagated from swipes.swiper_mode at queue insert. Returned by get_interest_queue_batch.';

-- ============================================================================
-- 3. get_feed — filter on intents (array overlap) instead of intent equality
-- ============================================================================
DROP FUNCTION IF EXISTS get_feed(uuid, timestamptz, integer, text, text);

CREATE OR REPLACE FUNCTION get_feed(
  p_user_id          uuid,
  p_cursor           timestamptz DEFAULT NULL,
  p_limit            integer     DEFAULT 20,
  p_mode_filter      text        DEFAULT NULL,
  p_category_filter  text        DEFAULT NULL
)
RETURNS TABLE (
  activity_id uuid,
  title text,
  description text,
  category text,
  intent text,                -- legacy: kept until every client uses intents
  intents text[],
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
    a.intents,
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
    AND (a.is_seed = false OR EXISTS (SELECT 1 FROM profiles WHERE id = p_user_id AND is_seed = true))
    AND NOT EXISTS (
      SELECT 1 FROM swipes s WHERE s.swiper_id = p_user_id AND s.activity_id = a.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM blocks b
      WHERE (b.blocker_id = p_user_id AND b.blocked_user_id = a.user_id)
         OR (b.blocker_id = a.user_id AND b.blocked_user_id = p_user_id)
    )
    -- Mode filter: array overlap when p_mode_filter is set, else
    -- intersect with discovery_preferences.modes.
    AND (
      (p_mode_filter IS NOT NULL AND p_mode_filter = ANY(a.intents))
      OR (p_mode_filter IS NULL AND a.intents && v_prefs.modes)
    )
    AND (p_category_filter IS NULL OR a.category = p_category_filter)
    AND (
      v_prefs.show_me = 'everyone'
      OR (v_prefs.show_me = 'men' AND p.gender = 'man')
      OR (v_prefs.show_me = 'women' AND p.gender = 'woman')
    )
    AND EXTRACT(YEAR FROM age(p.date_of_birth))::integer BETWEEN v_prefs.age_min AND v_prefs.age_max
    AND (
      v_user.location_lat IS NULL
      OR a.location_lat IS NULL
      OR haversine_miles(v_user.location_lat, v_user.location_lng, a.location_lat, a.location_lng) <= v_prefs.max_distance_miles
    )
    AND (p_cursor IS NULL OR a.created_at < p_cursor)
  ORDER BY
    CASE WHEN a.category = ANY(v_user.activity_preferences) THEN 0 ELSE 1 END,
    haversine_miles(v_user.location_lat, v_user.location_lng, a.location_lat, a.location_lng) NULLS LAST,
    a.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 4. get_interest_queue_batch — also return swiper_mode
-- ============================================================================
DROP FUNCTION IF EXISTS get_interest_queue_batch(uuid, integer);

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
  created_at timestamptz,
  swiper_mode text
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
    iq.created_at,
    iq.swiper_mode
  FROM interest_queue iq
  JOIN profiles p ON p.id = iq.interested_user_id
  WHERE iq.activity_id = p_activity_id
    AND iq.status = 'pending'
    AND p.is_active = true
    AND NOT EXISTS (
      SELECT 1 FROM blocks b
      WHERE (b.blocker_id = v_owner_id AND b.blocked_user_id = p.id)
         OR (b.blocker_id = p.id AND b.blocked_user_id = v_owner_id)
    )
  ORDER BY iq.created_at ASC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 5. get_my_activities_with_queue_counts — return intents text[] too
-- ============================================================================
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
