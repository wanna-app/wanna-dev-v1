-- Migration 00055: onboarding-incomplete reminder cron
--
-- Fires once per user, 24-48h after signup, IF they still have an
-- empty `photos` array (i.e. never finished onboarding). The
-- send-email function already dedupes via email_log so re-runs are
-- safe — exactly-once per recipient.
--
-- Runs hourly at :20 so the actual send time roughly matches the
-- user's signup-time-of-day (good for engagement) without firing in
-- the middle of the night for most timezones.
--
-- Skips:
--   - is_seed = true        (seed/demo accounts)
--   - is_active = false     (already deactivated/banned)
--   - photos != '{}'        (finished onboarding)
--   - created_at < 24h ago  (too early — give them a chance to finish)
--   - created_at > 48h ago  (too late — past the activation window)
--   - email already sent    (handled by send-email's dedupe)

SELECT cron.unschedule('onboarding-incomplete-hourly')
FROM cron.job
WHERE jobname = 'onboarding-incomplete-hourly';

SELECT cron.schedule(
  'onboarding-incomplete-hourly',
  '20 * * * *',  -- every hour at :20
  $$
    SELECT net.http_post(
      url     := 'https://ymztxrpkhenbcbjjfbxr.supabase.co/functions/v1/send-email',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || public.get_service_role_key()
      ),
      body    := jsonb_build_object(
        'template',     'onboarding_incomplete',
        'recipient_id', p.id::text
      )
    )
    FROM public.profiles p
    WHERE p.is_seed = false
      AND p.is_active = true
      AND p.photos = ARRAY[]::text[]
      AND p.created_at > now() - interval '48 hours'
      AND p.created_at <= now() - interval '24 hours'
      AND NOT EXISTS (
        SELECT 1 FROM public.email_log el
        WHERE el.recipient_id = p.id
          AND el.template = 'onboarding_incomplete'
          AND el.status = 'sent'
      );
  $$
);
