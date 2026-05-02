-- Migration 00019: User-initiated deactivation with 30-day retention
--
-- Distinguishes user-deactivation from moderator-ban:
--   - User deactivation: profiles.is_active=false AND deactivated_at IS NOT NULL
--   - Moderator ban:     profiles.is_active=false AND ban_reason IS NOT NULL
--   - Pause:             profiles.is_paused=true (active stays true)
--
-- After 30 days, the cleanup-deactivated-accounts edge function (called by
-- pg_cron daily) hard-deletes the auth.users row, which cascades to profile.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz DEFAULT NULL;

CREATE INDEX IF NOT EXISTS profiles_deactivated_at_idx
  ON public.profiles (deactivated_at)
  WHERE deactivated_at IS NOT NULL;

COMMENT ON COLUMN public.profiles.deactivated_at IS
  'Timestamp when the user deactivated their account. NULL if active or banned (not user-initiated). Hard-deleted 30 days after this timestamp.';

-- ============================================================================
-- pg_cron: cleanup-deactivated-accounts daily at 03:15 UTC
-- ============================================================================
SELECT cron.unschedule('cleanup-deactivated-accounts')
FROM cron.job
WHERE jobname = 'cleanup-deactivated-accounts';

SELECT cron.schedule(
  'cleanup-deactivated-accounts',
  '15 3 * * *',
  $$
    SELECT net.http_post(
      url     := 'https://ymztxrpkhenbcbjjfbxr.supabase.co/functions/v1/cleanup-deactivated-accounts',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || public.get_service_role_key()
      ),
      body    := '{}'::jsonb
    );
  $$
);
