-- =============================================================================
-- Wanna seed data: demo account + 15 LA-based fake profiles + activities
-- + pre-populated swipes/queue/matches/messages.
--
-- Every row inserted here has is_seed = true so cleanup-seed-data can wipe
-- it in one transaction (see /supabase/cleanup_seed_data.sql).
--
-- The demo account login: demo@joinwannaapp.com / WannaDemo2026!
-- =============================================================================

-- Make this idempotent: clear any prior seed data first.
DELETE FROM messages WHERE is_seed = true;
DELETE FROM matches WHERE is_seed = true;
DELETE FROM interest_queue WHERE is_seed = true;
DELETE FROM swipes WHERE swiper_id IN (SELECT id FROM profiles WHERE is_seed = true);
DELETE FROM activities WHERE is_seed = true;
DELETE FROM blocks WHERE blocker_id IN (SELECT id FROM profiles WHERE is_seed = true)
  OR blocked_user_id IN (SELECT id FROM profiles WHERE is_seed = true);
DELETE FROM discovery_preferences WHERE user_id IN (SELECT id FROM profiles WHERE is_seed = true);
DELETE FROM profiles WHERE is_seed = true;
DELETE FROM auth.identities WHERE user_id IN (
  SELECT id FROM auth.users WHERE email LIKE '%@wanna.seed' OR email = 'demo@joinwannaapp.com'
);
DELETE FROM auth.users WHERE email LIKE '%@wanna.seed' OR email = 'demo@joinwannaapp.com';

-- We can't disable the on_auth_user_created trigger (auth schema owned by
-- supabase_auth_admin), so the trigger will create stub profile rows
-- when we INSERT into auth.users. We overwrite them via ON CONFLICT below.

-- =============================================================================
-- 1. AUTH USERS (demo + 15 seed profiles)
-- =============================================================================

-- Demo account: real bcrypt password so users can sign in via the
-- "Try the Demo" button.
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous,
  confirmation_token, recovery_token, email_change_token_new,
  email_change, email_change_token_current, reauthentication_token,
  phone_change, phone_change_token
) VALUES (
  '00000000-0000-0000-0000-000000000001'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated', 'authenticated',
  'demo@joinwannaapp.com',
  crypt('WannaDemo2026!', gen_salt('bf', 10)),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"first_name":"Alex"}'::jsonb,
  false, false,
  '', '', '', '', '', '', '', ''
);

-- Seed users — placeholder passwords, never used for sign-in.
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous,
  confirmation_token, recovery_token, email_change_token_new,
  email_change, email_change_token_current, reauthentication_token,
  phone_change, phone_change_token
)
SELECT
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated', 'authenticated',
  email,
  crypt('seed-no-login', gen_salt('bf', 10)),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('first_name', first_name),
  false, false,
  '', '', '', '', '', '', '', ''
FROM (VALUES
  ('maya@wanna.seed', 'Maya'),
  ('jordan@wanna.seed', 'Jordan'),
  ('sofia@wanna.seed', 'Sofia'),
  ('marcus@wanna.seed', 'Marcus'),
  ('tyler@wanna.seed', 'Tyler'),
  ('priya@wanna.seed', 'Priya'),
  ('aisha@wanna.seed', 'Aisha'),
  ('diego@wanna.seed', 'Diego'),
  ('sam@wanna.seed', 'Sam'),
  ('nora@wanna.seed', 'Nora'),
  ('kai@wanna.seed', 'Kai'),
  ('riley@wanna.seed', 'Riley'),
  ('lila@wanna.seed', 'Lila'),
  ('theo@wanna.seed', 'Theo'),
  ('zoe@wanna.seed', 'Zoe')
) AS s(email, first_name);

-- Convenience view for the rest of the script: map names → ids.
CREATE TEMP VIEW seed_user AS
SELECT
  id,
  email,
  raw_user_meta_data->>'first_name' AS first_name
FROM auth.users
WHERE email LIKE '%@wanna.seed' OR email = 'demo@joinwannaapp.com';

-- Each auth user needs a matching auth.identities row for email/password
-- login to work (Supabase auth driver looks them up by provider_id).
INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
)
SELECT
  gen_random_uuid(),
  id,
  id::text,
  'email',
  jsonb_build_object(
    'sub', id::text,
    'email', email,
    'email_verified', true,
    'phone_verified', false
  ),
  now(), now(), now()
FROM seed_user
ON CONFLICT (provider_id, provider) DO NOTHING;

-- =============================================================================
-- 2. PROFILES (demo + 15 seed)
-- =============================================================================

