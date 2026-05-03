-- Migration 00027: Optional first message on interest expression
--
-- When a user swipes right on an activity, they can optionally attach a
-- short note to the interest queue entry. The poster sees this on the
-- Who's In list view so they can pick who to match with based on more
-- than just the photo.
--
-- 300-char hard cap to keep the list-row preview readable.

-- 1. Column on interest_queue
ALTER TABLE public.interest_queue
  ADD COLUMN IF NOT EXISTS first_message text NULL;

ALTER TABLE public.interest_queue
  DROP CONSTRAINT IF EXISTS interest_queue_first_message_check;

ALTER TABLE public.interest_queue
  ADD CONSTRAINT interest_queue_first_message_check
  CHECK (first_message IS NULL OR char_length(first_message) <= 300);

COMMENT ON COLUMN public.interest_queue.first_message IS
  'Optional 1-line outreach note the swiper attaches when expressing interest. Max 300 chars. Shown to the poster on the Who''s In list.';

-- 2. get_interest_queue_batch — return first_message too
DROP FUNCTION IF EXISTS get_interest_queue_batch(uuid, integer);

CREATE OR REPLACE FUNCTION get_interest_queue_batch(
  p_activity_id uuid,
  p_limit integer DEFAULT 50
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
  swiper_mode text,
  first_message text
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
    iq.swiper_mode,
    iq.first_message
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
