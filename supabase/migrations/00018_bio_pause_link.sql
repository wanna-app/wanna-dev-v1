-- Migration 00018: Expand bio limit, add account pause, add activity link
--
-- 1. Bio CHECK constraint relaxed from 150 → 300 chars (UX request)
-- 2. profiles.is_paused — boolean default false. Paused profiles stay in their
--    own data (matches/chats preserved) but are hidden from Discover for
--    everyone else. Distinct from is_active=false (deactivation).
-- 3. activities.link — optional URL field separated from description so the UI
--    can render it as a tappable link preview instead of inline in details.
-- 4. get_feed RPC updated to also exclude paused users.

-- ============================================================================
-- 1. Bio limit 150 → 300
-- ============================================================================
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_bio_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_bio_check
  CHECK (bio IS NULL OR char_length(bio) <= 300);

-- ============================================================================
-- 2. profiles.is_paused
-- ============================================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_paused boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS profiles_is_paused_idx
  ON public.profiles (is_paused)
  WHERE is_paused = true;

COMMENT ON COLUMN public.profiles.is_paused IS
  'When true, profile is hidden from Discover but matches and chats remain. Distinct from is_active=false (deactivation).';

-- ============================================================================
-- 3. activities.link
-- ============================================================================
ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS link text
  CHECK (link IS NULL OR (char_length(link) <= 500 AND link ~ '^https?://'));

COMMENT ON COLUMN public.activities.link IS
  'Optional URL the poster wants to attach (Yelp, Ticketmaster, Eventbrite, etc.). Rendered as a preview card in Discover.';

-- ============================================================================
-- 4. get_feed: exclude paused profiles + return new `link` column
-- (Drop first since return type changed.)
-- ============================================================================
DROP FUNCTION IF EXISTS get_feed(uuid, timestamptz, integer);

CREATE OR REPLACE FUNCTION get_feed(
  p_user_id uuid,
  p_cursor timestamptz DEFAULT NULL,
  p_limit integer DEFAULT 20
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
  link text
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
    a.link
  FROM activities a
  JOIN profiles p ON p.id = a.user_id
  WHERE a.status = 'active'
    AND a.user_id != p_user_id
    AND p.is_active = true
    AND p.is_paused = false       -- NEW: exclude paused profiles
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
    -- Intent filter
    AND a.intent = ANY(v_prefs.modes)
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
