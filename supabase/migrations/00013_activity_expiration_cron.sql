-- Activity expiration jobs (PRD §3, AC-PA-06, AC-PA-07).
--
-- Two cron jobs, both run daily at midnight UTC:
--
-- 1. mark_past_date_activities()
--    Marks activities where activity_date < CURRENT_DATE as
--    status = 'past_date'. The poster will see them in their Profile
--    tab for 7 days for renewal.
--
-- 2. cleanup_past_date_activities()
--    Hard-deletes activities that have been past_date for 7+ days.
--    Cascade also cleans up swipes, interest_queue, matches, messages
--    via FK ON DELETE CASCADE (matches table FK is set up that way),
--    so we don't end up with orphans.

-- =============================================================================
-- Functions
-- =============================================================================

CREATE OR REPLACE FUNCTION mark_past_date_activities()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  WITH updated AS (
    UPDATE activities
       SET status = 'past_date'
     WHERE status = 'active'
       AND activity_date IS NOT NULL
       AND activity_date < CURRENT_DATE
    RETURNING id
  )
  SELECT count(*) INTO v_count FROM updated;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION cleanup_past_date_activities()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  -- 7-day grace period after going past_date: anything older gets removed.
  WITH deleted AS (
    DELETE FROM activities
     WHERE status = 'past_date'
       AND updated_at < now() - INTERVAL '7 days'
    RETURNING id
  )
  SELECT count(*) INTO v_count FROM deleted;
  RETURN v_count;
END;
$$;

-- =============================================================================
-- Schedule via pg_cron
-- =============================================================================
-- Supabase has pg_cron enabled by default in the `cron` schema. If the
-- extension hasn't been enabled on this project yet we error out (the
-- user can enable from the dashboard: Database → Extensions → pg_cron).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Drop any prior schedules with the same name (idempotent re-runs)
    PERFORM cron.unschedule('mark-past-date-activities')
      WHERE EXISTS (
        SELECT 1 FROM cron.job WHERE jobname = 'mark-past-date-activities'
      );
    PERFORM cron.unschedule('cleanup-past-date-activities')
      WHERE EXISTS (
        SELECT 1 FROM cron.job WHERE jobname = 'cleanup-past-date-activities'
      );

    -- Daily at 00:05 UTC: mark past-date
    PERFORM cron.schedule(
      'mark-past-date-activities',
      '5 0 * * *',
      $cron$ SELECT public.mark_past_date_activities(); $cron$
    );

    -- Daily at 00:10 UTC: cleanup expired grace-period
    PERFORM cron.schedule(
      'cleanup-past-date-activities',
      '10 0 * * *',
      $cron$ SELECT public.cleanup_past_date_activities(); $cron$
    );

    RAISE NOTICE 'Activity expiration cron jobs scheduled';
  ELSE
    RAISE NOTICE
      'pg_cron extension not enabled on this project. Enable via '
      'Dashboard → Database → Extensions → pg_cron, then re-run this '
      'migration to register the schedules.';
  END IF;
END $$;
