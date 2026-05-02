-- Migration 00020: Banned-email blocklist
--
-- When a user receives a permanent_ban, their email is written to
-- banned_emails. The handle_new_user trigger checks this table and refuses
-- to create a profile for any banned email, forcing the user to use a
-- different address (raising the friction substantially without being
-- bulletproof — device/phone fingerprinting is a separate concern).
--
-- Emails are normalized to lowercase on both write and check so case
-- variations don't slip through.

CREATE TABLE IF NOT EXISTS public.banned_emails (
  email             text         PRIMARY KEY,
  banned_at         timestamptz  NOT NULL DEFAULT now(),
  original_user_id  uuid         NULL,  -- auth.users id at time of ban (FK omitted; row may be deleted)
  banned_by         uuid         NULL,  -- moderator who applied the ban
  reason            text         NULL,
  CONSTRAINT banned_emails_email_lowercase CHECK (email = lower(email))
);

COMMENT ON TABLE public.banned_emails IS
  'Emails permanently banned from re-signup. Checked by handle_new_user trigger.';
COMMENT ON COLUMN public.banned_emails.email IS
  'Lowercased email address. Inserts must lowercase before writing.';

-- RLS: only service-role can read or write. Regular users (auth or anon)
-- shouldn't be able to enumerate banned emails.
ALTER TABLE public.banned_emails ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_only_banned_emails" ON public.banned_emails;
CREATE POLICY "service_role_only_banned_emails"
  ON public.banned_emails
  FOR ALL
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

-- ============================================================================
-- Update handle_new_user to reject banned emails
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- Reject if the email is on the permanent-ban blocklist.
  -- Generic error so the user can't tell it's a ban-specific rejection.
  IF EXISTS (
    SELECT 1 FROM public.banned_emails
    WHERE email = lower(COALESCE(NEW.email, ''))
  ) THEN
    RAISE EXCEPTION 'signup_not_allowed' USING HINT = 'This email cannot be used to create an account.';
  END IF;

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

ALTER FUNCTION public.handle_new_user() OWNER TO postgres;
