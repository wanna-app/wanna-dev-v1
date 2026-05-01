-- Migration 00017: Moderation webhooks + auto-unban cron
--
-- 1. Enables pg_net for outbound HTTP calls from triggers / cron
-- 2. Creates a TRIGGER that calls notify-new-report on reports INSERT
-- 3. Schedules auto-unban to run every hour via pg_cron
--
-- The service role key is read from Supabase Vault at runtime so it is
-- never stored in any committed file. Run this one-time setup before applying:
--
--   SELECT vault.create_secret('<key>', 'service_role_key', 'Service role key for edge function calls');
--
-- (Already applied to this project — see Vault in the Supabase dashboard.)

-- Enable pg_net so triggers + cron can make outbound HTTP calls
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Grant usage so the postgres role's trigger functions can call net.*
GRANT USAGE ON SCHEMA net TO postgres;

-- ============================================================================
-- Helper: resolve the service role key from Vault
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_service_role_key()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, vault
AS $$
  SELECT decrypted_secret
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key'
  LIMIT 1;
$$;

-- ============================================================================
-- 1. DB Webhook: reports INSERT → notify-new-report edge function
-- ============================================================================
CREATE OR REPLACE FUNCTION public.notify_new_report_webhook()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, vault
AS $$
DECLARE
  _key text;
BEGIN
  _key := public.get_service_role_key();
  IF _key IS NULL OR _key = '' THEN
    RAISE WARNING 'notify_new_report_webhook: service_role_key not found in vault';
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url     := 'https://ymztxrpkhenbcbjjfbxr.supabase.co/functions/v1/notify-new-report',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || _key
    ),
    body    := jsonb_build_object(
      'type',       'INSERT',
      'table',      'reports',
      'schema',     'public',
      'record',     row_to_json(NEW)::jsonb,
      'old_record', NULL
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Non-fatal: never let a notification failure block the INSERT
  RAISE WARNING 'notify_new_report_webhook error: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_report_inserted ON public.reports;

CREATE TRIGGER on_report_inserted
  AFTER INSERT ON public.reports
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_new_report_webhook();

-- ============================================================================
-- 2. pg_cron: auto-unban every hour (at the top of the hour)
-- ============================================================================
SELECT cron.unschedule('auto-unban-hourly')
FROM cron.job
WHERE jobname = 'auto-unban-hourly';

SELECT cron.schedule(
  'auto-unban-hourly',
  '0 * * * *',
  $$
    SELECT net.http_post(
      url     := 'https://ymztxrpkhenbcbjjfbxr.supabase.co/functions/v1/auto-unban',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || public.get_service_role_key()
      ),
      body    := '{}'::jsonb
    );
  $$
);
