-- 00038_new_activities_cron.sql
--
-- Weekly "new activities in your area" digest push (T4).
--
-- For each user with notify_new_activities_push = true who has location set:
--   * Count active activities posted in the last 7 days within their
--     max_distance_miles radius (haversine).
--   * Fire only if it's Friday locally AND currently 3:00–3:59 PM local
--     (fallback: America/Los_Angeles when profiles.timezone IS NULL).
--   * Dedupe: skip if a 'new_activities' log row exists for this recipient
--     today (context_id = local YYYY-MM-DD).
--   * POST to send-push with { type, recipient_id, count }.
--
-- Scheduled hourly at minute 10 — the function itself filters per-user.
--
-- Idempotent.

CREATE OR REPLACE FUNCTION dispatch_new_activities_pushes()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, vault
AS $$
DECLARE
  _key text;
  _row record;
  _local_dt timestamp;
  _local_time time;
  _local_dow integer;
  _local_date_str text;
  _count integer;
  _sent integer := 0;
  _dprefs record;
BEGIN
  _key := public.get_service_role_key();
  IF _key IS NULL OR _key = '' THEN
    RAISE WARNING 'dispatch_new_activities_pushes: service_role_key not found';
    RETURN 0;
  END IF;

  FOR _row IN
    SELECT
      p.id                                        AS recipient_id,
      p.location_lat,
      p.location_lng,
      COALESCE(p.timezone, 'America/Los_Angeles') AS recipient_tz
    FROM profiles p
    WHERE p.is_active = true
      AND p.is_seed = false
      AND p.notify_new_activities_push = true
      AND p.location_lat IS NOT NULL
      AND p.location_lng IS NOT NULL
  LOOP
    -- Local time gate
    BEGIN
      _local_dt := (now() AT TIME ZONE _row.recipient_tz);
    EXCEPTION WHEN OTHERS THEN
      _local_dt := (now() AT TIME ZONE 'America/Los_Angeles');
    END;
    _local_time := _local_dt::time;
    _local_dow  := EXTRACT(DOW FROM _local_dt)::integer; -- 0=Sun..5=Fri..6=Sat
    _local_date_str := to_char(_local_dt::date, 'YYYY-MM-DD');

    -- Friday only, 3pm hour only
    IF _local_dow <> 5 THEN CONTINUE; END IF;
    IF _local_time < TIME '15:00:00' OR _local_time >= TIME '16:00:00' THEN
      CONTINUE;
    END IF;

    -- Already sent today?
    IF EXISTS (
      SELECT 1 FROM notification_log nl
      WHERE nl.recipient_id = _row.recipient_id
        AND nl.notification_type = 'new_activities'
        AND nl.context_id = _local_date_str
    ) THEN CONTINUE; END IF;

    -- User's max distance
    SELECT max_distance_miles INTO _dprefs
    FROM discovery_preferences
    WHERE user_id = _row.recipient_id;

    IF _dprefs IS NULL THEN CONTINUE; END IF;

    -- Count active activities posted in last 7 days within radius
    SELECT COUNT(*) INTO _count
    FROM activities a
    WHERE a.status = 'active'
      AND a.user_id <> _row.recipient_id
      AND a.created_at >= now() - INTERVAL '7 days'
      AND a.location_lat IS NOT NULL
      AND a.location_lng IS NOT NULL
      AND haversine_miles(
        _row.location_lat, _row.location_lng,
        a.location_lat, a.location_lng
      ) <= _dprefs.max_distance_miles;

    IF _count < 1 THEN CONTINUE; END IF;

    PERFORM net.http_post(
      url := 'https://ymztxrpkhenbcbjjfbxr.supabase.co/functions/v1/send-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || _key
      ),
      body := jsonb_build_object(
        'type', 'new_activities',
        'recipient_id', _row.recipient_id,
        'count', _count
      )
    );

    INSERT INTO notification_log (
      recipient_id, notification_type, context_id, status, reason
    ) VALUES (
      _row.recipient_id, 'new_activities', _local_date_str, 'sent', 'cron_dispatched'
    );

    _sent := _sent + 1;
  END LOOP;

  RETURN _sent;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'dispatch_new_activities_pushes error: %', SQLERRM;
  RETURN _sent;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('new-activities-hourly')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'new-activities-hourly');

    PERFORM cron.schedule(
      'new-activities-hourly',
      '10 * * * *',
      $cron$ SELECT public.dispatch_new_activities_pushes(); $cron$
    );

    RAISE NOTICE 'new-activities-hourly scheduled';
  ELSE
    RAISE NOTICE 'pg_cron not enabled — skipping schedule';
  END IF;
END $$;
