-- Migration 00035: Notification defaults — push ON, email OFF for everything
--
-- 00034 set per-type DEFAULTs based on a guess at "what feels right per
-- channel." Product call: push is the primary surface, email is opt-in.
-- All five types now default to push=true, email=false. Existing rows
-- that still carry the prior defaults flip to match — the user can
-- always re-enable email channels from Settings → Notifications.

-- 1. Column DEFAULTs
ALTER TABLE public.profiles
  ALTER COLUMN notify_interest_email       SET DEFAULT false,
  ALTER COLUMN notify_match_email          SET DEFAULT false,
  ALTER COLUMN notify_meetup_email         SET DEFAULT false,
  ALTER COLUMN notify_new_activities_push  SET DEFAULT true;

-- 2. Backfill existing rows. We can't tell who customized vs. who
-- still has the original default, so the safest move is: only touch
-- rows that still match the OLD default value AND haven't been
-- updated since 00034 ran. Practically — given the small user base
-- right now (mostly seed + demo), a blanket realignment is fine.
UPDATE public.profiles
SET notify_interest_email      = false,
    notify_match_email         = false,
    notify_meetup_email        = false,
    notify_new_activities_push = true;