-- Demo profile: fully filled, verified.
INSERT INTO profiles (
  id, first_name, date_of_birth, bio, photos, activity_preferences, gender,
  profession, university, political_orientation, alcohol, marijuana, star_sign,
  has_seen_public_safety, is_verified, is_seed,
  location_lat, location_lng, is_active
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Alex',
  '1997-08-15',
  'Just moved to LA, looking for people to do stuff with — bonus if you also wanna try every taco truck in town.',
  ARRAY[
    'https://randomuser.me/api/portraits/men/32.jpg',
    'https://randomuser.me/api/portraits/men/33.jpg',
    'https://randomuser.me/api/portraits/men/34.jpg'
  ],
  ARRAY['Food & Dining', 'Outdoors & Adventure', 'Music & Concerts', 'Bars & Nightlife', 'Fitness & Sports'],
  'man',
  'Product designer',
  'UCLA',
  'liberal',
  'sometimes',
  'never',
  'Leo',
  true, true, true,
  34.0522, -118.2437, true
)
ON CONFLICT (id) DO UPDATE SET
  first_name = EXCLUDED.first_name,
  date_of_birth = EXCLUDED.date_of_birth,
  bio = EXCLUDED.bio,
  photos = EXCLUDED.photos,
  activity_preferences = EXCLUDED.activity_preferences,
  gender = EXCLUDED.gender,
  profession = EXCLUDED.profession,
  university = EXCLUDED.university,
  political_orientation = EXCLUDED.political_orientation,
  alcohol = EXCLUDED.alcohol,
  marijuana = EXCLUDED.marijuana,
  star_sign = EXCLUDED.star_sign,
  has_seen_public_safety = EXCLUDED.has_seen_public_safety,
  is_verified = EXCLUDED.is_verified,
  is_seed = EXCLUDED.is_seed,
  location_lat = EXCLUDED.location_lat,
  location_lng = EXCLUDED.location_lng,
  is_active = EXCLUDED.is_active;

-- Helper to insert seed profile by name lookup
CREATE OR REPLACE FUNCTION _seed_profile(
  p_name text,
  p_dob date,
  p_bio text,
  p_photos text[],
  p_prefs text[],
  p_gender text,
  p_profession text,
  p_university text,
  p_political text,
  p_alcohol text,
  p_marijuana text,
  p_star_sign text,
  p_lat numeric,
  p_lng numeric
) RETURNS void AS $$
BEGIN
  INSERT INTO profiles (
    id, first_name, date_of_birth, bio, photos, activity_preferences, gender,
    profession, university, political_orientation, alcohol, marijuana, star_sign,
    has_seen_public_safety, is_verified, is_seed,
    location_lat, location_lng, is_active
  )
  SELECT id, p_name, p_dob, p_bio, p_photos, p_prefs, p_gender,
    p_profession, p_university, p_political, p_alcohol, p_marijuana, p_star_sign,
    true, true, true, p_lat, p_lng, true
  FROM seed_user WHERE first_name = p_name LIMIT 1
  ON CONFLICT (id) DO UPDATE SET
    first_name = EXCLUDED.first_name,
    date_of_birth = EXCLUDED.date_of_birth,
    bio = EXCLUDED.bio,
    photos = EXCLUDED.photos,
    activity_preferences = EXCLUDED.activity_preferences,
    gender = EXCLUDED.gender,
    profession = EXCLUDED.profession,
    university = EXCLUDED.university,
    political_orientation = EXCLUDED.political_orientation,
    alcohol = EXCLUDED.alcohol,
    marijuana = EXCLUDED.marijuana,
    star_sign = EXCLUDED.star_sign,
    has_seen_public_safety = EXCLUDED.has_seen_public_safety,
    is_verified = EXCLUDED.is_verified,
    is_seed = EXCLUDED.is_seed,
    location_lat = EXCLUDED.location_lat,
    location_lng = EXCLUDED.location_lng,
    is_active = EXCLUDED.is_active;
END;
$$ LANGUAGE plpgsql;

-- 15 LA-based seed profiles
SELECT _seed_profile('Maya', '1997-04-22',
  'New to Silver Lake. Looking for hiking buddies + brunch people.',
  ARRAY['https://randomuser.me/api/portraits/women/12.jpg', 'https://randomuser.me/api/portraits/women/13.jpg'],
  ARRAY['Outdoors & Adventure', 'Food & Dining', 'Books & Learning'],
  'woman', 'UX researcher', 'NYU', 'liberal', 'sometimes', 'rarely', 'Taurus',
  34.0900, -118.2702);

SELECT _seed_profile('Jordan', '1999-11-03',
  'Foodie, casual hiker, always down for live music. DTLA based.',
  ARRAY['https://randomuser.me/api/portraits/men/45.jpg', 'https://randomuser.me/api/portraits/men/46.jpg'],
  ARRAY['Food & Dining', 'Music & Concerts', 'Bars & Nightlife'],
  'man', 'Software engineer', 'USC', 'liberal', 'often', 'sometimes', 'Scorpio',
  34.0407, -118.2468);

