-- 00037_meetup_cron.sql
--
-- Meetup check-in push pipeline (T3).
--
-- Adds `profiles.timezone` (IANA TZ name, nullable). The client writes the
-- device timezone on first login and on every cold start when it changes.
--
-- A new SECURITY DEFINER function `dispatch_meetup_pushes()` runs hourly
-- (minute 5) via pg_cron. For each (match, recipient) pair where:
--   * The match is active
--   * The activity is dated and `activity_date < CURRENT_DATE`
--   * A meetup_checks row exists with did_meet IS NULL
--   * No prior 'meetup' notification_log row exists for that recipient+match
--   * It's currently 9:00–9:59 AM in the recipient's local timezone
--     (fallback: America/Los_Angeles when timezone IS NULL)
-- it POSTs to send-push and logs a row to notification_log to dedupe.
--
-- Idempotent: ALTER TABLE ... ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE
-- functions, cron unschedule-then-schedule.

-- =============================================================================
-- 1. profiles.timezone
-- =============================================================================
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS timezone text NULL;

-- =============================================================================
-- 1b. Relax notification_log.context_id from uuid → text so cron jobs can
-- store synthetic contexts (e.g. an ISO date for the new-activities digest).
-- UUIDs cast to text losslessly so existing rows are preserved.
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'notification_log'
      AND column_name = 'context_id'
      AND data_type = 'uuid'
  ) THEN
    ALTER TABLE notification_log
      ALTER COLUMN context_id TYPE text USING context_id::text;
  END IF;
END $$;

-- =============================================================================
-- 2. dispatch_meetup_pushes()
-- =============================================================================
CREATE OR REPLACE FUNCTION dispatch_meetup_pushes()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, vault
AS $$
DECLARE
  _key text;
  _row record;
  _other_first_name text;
  _local_time time;
  _tz text;
  _sent integer := 0;
BEGIN
  _key := public.get_service_role_key();
  IF _key IS NULL OR _key = '' THEN
    RAISE WARNING 'dispatch_meetup_pushes: service_role_key not found in vault';
    RETURN 0;
  END IF;

  FOR _row IN
    SELECT
      mc.match_id,
      mc.user_id        AS recipient_id,
      m.activity_id,
      a.title           AS activity_title,
      CASE
        WHEN m.poster_id = mc.user_id THEN m.interested_id
        ELSE m.poster_id
      END               AS other_user_id,
      COALESCE(p.timezone, 'America/Los_Angeles') AS recipient_tz
    FROM meetup_checks mc
    JOIN matches m       ON m.id = mc.match_id
    JOIN activities a    ON a.id = m.activity_id
    JOIN profiles p      ON p.id = mc.user_id
    WHERE mc.did_meet IS NULL
      AND m.status = 'active'
      AND a.activity_date IS NOT NULL
      AND a.activity_date < CURRENT_DATE
      AND NOT EXISTS (
        SELECT 1 FROM notification_log nl
        WHERE nl.recipient_id = mc.user_id
          AND nl.notification_type = 'meetup'
          AND nl.context_id = mc.match_id::text
      )
  LOOP
    -- Local-time gate: only fire if it's currently 9am hour in recipient TZ
    BEGIN
      _local_time := (now() AT TIME ZONE _row.recipient_tz)::time;
    EXCEPTION WHEN OTHERS THEN
      -- Bad TZ string → fall back to Pacific
      _local_time := (now() AT TIME ZONE 'America/Los_Angeles')::time;
    END;

    IF _local_time < TIME '09:00:00' OR _local_time >= TIME '10:00:00' THEN
      CONTINUE;
    END IF;

    -- Fetch other user's first name
    SELECT first_name INTO _other_first_name
    FROM profiles
    WHERE id = _row.other_user_id;

    -- Fire the push via send-push edge function
    PERFORM net.http_post(
      url := 'https://ymztxrpkhenbcbjjfbxr.supabase.co/functions/v1/send-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || _key
      ),
      body := jsonb_build_object(
        'type', 'meetup',
        'match_id', _row.match_id,
        'recipient_id', _row.recipient_id,
        'other_user_first_name', COALESCE(_other_first_name, 'them'),
        'other_user_id', _row.other_user_id,
        'activity_title', _row.activity_title,
        'activity_id', _row.activity_id
      )
    );

    -- Log so we don't double-fire on the next hourly tick
    INSERT INTO notification_log (
      recipient_id, notification_type, context_id, status, reason
    ) VALUES (
      _row.recipient_id, 'meetup', _row.match_id::text, 'sent', 'cron_dispatched'
    );

    _sent := _sent + 1;
  END LOOP;

  RETURN _sent;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'dispatch_meetup_pushes error: %', SQLERRM;
  RETURN _sent;
END;
$$;

-- =============================================================================
-- 3. Schedule pg_cron job (every hour at minute 5)
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('meetup-pushes-hourly')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'meetup-pushes-hourly');

    PERFORM cron.schedule(
      'meetup-pushes-hourly',
      '5 * * * *',
      $cron$ SELECT public.dispatch_meetup_pushes(); $cron$
    );

    RAISE NOTICE 'meetup-pushes-hourly scheduled';
  ELSE
    RAISE NOTICE 'pg_cron not enabled — skipping schedule';
  END IF;
END $$;
