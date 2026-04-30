-- Wanna MVP: Initial Database Schema
-- All tables with RLS, constraints, triggers, and indexes

-- =============================================================================
-- 1. PROFILES
-- =============================================================================
CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name text NOT NULL CHECK (char_length(first_name) BETWEEN 1 AND 30),
  date_of_birth date NOT NULL,
  bio text CHECK (bio IS NULL OR char_length(bio) <= 150),
  photos text[] NOT NULL CHECK (array_length(photos, 1) BETWEEN 1 AND 6),
  activity_preferences text[] NOT NULL CHECK (array_length(activity_preferences, 1) BETWEEN 1 AND 10),
  gender text NOT NULL CHECK (gender IN ('man', 'woman', 'nonbinary')),
  profession text CHECK (profession IS NULL OR char_length(profession) <= 60),
  university text CHECK (university IS NULL OR char_length(university) <= 100),
  political_orientation text CHECK (political_orientation IS NULL OR political_orientation IN ('liberal', 'moderate', 'conservative')),
  alcohol text CHECK (alcohol IS NULL OR alcohol IN ('never', 'rarely', 'sometimes', 'often')),
  marijuana text CHECK (marijuana IS NULL OR marijuana IN ('never', 'rarely', 'sometimes', 'often')),
  star_sign text CHECK (star_sign IS NULL OR star_sign IN ('Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces')),
  has_seen_public_safety boolean NOT NULL DEFAULT false,
  is_verified boolean NOT NULL DEFAULT false,
  verification_photo_url text,
  is_seed boolean NOT NULL DEFAULT false,
  location_lat numeric(10,7) CHECK (location_lat IS NULL OR location_lat BETWEEN -90 AND 90),
  location_lng numeric(10,7) CHECK (location_lng IS NULL OR location_lng BETWEEN -180 AND 180),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view active profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

-- =============================================================================
-- 2. DISCOVERY PREFERENCES
-- =============================================================================
CREATE TABLE discovery_preferences (
  user_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  modes text[] NOT NULL DEFAULT '{friends}' CHECK (
    array_length(modes, 1) >= 1
    AND modes <@ ARRAY['friends', 'dating', 'networking']::text[]
  ),
  show_me text NOT NULL DEFAULT 'everyone' CHECK (show_me IN ('men', 'women', 'everyone')),
  age_min integer NOT NULL DEFAULT 18 CHECK (age_min BETWEEN 18 AND 99),
  age_max integer NOT NULL DEFAULT 99 CHECK (age_max BETWEEN 18 AND 99),
  max_distance_miles integer NOT NULL DEFAULT 50 CHECK (max_distance_miles BETWEEN 1 AND 100),
  CONSTRAINT age_range_valid CHECK (age_min <= age_max)
);

ALTER TABLE discovery_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own discovery preferences"
  ON discovery_preferences FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own discovery preferences"
  ON discovery_preferences FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can insert own discovery preferences"
  ON discovery_preferences FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- =============================================================================
-- 3. ACTIVITIES
-- =============================================================================
CREATE TABLE activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 60),
  description text CHECK (description IS NULL OR char_length(description) <= 1000),
  category text NOT NULL CHECK (category IN (
    'Arts & Culture', 'Bars & Nightlife', 'Books & Learning',
    'Fitness & Sports', 'Food & Dining', 'Gaming & Tech',
    'Movies & Shows', 'Music & Concerts', 'Outdoors & Adventure', 'Other'
  )),
  intent text NOT NULL DEFAULT 'friends' CHECK (intent IN ('friends', 'dating', 'networking')),
  location_lat numeric(10,7) CHECK (location_lat IS NULL OR location_lat BETWEEN -90 AND 90),
  location_lng numeric(10,7) CHECK (location_lng IS NULL OR location_lng BETWEEN -180 AND 180),
  location_name text CHECK (location_name IS NULL OR char_length(location_name) <= 120),
  activity_date date,
  is_seed boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'past_date', 'deleted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_activities_user_id ON activities(user_id);
CREATE INDEX idx_activities_status ON activities(status);
CREATE INDEX idx_activities_category ON activities(category);
CREATE INDEX idx_activities_intent ON activities(intent);
CREATE INDEX idx_activities_location ON activities(location_lat, location_lng) WHERE location_lat IS NOT NULL;