SELECT _seed_profile('Sofia', '1995-07-19',
  'Tennis 4x a week. Looking for a hitting partner near Venice.',
  ARRAY['https://randomuser.me/api/portraits/women/55.jpg', 'https://randomuser.me/api/portraits/women/56.jpg'],
  ARRAY['Fitness & Sports', 'Outdoors & Adventure', 'Food & Dining'],
  'woman', 'Marketing manager', 'UC Berkeley', 'moderate', 'rarely', 'never', 'Cancer',
  33.9850, -118.4695);

SELECT _seed_profile('Marcus', '1993-02-14',
  'Live music, vinyl, dive bars. WeHo. Friendly and easy to chat with.',
  ARRAY['https://randomuser.me/api/portraits/men/22.jpg', 'https://randomuser.me/api/portraits/men/23.jpg'],
  ARRAY['Music & Concerts', 'Bars & Nightlife', 'Arts & Culture'],
  'man', 'Music producer', 'Berklee College of Music', 'liberal', 'often', 'often', 'Aquarius',
  34.0900, -118.3617);

SELECT _seed_profile('Tyler', '2000-09-08',
  'Coffee shop dweller, indie tech. Up for co-working in Culver City.',
  ARRAY['https://randomuser.me/api/portraits/men/67.jpg', 'https://randomuser.me/api/portraits/men/68.jpg'],
  ARRAY['Books & Learning', 'Gaming & Tech', 'Food & Dining'],
  'man', 'Indie developer', 'Stanford', 'moderate', 'rarely', 'never', 'Virgo',
  34.0211, -118.3965);

SELECT _seed_profile('Priya', '1998-06-25',
  'Sunday Farmers Market regular. Trying to do something new every weekend.',
  ARRAY['https://randomuser.me/api/portraits/women/24.jpg', 'https://randomuser.me/api/portraits/women/25.jpg'],
  ARRAY['Food & Dining', 'Outdoors & Adventure', 'Arts & Culture'],
  'woman', 'Doctor', 'UCLA', 'liberal', 'sometimes', 'never', 'Cancer',
  34.0195, -118.4912);

SELECT _seed_profile('Aisha', '2001-12-30',
  'Echo Park-based, into gallery openings and indie shows.',
  ARRAY['https://randomuser.me/api/portraits/women/65.jpg', 'https://randomuser.me/api/portraits/women/66.jpg'],
  ARRAY['Arts & Culture', 'Music & Concerts', 'Movies & Shows'],
  'woman', 'Photographer', 'CalArts', 'liberal', 'sometimes', 'sometimes', 'Capricorn',
  34.0780, -118.2606);

SELECT _seed_profile('Diego', '1996-03-11',
  'Trail runner, climber, post-run pancakes person. Pasadena.',
  ARRAY['https://randomuser.me/api/portraits/men/14.jpg', 'https://randomuser.me/api/portraits/men/15.jpg'],
  ARRAY['Outdoors & Adventure', 'Fitness & Sports', 'Food & Dining'],
  'man', 'Civil engineer', 'Caltech', 'moderate', 'rarely', 'never', 'Pisces',
  34.1478, -118.1445);

SELECT _seed_profile('Sam', '1999-05-17',
  'K-town foodie. Cinephile. Down for late-night noodles and movies.',
  ARRAY['https://randomuser.me/api/portraits/lego/3.jpg', 'https://randomuser.me/api/portraits/lego/4.jpg'],
  ARRAY['Food & Dining', 'Movies & Shows', 'Bars & Nightlife'],
  'nonbinary', 'Editor', 'NYU', 'liberal', 'often', 'rarely', 'Taurus',
  34.0578, -118.3068);

SELECT _seed_profile('Nora', '1994-10-02',
  'Bookstore-and-bakery kind of weekend. Burbank. Cozy plans only.',
  ARRAY['https://randomuser.me/api/portraits/women/77.jpg', 'https://randomuser.me/api/portraits/women/78.jpg'],
  ARRAY['Books & Learning', 'Movies & Shows', 'Food & Dining'],
  'woman', 'Editor', 'Columbia', 'liberal', 'sometimes', 'never', 'Libra',
  34.1808, -118.3090);

SELECT _seed_profile('Kai', '1997-01-28',
  'Surfer, hiker, sunset chaser. Venice all the time.',
  ARRAY['https://randomuser.me/api/portraits/men/52.jpg', 'https://randomuser.me/api/portraits/men/53.jpg'],
  ARRAY['Outdoors & Adventure', 'Music & Concerts', 'Fitness & Sports'],
  'man', 'Marine biologist', 'UCSD', 'liberal', 'sometimes', 'sometimes', 'Aquarius',
  33.9850, -118.4695);

