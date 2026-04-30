-- Fix: handle_new_user trigger had no explicit search_path. When invoked
-- via the GoTrue auth service (which runs as supabase_auth_admin), the
-- function couldn't resolve the unqualified `profiles` and
-- `discovery_preferences` table references, so signups failed with a
-- generic "Database error saving new user" 500.
--
-- Resolution: add `SET search_path = public, auth` and qualify the
-- table references defensively.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  INSERT INTO public.profiles (
    id, first_name, date_of_birth, photos, activity_preferences, gender
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    '2000-01-01',
    '{}',
    '{}',
    'man'
  );
  INSERT INTO public.discovery_preferences (user_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$;

-- Make sure the function owner is postgres (was set on creation).
ALTER FUNCTION public.handle_new_user() OWNER TO postgres;