ALTER TABLE activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active activities"
  ON activities FOR SELECT
  TO authenticated
  USING (status = 'active' OR user_id = auth.uid());

CREATE POLICY "Users can insert own activities"
  ON activities FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own activities"
  ON activities FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own activities"
  ON activities FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- =============================================================================
-- 4. SWIPES
-- =============================================================================
CREATE TABLE swipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  swiper_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  activity_id uuid NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  activity_owner_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('like', 'pass')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_swipe UNIQUE (swiper_id, activity_id)
);

CREATE INDEX idx_swipes_swiper ON swipes(swiper_id);
CREATE INDEX idx_swipes_activity ON swipes(activity_id);

ALTER TABLE swipes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own swipes"
  ON swipes FOR SELECT
  TO authenticated
  USING (swiper_id = auth.uid());

CREATE POLICY "Users can insert own swipes"
  ON swipes FOR INSERT
  TO authenticated
  WITH CHECK (swiper_id = auth.uid());

CREATE POLICY "Users can delete own swipes (undo)"
  ON swipes FOR DELETE
  TO authenticated
  USING (swiper_id = auth.uid());

-- =============================================================================
-- 5. INTEREST QUEUE
-- =============================================================================
CREATE TABLE interest_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  interested_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  batch_number integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  is_seed boolean NOT NULL DEFAULT false
);

CREATE INDEX idx_interest_queue_activity ON interest_queue(activity_id);
CREATE INDEX idx_interest_queue_status ON interest_queue(activity_id, status);
CREATE INDEX idx_interest_queue_user ON interest_queue(interested_user_id);

ALTER TABLE interest_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Activity owners can view their queue"
  ON interest_queue FOR SELECT
  TO authenticated
  USING (
    activity_id IN (SELECT id FROM activities WHERE user_id = auth.uid())
    OR interested_user_id = auth.uid()
  );

CREATE POLICY "Users can insert into queue (express interest)"
  ON interest_queue FOR INSERT
  TO authenticated
  WITH CHECK (interested_user_id = auth.uid());

CREATE POLICY "Activity owners can update queue entries"
  ON interest_queue FOR UPDATE
  TO authenticated
  USING (activity_id IN (SELECT id FROM activities WHERE user_id = auth.uid()));

-- =============================================================================
-- 6. MATCHES
-- =============================================================================
CREATE TABLE matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  poster_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  interested_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'unmatched')),
  matched_at timestamptz NOT NULL DEFAULT now(),
  unmatched_at timestamptz,
  unmatched_by uuid REFERENCES profiles(id),
  is_seed boolean NOT NULL DEFAULT false
);

CREATE INDEX idx_matches_poster ON matches(poster_id);
CREATE INDEX idx_matches_interested ON matches(interested_id);
CREATE INDEX idx_matches_activity ON matches(activity_id);
CREATE INDEX idx_matches_status ON matches(status);

ALTER TABLE matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Match participants can view their matches"
  ON matches FOR SELECT
  TO authenticated
  USING (poster_id = auth.uid() OR interested_id = auth.uid());

CREATE POLICY "Activity owners can insert matches"
  ON matches FOR INSERT
  TO authenticated
  WITH CHECK (poster_id = auth.uid());

CREATE POLICY "Match participants can update matches"
  ON matches FOR UPDATE
  TO authenticated
  USING (poster_id = auth.uid() OR interested_id = auth.uid());

-- =============================================================================
-- 7. MESSAGES
-- =============================================================================
CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'read')),
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  read_at timestamptz,
  is_seed boolean NOT NULL DEFAULT false
);

CREATE INDEX idx_messages_match ON messages(match_id, created_at);
CREATE INDEX idx_messages_sender ON messages(sender_id);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Match participants can view messages"
  ON messages FOR SELECT
  TO authenticated
  USING (
    match_id IN (
      SELECT id FROM matches
      WHERE poster_id = auth.uid() OR interested_id = auth.uid()
    )
  );

CREATE POLICY "Match participants can insert messages"
  ON messages FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND match_id IN (
      SELECT id FROM matches
      WHERE (poster_id = auth.uid() OR interested_id = auth.uid())
        AND status = 'active'
    )
  );

CREATE POLICY "Recipients can update message status"
  ON messages FOR UPDATE
  TO authenticated
  USING (
    sender_id != auth.uid()
    AND match_id IN (
      SELECT id FROM matches
      WHERE poster_id = auth.uid() OR interested_id = auth.uid()
    )
  );