SELECT _seed_profile('Riley', '2000-08-12',
  'Board games, dive bars, niche concerts. Easy hang.',
  ARRAY['https://randomuser.me/api/portraits/lego/1.jpg', 'https://randomuser.me/api/portraits/lego/2.jpg'],
  ARRAY['Gaming & Tech', 'Bars & Nightlife', 'Music & Concerts'],
  'nonbinary', 'Game designer', 'USC', 'liberal', 'sometimes', 'rarely', 'Leo',
  34.0407, -118.2468);

SELECT _seed_profile('Lila', '1998-04-09',
  'Wine bar dates and dinner parties. Silver Lake. Foodie warning.',
  ARRAY['https://randomuser.me/api/portraits/women/41.jpg', 'https://randomuser.me/api/portraits/women/42.jpg'],
  ARRAY['Food & Dining', 'Bars & Nightlife', 'Arts & Culture'],
  'woman', 'Sommelier', 'Le Cordon Bleu', 'liberal', 'often', 'rarely', 'Aries',
  34.0900, -118.2702);

SELECT _seed_profile('Theo', '1992-11-21',
  'Architecture buff, weekend cyclist, espresso pedant. Pasadena.',
  ARRAY['https://randomuser.me/api/portraits/men/76.jpg', 'https://randomuser.me/api/portraits/men/77.jpg'],
  ARRAY['Books & Learning', 'Arts & Culture', 'Outdoors & Adventure'],
  'man', 'Architect', 'Yale', 'moderate', 'rarely', 'never', 'Sagittarius',
  34.1478, -118.1445);

SELECT _seed_profile('Zoe', '1996-09-04',
  'Show-going, bar-hopping, Sunday-funday WeHo person.',
  ARRAY['https://randomuser.me/api/portraits/women/89.jpg', 'https://randomuser.me/api/portraits/women/90.jpg'],
  ARRAY['Music & Concerts', 'Bars & Nightlife', 'Food & Dining'],
  'woman', 'Publicist', 'NYU', 'liberal', 'often', 'sometimes', 'Virgo',
  34.0900, -118.3617);

DROP FUNCTION _seed_profile;

-- Discovery preferences for everyone (default friends, broad)
INSERT INTO discovery_preferences (user_id, modes, show_me, age_min, age_max, max_distance_miles)
SELECT id, ARRAY['friends', 'dating', 'networking']::text[], 'everyone', 18, 99, 100
FROM seed_user
ON CONFLICT (user_id) DO UPDATE SET
  modes = EXCLUDED.modes,
  show_me = EXCLUDED.show_me,
  age_min = EXCLUDED.age_min,
  age_max = EXCLUDED.age_max,
  max_distance_miles = EXCLUDED.max_distance_miles;

-- =============================================================================
-- 3. ACTIVITIES (demo + 30+ from seed users)
-- =============================================================================

-- Demo's posted activities (queues will fill up under section 4).
-- photo_url + photo_source are required by migration 00021 (NOT NULL),
-- so we seed category-keyed Unsplash placeholders here. The
-- backfill_seed_photos.py / backfill_remaining_photos.py scripts run
-- afterwards and swap in per-title photos.
INSERT INTO activities (id, user_id, title, description, category, intent, intents, location_lat, location_lng, location_name, activity_date, photo_url, photo_source, is_seed, status)
VALUES
  (
    '11111111-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'Beach volleyball at Manhattan Beach pier',
    'Pickup volleyball Saturday morning. All skill levels welcome — I''m middle-of-the-road. Bring water, sunscreen, and a chill attitude.',
    'Fitness & Sports', 'friends', ARRAY['friends'],
    33.8847, -118.4109, 'Manhattan Beach Pier',
    (CURRENT_DATE + INTERVAL '5 days')::date,
    'https://images.unsplash.com/photo-1571902943202-507ec2618e8f?w=1200&q=80&auto=format&fit=crop',
    'unsplash',
    true, 'active'
  ),
  (
    '11111111-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    'KBBQ at Park''s BBQ',
    'I''ve been craving Park''s for weeks. Looking for a fellow KBBQ enthusiast to split a few cuts. No pineapple-on-pizza-types please.',
    'Food & Dining', 'friends', ARRAY['friends'],
    34.0578, -118.3068, 'Park''s BBQ, Koreatown',
    NULL,
    'https://images.unsplash.com/photo-1557872943-16a5ac26437e?w=1200&q=80&auto=format&fit=crop',
    'unsplash',
    true, 'active'
  );

