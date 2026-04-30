-- Fix: original schema's CHECK on photos/activity_preferences rejected the
-- empty array used by the on_auth_user_created trigger to seed a stub
-- profile row. array_length('{}', 1) returns NULL, which makes
-- BETWEEN 1 AND 6 evaluate NULL → constraint fails.
--
-- Resolution: allow 0–6 photos / 0–10 preferences at the DB level. The
-- app enforces ≥1 of each at onboarding submit (PreferencesScreen).

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_photos_check;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_photos_check
  CHECK (COALESCE(array_length(photos, 1), 0) <= 6);

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_activity_preferences_check;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_activity_preferences_check
  CHECK (COALESCE(array_length(activity_preferences, 1), 0) <= 10);
