-- Marketing-class email opt-in flag.
--
-- Separate from `notify_*_email` (transactional / notification class) and
-- from the legacy `email_notifications_enabled` (being phased out). This
-- flag gates ONLY marketing emails — welcome email, weekly digests,
-- product updates. Account / security emails (auth confirm, password
-- reset, ban notice) are NEVER gated by this flag.
--
-- The welcome email (sent on first email_confirmed_at) is a user's
-- de-facto marketing opt-in opportunity; the email's footer carries
-- "Manage email preferences" and "Unsubscribe" links that flip this
-- flag via the email-prefs edge function.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS marketing_emails_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.profiles.marketing_emails_enabled IS
  'Master switch for marketing-class emails (welcome, weekly digest, etc.). Notification-class emails are gated by the per-type notify_*_email columns instead. Account/security emails always send.';