-- Helper for seed activities
CREATE OR REPLACE FUNCTION _seed_activity(
  p_owner_name text,
  p_title text,
  p_description text,
  p_category text,
  p_intent text,
  p_lat numeric,
  p_lng numeric,
  p_location_name text,
  p_days_out integer
) RETURNS uuid AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO activities (user_id, title, description, category, intent, intents, location_lat, location_lng, location_name, activity_date, photo_url, photo_source, is_seed, status)
  SELECT id, p_title, p_description, p_category, p_intent, ARRAY[p_intent], p_lat, p_lng, p_location_name,
    CASE WHEN p_days_out IS NULL THEN NULL ELSE (CURRENT_DATE + (p_days_out || ' days')::interval)::date END,
    -- Category-keyed Unsplash placeholder (mirrors migration 00021's
    -- backfill). The python backfill scripts swap these for per-title
    -- photos after seed runs.
    CASE p_category
      WHEN 'Music & Concerts'     THEN 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=1200&q=80&auto=format&fit=crop'
      WHEN 'Outdoors & Adventure' THEN 'https://images.unsplash.com/photo-1547036967-23d11aacaee0?w=1200&q=80&auto=format&fit=crop'
      WHEN 'Fitness & Sports'     THEN 'https://images.unsplash.com/photo-1571902943202-507ec2618e8f?w=1200&q=80&auto=format&fit=crop'
      WHEN 'Food & Dining'        THEN 'https://images.unsplash.com/photo-1557872943-16a5ac26437e?w=1200&q=80&auto=format&fit=crop'
      WHEN 'Arts & Culture'       THEN 'https://images.unsplash.com/photo-1503095396549-807759245b35?w=1200&q=80&auto=format&fit=crop'
      WHEN 'Bars & Nightlife'     THEN 'https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=1200&q=80&auto=format&fit=crop'
      WHEN 'Books & Learning'     THEN 'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=1200&q=80&auto=format&fit=crop'
      WHEN 'Movies & Shows'       THEN 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=1200&q=80&auto=format&fit=crop'
      WHEN 'Gaming & Tech'        THEN 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=1200&q=80&auto=format&fit=crop'
      ELSE                             'https://images.unsplash.com/photo-1521334884684-d80222895322?w=1200&q=80&auto=format&fit=crop'
    END,
    'unsplash',
    true, 'active'
  FROM seed_user WHERE first_name = p_owner_name LIMIT 1
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- Seed user activities (a couple per user for a believable feed)
SELECT _seed_activity('Maya', 'Griffith Observatory sunset hike',
  'Heading up the trail around 5pm to catch the sunset. Easy 3-mile loop. Bringing snacks to share.',
  'Outdoors & Adventure', 'friends', 34.1184, -118.3004, 'Griffith Observatory', 4);
SELECT _seed_activity('Maya', 'Brunch at Sqirl',
  'Saturday brunch crew? The ricotta toast is non-negotiable.',
  'Food & Dining', 'friends', 34.0921, -118.2843, 'Sqirl, Silver Lake', 3);

SELECT _seed_activity('Jordan', 'Trying Daikokuya Ramen in Little Tokyo',
  'It''s a wait but the broth is unreal. Let''s grab a beer at Far Bar after. https://www.daikoku-ten.com/',
  'Food & Dining', 'friends', 34.0500, -118.2390, 'Daikokuya, DTLA', 2);
SELECT _seed_activity('Jordan', 'The Echo show next Friday',
  'Got a spare ticket. Indie band, doors at 8.',
  'Music & Concerts', 'friends', 34.0780, -118.2606, 'The Echo, Echo Park', 7);

SELECT _seed_activity('Sofia', 'Weekend tennis at Venice Beach courts',
  'Looking for a hitting partner. I''m a 3.5/4.0. Saturday or Sunday morning.',
  'Fitness & Sports', 'friends', 33.9850, -118.4695, 'Venice Beach Recreation Center', NULL);
SELECT _seed_activity('Sofia', 'Sunday hike in Topanga',
  'Eagle Rock trail. Moderate, ~5 miles. Brunch after.',
  'Outdoors & Adventure', 'friends', 34.0938, -118.5811, 'Topanga State Park', 5);

SELECT _seed_activity('Marcus', 'Live jazz at the Blue Whale',
  'Catching a quartet I''ve been wanting to see. Drinks first, then show.',
  'Music & Concerts', 'dating', 34.0500, -118.2390, 'Blue Whale Jazz Club, Little Tokyo', 6);
SELECT _seed_activity('Marcus', 'Record shop crawl on Sunset',
  'Three stops, four hours, beers in between.',
  'Music & Concerts', 'friends', 34.0959, -118.3287, 'Sunset Blvd, Hollywood', NULL);

SELECT _seed_activity('Tyler', 'Co-working at Cognoscenti Coffee',
  'Working remote. Looking for someone to keep me accountable for 4 hours of focus + lunch break.',
  'Books & Learning', 'networking', 34.0211, -118.3965, 'Cognoscenti Coffee, Culver City', NULL);
