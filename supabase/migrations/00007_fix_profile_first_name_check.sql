-- Fix: original schema's CHECK on first_name (BETWEEN 1 AND 30) rejects
-- the empty string the on_auth_user_created trigger inserts when the
-- raw_user_meta_data has no first_name (e.g. plain email signup).
--
-- Resolution: allow up to 30 chars (including empty); the app enforces
-- 1+ chars at onboarding submit (NameScreen.tsx).

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_first_name_check;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_first_name_check
  CHECK (char_length(first_name) <= 30);