-- =============================================================================
-- 8. MEETUP CHECKS
-- =============================================================================
CREATE TABLE meetup_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  did_meet boolean,
  trigger_type text NOT NULL CHECK (trigger_type IN ('date_passed', 'timer_72h', 'chat_opened')),
  triggered_at timestamptz NOT NULL,
  responded_at timestamptz,
  dismiss_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_meetup_checks_match ON meetup_checks(match_id);
CREATE INDEX idx_meetup_checks_user ON meetup_checks(user_id);

ALTER TABLE meetup_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own meetup checks"
  ON meetup_checks FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own meetup checks"
  ON meetup_checks FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

-- =============================================================================
-- 9. REPORTS
-- =============================================================================
CREATE TABLE reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reported_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reported_content_type text CHECK (reported_content_type IS NULL OR reported_content_type IN ('activity', 'message', 'photo', 'profile')),
  reported_content_id uuid,
  reason text NOT NULL CHECK (reason IN (
    'Inappropriate content', 'Harassment or bullying', 'Spam or scam',
    'Fake profile / catfishing', 'Underage user', 'Threatening behavior',
    'Activity not in a public place', 'Other'
  )),
  description text CHECK (description IS NULL OR char_length(description) <= 500),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewing', 'resolved', 'dismissed')),
  resolution text CHECK (resolution IS NULL OR resolution IN ('no_action', 'warning', 'content_removed', 'temp_ban', 'permanent_ban')),
  moderator_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX idx_reports_reporter ON reports(reporter_id);
CREATE INDEX idx_reports_reported ON reports(reported_user_id);
CREATE INDEX idx_reports_status ON reports(status);

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own reports"
  ON reports FOR SELECT
  TO authenticated
  USING (reporter_id = auth.uid());

CREATE POLICY "Users can insert reports"
  ON reports FOR INSERT
  TO authenticated
  WITH CHECK (reporter_id = auth.uid());

-- =============================================================================
-- 10. BLOCKS
-- =============================================================================
CREATE TABLE blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  blocked_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_block UNIQUE (blocker_id, blocked_user_id),
  CONSTRAINT no_self_block CHECK (blocker_id != blocked_user_id)
);

CREATE INDEX idx_blocks_blocker ON blocks(blocker_id);
CREATE INDEX idx_blocks_blocked ON blocks(blocked_user_id);

ALTER TABLE blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own blocks"
  ON blocks FOR SELECT
  TO authenticated
  USING (blocker_id = auth.uid());

CREATE POLICY "Users can insert blocks"
  ON blocks FOR INSERT
  TO authenticated
  WITH CHECK (blocker_id = auth.uid());

CREATE POLICY "Users can delete own blocks (unblock)"
  ON blocks FOR DELETE
  TO authenticated
  USING (blocker_id = auth.uid());

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER activities_updated_at
  BEFORE UPDATE ON activities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-create profile row on auth signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, first_name, date_of_birth, photos, activity_preferences, gender)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    '2000-01-01',
    '{}',
    '{}',
    'man'
  );
  INSERT INTO discovery_preferences (user_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- =============================================================================
-- FEED RPC FUNCTION
-- =============================================================================

-- Haversine distance in miles
CREATE OR REPLACE FUNCTION haversine_miles(
  lat1 numeric, lng1 numeric,
  lat2 numeric, lng2 numeric
) RETURNS numeric AS $$
DECLARE
  dlat numeric;
  dlng numeric;
  a numeric;
BEGIN
  IF lat1 IS NULL OR lng1 IS NULL OR lat2 IS NULL OR lng2 IS NULL THEN
    RETURN NULL;
  END IF;
  dlat := radians(lat2 - lat1);
  dlng := radians(lng2 - lng1);
  a := sin(dlat / 2) ^ 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlng / 2) ^ 2;
  RETURN 3959 * 2 * asin(sqrt(a));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Get feed for a user with filtering and ranking
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
  interest_score integer
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
    CASE WHEN a.category = ANY(v_user.activity_preferences) THEN 1 ELSE 0 END AS interest_score
  FROM activities a
  JOIN profiles p ON p.id = a.user_id
  WHERE a.status = 'active'
    AND a.user_id != p_user_id
    AND p.is_active = true
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