SELECT _seed_activity('Tyler', 'Indie Game Night at GameHaus',
  'Board games. Beers. Easy social.',
  'Gaming & Tech', 'friends', 34.0211, -118.3965, 'GameHaus, Pasadena', 8);

SELECT _seed_activity('Priya', 'Sunday stroll at the Santa Monica Farmers Market',
  'Then maybe coffee at Funnel Mill. No agenda, just walking and snacking.',
  'Food & Dining', 'friends', 34.0195, -118.4912, 'Santa Monica Farmers Market', 4);
SELECT _seed_activity('Priya', 'LACMA + lunch',
  'There''s a new exhibit I want to check out. Lunch after at Ray''s.',
  'Arts & Culture', 'friends', 34.0640, -118.3590, 'LACMA', NULL);

SELECT _seed_activity('Aisha', 'Gallery opening at Hauser & Wirth',
  'Always good wine + interesting people. DTLA Friday evening.',
  'Arts & Culture', 'networking', 34.0382, -118.2351, 'Hauser & Wirth DTLA', 3);
SELECT _seed_activity('Aisha', 'Friday show at the Bootleg Theater',
  'Two-band bill I''m excited about. Doors at 9.',
  'Music & Concerts', 'friends', 34.0596, -118.2691, 'Bootleg Theater', 2);

SELECT _seed_activity('Diego', 'Sunday morning trail run in Griffith',
  '5-6 miles, easy pace. Brunch at HomeState after.',
  'Fitness & Sports', 'friends', 34.1184, -118.3004, 'Griffith Park', 4);
SELECT _seed_activity('Diego', 'Bouldering at Stronghold',
  'Beginner-friendly. Will show you the ropes (literally).',
  'Fitness & Sports', 'friends', 34.0407, -118.2468, 'Stronghold Climbing Gym, DTLA', NULL);

SELECT _seed_activity('Sam', 'Late-night noodles + a movie',
  'Daikokuya then Vidiots. Saturday or Sunday night.',
  'Food & Dining', 'friends', 34.0500, -118.2390, 'Little Tokyo → Eagle Rock', NULL);
SELECT _seed_activity('Sam', 'Kim''s Korean BBQ Sunday',
  'Need someone to share the pork belly with.',
  'Food & Dining', 'friends', 34.0578, -118.3068, 'Kang Ho Dong Baekjeong, Koreatown', 5);

SELECT _seed_activity('Nora', 'Used bookstore crawl',
  'The Last Bookstore → Dawson''s → Iliad. Coffee in between. Easy day.',
  'Books & Learning', 'friends', 34.0470, -118.2503, 'The Last Bookstore', 6);
SELECT _seed_activity('Nora', 'Movie night at Vidiots',
  'They''re showing 2 Wong Kar-wai classics. Want a movie buddy.',
  'Movies & Shows', 'friends', 34.1392, -118.2102, 'Vidiots, Eagle Rock', 9);

SELECT _seed_activity('Kai', 'Beginner surf lesson Sat morning',
  'I''ll teach you. Bring a wetsuit or rent at the shop.',
  'Outdoors & Adventure', 'friends', 33.9850, -118.4695, 'Venice Beach', 6);
SELECT _seed_activity('Kai', 'Hike + sunset at Solstice Canyon',
  'Easy 3-mile out and back. Beers after.',
  'Outdoors & Adventure', 'friends', 34.0376, -118.7424, 'Solstice Canyon, Malibu', 3);

SELECT _seed_activity('Riley', 'Bottega Louie pasta + arcade after',
  'Eat pasta then walk to Two Bit Circus. DTLA Sunday afternoon.',
  'Gaming & Tech', 'friends', 34.0500, -118.2553, 'Bottega Louie + Two Bit Circus, DTLA', 7);

SELECT _seed_activity('Lila', 'Natural wine night at Tabula Rasa',
  'New menu. I''ll bring vibes if you bring questions.',
  'Bars & Nightlife', 'dating', 34.0900, -118.2702, 'Tabula Rasa Bar, Hollywood', 4);
SELECT _seed_activity('Lila', 'Dinner at Bestia',
  'Splurge meal. Can we get the lamb belly cured + the squid ink chitarra?',
  'Food & Dining', 'friends', 34.0345, -118.2306, 'Bestia, DTLA', 10);

SELECT _seed_activity('Theo', 'Hammer Museum + matcha at Maru',
  'Quiet morning agenda. Westwood.',
  'Arts & Culture', 'friends', 34.0596, -118.4434, 'Hammer Museum, Westwood', NULL);

SELECT _seed_activity('Zoe', 'Hollywood Bowl this weekend',
  'Got a spare. Picnic + show. Sunday evening.',
  'Music & Concerts', 'friends', 34.1122, -118.3398, 'Hollywood Bowl', 3);
