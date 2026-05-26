-- Track welcome-email-sent state on profiles, and update the login-alert
-- trigger to use it for the "is this the user's first sign-in?" check.
--
-- Why: the previous login-alert trigger (00056) skipped the first session
-- ever by counting `auth.sessions` rows for the user. But Supabase DELETES
-- session rows on sign-out, so a returning user always looks like
-- "session #1" to that count. Result: login alerts never fired for any
-- user who signs out before signing back in — i.e., the exact pattern
-- the alert is designed to catch.
--
-- New approach: stamp `profiles.welcome_email_sent_at` whenever the
-- welcome email trigger fires. The login-alert trigger checks that
-- column instead of counting sessions. Once a user has been welcomed,
-- every subsequent session-creation gets the alert path (subject to
-- the existing 30-day fingerprint dedup).

-- ---------- 1. Schema ----------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS welcome_email_sent_at timestamptz;

COMMENT ON COLUMN public.profiles.welcome_email_sent_at IS
  'Stamped by handle_email_confirmed_send_welcome when the welcome email '
  'is dispatched. Used by handle_session_login_alert to determine whether '
  'a sign-in is "post-welcome" (eligible for login alerts) or pre-welcome '
  '(skipped, since the welcome email is the user''s introduction).';

-- Backfill: every existing user with a confirmed email has, by definition,
-- already received the welcome email under the previous trigger. Stamp
-- their welcome_email_sent_at = email_confirmed_at so the login-alert
-- trigger immediately recognizes them as post-welcome on next sign-in.
UPDATE public.profiles p
SET    welcome_email_sent_at = u.email_confirmed_at
FROM   auth.users u
WHERE  p.id = u.id
  AND  u.email_confirmed_at IS NOT NULL
  AND  p.welcome_email_sent_at IS NULL;

-- ---------- 2. Welcome trigger: stamp the column when firing ----------

CREATE OR REPLACE FUNCTION public.handle_email_confirmed_send_welcome()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_function_url text := 'https://ymztxrpkhenbcbjjfbxr.supabase.co/functions/v1/send-email';
  v_service_role_key text;
BEGIN
  -- Only fire when email_confirmed_at goes from NULL to non-NULL.
  IF NEW.email_confirmed_at IS NULL OR OLD.email_confirmed_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT decrypted_secret INTO v_service_role_key
    FROM vault.decrypted_secrets
    WHERE name = 'service_role_key' LIMIT 1;

  IF v_service_role_key IS NULL THEN
    RAISE WARNING 'service_role_key not in vault — welcome email skipped for %', NEW.id;
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := v_function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_role_key
    ),
    body := jsonb_build_object(
      'template', 'welcome',
      'recipient_id', NEW.id::text
    )
  );

  -- Stamp profiles.welcome_email_sent_at so the login-alert trigger can
  -- distinguish "pre-welcome first sign-in" from "post-welcome returning
  -- sign-in." This is the source of truth for that state.
  UPDATE public.profiles
  SET    welcome_email_sent_at = now()
  WHERE  id = NEW.id
    AND  welcome_email_sent_at IS NULL;

  RETURN NEW;
END;
$$;

-- ---------- 3. Login-alert trigger: check welcome-sent instead of session count ----------

CREATE OR REPLACE FUNCTION public.handle_session_login_alert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_function_url text :=
    'https://ymztxrpkhenbcbjjfbxr.supabase.co/functions/v1/send-email';
  v_service_role_key text;
  v_welcome_sent_at timestamptz;
  v_recent_match int;
BEGIN
  -- Look up whether this user has been welcomed yet. If not, this is
  -- their first sign-in (welcome territory) — skip the login alert so
  -- they only get one email at signup, not two.
  SELECT welcome_email_sent_at INTO v_welcome_sent_at
  FROM   public.profiles
  WHERE  id = NEW.user_id;

  IF v_welcome_sent_at IS NULL THEN
    RETURN NEW;
  END IF;

  -- Skip if a session with the same (user_agent, ip) already exists
  -- for this user within the last 30 days. Treat NULL-vs-NULL as a
  -- match so missing fingerprint data doesn't generate alerts on
  -- every sign-in.
  SELECT count(*) INTO v_recent_match
  FROM auth.sessions
  WHERE user_id = NEW.user_id
    AND id <> NEW.id
    AND created_at > now() - interval '30 days'
    AND (user_agent IS NOT DISTINCT FROM NEW.user_agent)
    AND (ip IS NOT DISTINCT FROM NEW.ip);

  IF v_recent_match > 0 THEN
    RETURN NEW;
  END IF;

  -- Pull the service-role key from vault (same pattern as 00042 /
  -- cron-fired functions).
  SELECT decrypted_secret INTO v_service_role_key
    FROM vault.decrypted_secrets
    WHERE name = 'service_role_key' LIMIT 1;

  IF v_service_role_key IS NULL THEN
    RAISE WARNING 'service_role_key not in vault — login alert skipped for %', NEW.user_id;
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url     := v_function_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_service_role_key
    ),
    body    := jsonb_build_object(
      'template',     'login_alert',
      'recipient_id', NEW.user_id::text,
      'login_time',   NEW.created_at::text,
      'user_agent',   COALESCE(NEW.user_agent, ''),
      'ip',           COALESCE(NEW.ip::text, '')
    )
  );

  RETURN NEW;
END;
$$;
