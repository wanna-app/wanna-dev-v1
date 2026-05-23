-- Migration 00056: login alert email trigger
--
-- Fires a security-class email to the user whenever a new session is
-- created in auth.sessions AND the (user_agent, ip) fingerprint hasn't
-- been seen for that user in the last 30 days.
--
-- Skip rules implemented in the trigger:
--   - First session ever for the user (welcome email territory)
--   - Same (user_agent, ip) seen for this user within last 30 days
--   - vault service_role_key missing (warn + skip — should never happen)
--
-- Skip rules implemented in send-email itself:
--   - is_seed = true
--   - is_active = false
--   - No marketing / per-type pref gating — security alerts always send
--
-- The email includes:
--   - Login time (from session.created_at)
--   - Parsed device label (from user_agent)
--   - IP address (in "Location" line; future iteration can call ipapi
--     for city/country)
--   - "Reset Password" CTA backed by a Supabase admin recovery link

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
  v_session_count int;
  v_recent_match int;
BEGIN
  -- Skip first session ever — welcome email covers the introduction.
  SELECT count(*) INTO v_session_count
  FROM auth.sessions
  WHERE user_id = NEW.user_id;

  IF v_session_count <= 1 THEN
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
    AND (
      user_agent IS NOT DISTINCT FROM NEW.user_agent
    )
    AND (
      ip IS NOT DISTINCT FROM NEW.ip
    );

  IF v_recent_match > 0 THEN
    RETURN NEW;
  END IF;

  -- Pull the service-role key from vault (same pattern as
  -- 00042_welcome_email_trigger.sql / cron-fired functions).
  SELECT decrypted_secret INTO v_service_role_key
    FROM vault.decrypted_secrets
    WHERE name = 'service_role_key' LIMIT 1;

  IF v_service_role_key IS NULL THEN
    RAISE WARNING 'service_role_key not in vault — login alert skipped for %', NEW.user_id;
    RETURN NEW;
  END IF;

  -- Fire the send-email call via pg_net. Async; trigger returns
  -- immediately, send happens out-of-band.
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

DROP TRIGGER IF EXISTS on_session_created_login_alert ON auth.sessions;
CREATE TRIGGER on_session_created_login_alert
AFTER INSERT ON auth.sessions
FOR EACH ROW
EXECUTE FUNCTION public.handle_session_login_alert();