SELECT _seed_activity('Zoe', 'Brunch + hike combo',
  'Brunch at Republique then easy hike at Runyon.',
  'Outdoors & Adventure', 'friends', 34.1056, -118.3403, 'Republique → Runyon Canyon', 2);

DROP FUNCTION _seed_activity;

-- =============================================================================
-- 4. INTEREST QUEUE for demo's activities
-- (5-7 seed users interested in each demo activity)
-- =============================================================================

-- Demo's first activity (volleyball): 5 interested seed users.
-- Each row carries a swiper_mode (so the Who's In list shows the
-- mode pill) and a few of them include a first_message so the demo
-- can see what the message-preview state looks like.
INSERT INTO interest_queue (activity_id, interested_user_id, status, batch_number, is_seed, swiper_mode, first_message)
SELECT
  '11111111-0000-0000-0000-000000000001',
  id,
  'pending', 1, true,
  CASE first_name
    WHEN 'Sofia' THEN 'friends'
    WHEN 'Diego' THEN 'friends'
    WHEN 'Kai'   THEN 'dating'
    WHEN 'Riley' THEN 'friends'
    WHEN 'Maya'  THEN 'networking'
  END,
  CASE first_name
    WHEN 'Sofia' THEN 'I''ve been wanting to get back into beach vball — count me in!'
    WHEN 'Kai'   THEN 'Played some pickup last weekend. Down for Sat morning if the level is chill.'
    WHEN 'Maya'  THEN 'Total beginner but eager to learn — promise I''ll bring snacks.'
    ELSE NULL
  END
FROM seed_user
WHERE first_name IN ('Sofia', 'Diego', 'Kai', 'Riley', 'Maya');

-- Demo's second activity (KBBQ): 6 interested seed users.
INSERT INTO interest_queue (activity_id, interested_user_id, status, batch_number, is_seed, swiper_mode, first_message)
SELECT
  '11111111-0000-0000-0000-000000000002',
  id,
  'pending', 1, true,
  CASE first_name
    WHEN 'Sam'    THEN 'friends'
    WHEN 'Lila'   THEN 'dating'
    WHEN 'Jordan' THEN 'friends'
    WHEN 'Nora'   THEN 'networking'
    WHEN 'Aisha'  THEN 'friends'
    WHEN 'Tyler'  THEN 'dating'
  END,
  CASE first_name
    WHEN 'Lila'   THEN 'KBBQ is my love language — I''m in.'
    WHEN 'Jordan' THEN 'Park''s is the move. Easy yes from me.'
    ELSE NULL
  END
FROM seed_user
WHERE first_name IN ('Sam', 'Lila', 'Jordan', 'Nora', 'Aisha', 'Tyler');

-- Also: demo expressed interest in some seed activities (in their queues)
-- This helps make Discover non-empty for the demo and also makes
-- some seed posters' Who's In tabs non-empty in case the demo browses them.
INSERT INTO interest_queue (activity_id, interested_user_id, status, batch_number, is_seed)
SELECT a.id, '00000000-0000-0000-0000-000000000001', 'pending', 1, true
FROM activities a
JOIN profiles p ON p.id = a.user_id
WHERE a.is_seed = true AND p.first_name IN ('Maya', 'Priya')
LIMIT 2;

-- =============================================================================
-- 5. MATCHES + MESSAGES (2 active matches with the demo for chat history)
-- =============================================================================

-- Match 1: Demo + Sofia, on a previous (now archived) activity Sofia posted.
-- For seed simplicity, we'll create an extra demo-owned activity that Sofia
-- matched on, and then build a chat thread.

-- Create a third demo activity that already led to a match with Sofia
INSERT INTO activities (id, user_id, title, description, category, intent, intents, location_lat, location_lng, location_name, activity_date, photo_url, photo_source, is_seed, status)
VALUES (
  '11111111-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000001',
  'Tennis at Plummer Park',
  'Sat morning hits. 3.5 level.',
  'Fitness & Sports', 'friends', ARRAY['friends'],
  34.0867, -118.3582, 'Plummer Park', NULL,
  'https://images.unsplash.com/photo-1571902943202-507ec2618e8f?w=1200&q=80&auto=format&fit=crop',
  'unsplash',
  true, 'active'
);

-- Sofia accepted Demo's tennis match
INSERT INTO interest_queue (activity_id, interested_user_id, status, batch_number, is_seed, reviewed_at)
SELECT '11111111-0000-0000-0000-000000000003', id, 'accepted', 1, true, now() - INTERVAL '2 days'
FROM seed_user WHERE first_name = 'Sofia';

INSERT INTO matches (id, activity_id, poster_id, interested_id, status, matched_at, is_seed)
SELECT
  '22222222-0000-0000-0000-000000000001',
  '11111111-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000001',
  id,
  'active',
  now() - INTERVAL '2 days',
  true
