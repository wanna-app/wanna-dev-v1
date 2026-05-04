-- Welcome email trigger.
--
-- Fires once per user, on the transition of auth.users.email_confirmed_at
-- from NULL → non-NULL (i.e. the moment they confirm their email after
-- signup). Posts to the send-email edge function with template='welcome';
-- the function itself handles seed/inactive/opt-out skips and dedupes
-- via email_log.
--
-- Service role key comes from the Vault (same pattern as 00013/00017).
-- pg_net is already enabled by earlier migrations.

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
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_email_confirmed_send_welcome ON auth.users;
CREATE TRIGGER on_email_confirmed_send_welcome
AFTER UPDATE OF email_confirmed_at ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_email_confirmed_send_welcome();
