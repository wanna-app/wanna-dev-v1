-- Migration 00016: Add ban columns to profiles
-- banned_until: when a temp ban expires (null = no active timed ban OR permanent ban)
-- ban_reason:   human-readable reason shown to the banned user in-app
--
-- These are set by the moderate-user edge function and cleared by auto-unban.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS banned_until  timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ban_reason    text        DEFAULT NULL;

-- Index so auto-unban cron can efficiently find expired bans
CREATE INDEX IF NOT EXISTS profiles_banned_until_idx
  ON public.profiles (banned_until)
  WHERE banned_until IS NOT NULL;

COMMENT ON COLUMN public.profiles.banned_until IS
  'Timestamp when a temporary ban expires. NULL means either no ban or a permanent ban (check is_active).';
COMMENT ON COLUMN public.profiles.ban_reason IS
  'Short explanation shown to the user when they open the app while suspended.';