FROM seed_user WHERE first_name = 'Sofia';

-- Match 2: Demo + Jordan, on Jordan's ramen activity (demo expressed interest, Jordan accepted)
-- Find Jordan's ramen activity and create the match
INSERT INTO matches (id, activity_id, poster_id, interested_id, status, matched_at, is_seed)
SELECT
  '22222222-0000-0000-0000-000000000002',
  a.id,
  a.user_id,
  '00000000-0000-0000-0000-000000000001',
  'active',
  now() - INTERVAL '5 hours',
  true
FROM activities a
JOIN profiles p ON p.id = a.user_id
WHERE a.is_seed = true AND p.first_name = 'Jordan' AND a.title LIKE '%Daikokuya%';

-- Insert demo's interest in Jordan's ramen as already-accepted (it's where the match came from)
INSERT INTO interest_queue (activity_id, interested_user_id, status, batch_number, is_seed, reviewed_at)
SELECT a.id, '00000000-0000-0000-0000-000000000001', 'accepted', 1, true, now() - INTERVAL '5 hours'
FROM activities a JOIN profiles p ON p.id = a.user_id
WHERE a.is_seed = true AND p.first_name = 'Jordan' AND a.title LIKE '%Daikokuya%';

-- =============================================================================
-- Sample messages
-- =============================================================================

-- Match 1 (Sofia + Demo): Sofia sent the first messages
INSERT INTO messages (match_id, sender_id, body, status, created_at, delivered_at, read_at, is_seed)
SELECT '22222222-0000-0000-0000-000000000001', id,
  'Hey! Excited to hit some balls with you!', 'read',
  now() - INTERVAL '2 days' + INTERVAL '15 minutes',
  now() - INTERVAL '2 days' + INTERVAL '15 minutes',
  now() - INTERVAL '2 days' + INTERVAL '20 minutes',
  true
FROM seed_user WHERE first_name = 'Sofia';

INSERT INTO messages (match_id, sender_id, body, status, created_at, delivered_at, read_at, is_seed)
VALUES (
  '22222222-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'Same! What time works on Saturday?', 'read',
  now() - INTERVAL '2 days' + INTERVAL '21 minutes',
  now() - INTERVAL '2 days' + INTERVAL '21 minutes',
  now() - INTERVAL '2 days' + INTERVAL '30 minutes',
  true
);

INSERT INTO messages (match_id, sender_id, body, status, created_at, delivered_at, read_at, is_seed)
SELECT '22222222-0000-0000-0000-000000000001', id,
  '9am? It''s usually pretty empty then. Court 3 if it''s open.', 'read',
  now() - INTERVAL '2 days' + INTERVAL '32 minutes',
  now() - INTERVAL '2 days' + INTERVAL '32 minutes',
  now() - INTERVAL '2 days' + INTERVAL '34 minutes',
  true
FROM seed_user WHERE first_name = 'Sofia';

INSERT INTO messages (match_id, sender_id, body, status, created_at, delivered_at, read_at, is_seed)
VALUES (
  '22222222-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'Done. See you there.', 'read',
  now() - INTERVAL '2 days' + INTERVAL '35 minutes',
  now() - INTERVAL '2 days' + INTERVAL '35 minutes',
  now() - INTERVAL '2 days' + INTERVAL '36 minutes',
  true
);

-- Match 2 (Jordan + Demo, recent — has unread from Jordan)
INSERT INTO messages (match_id, sender_id, body, status, created_at, delivered_at, is_seed)
SELECT '22222222-0000-0000-0000-000000000002', id,
  'Hey! Glad you''re in for ramen. When were you thinking?', 'delivered',
  now() - INTERVAL '4 hours',
  now() - INTERVAL '4 hours',
  true
FROM seed_user WHERE first_name = 'Jordan';

INSERT INTO messages (match_id, sender_id, body, status, created_at, delivered_at, is_seed)
SELECT '22222222-0000-0000-0000-000000000002', id,
  'I was eyeing tomorrow night around 7? Heard the wait gets long after 7:30.', 'delivered',
  now() - INTERVAL '3 hours' - INTERVAL '30 minutes',
  now() - INTERVAL '3 hours' - INTERVAL '30 minutes',
  true
FROM seed_user WHERE first_name = 'Jordan';

-- Sanity check
SELECT
  (SELECT COUNT(*) FROM profiles WHERE is_seed) AS seed_profiles,
  (SELECT COUNT(*) FROM activities WHERE is_seed) AS seed_activities,
  (SELECT COUNT(*) FROM interest_queue WHERE is_seed) AS seed_queue_entries,
  (SELECT COUNT(*) FROM matches WHERE is_seed) AS seed_matches,
  (SELECT COUNT(*) FROM messages WHERE is_seed) AS seed_messages;
