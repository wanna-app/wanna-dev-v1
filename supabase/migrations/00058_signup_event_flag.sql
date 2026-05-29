-- Add a one-time flag so the client can fire a Mixpanel `account_created`
-- event exactly once per account, regardless of signup method
-- (email / Google / Apple all create a profiles row via handle_new_user).
--
-- The client (useAuth.loadProfile) checks this flag on profile load:
-- if false, it tracks `account_created` and flips the flag to true.
-- Existing users are backfilled to true so they never fire a false
-- "account_created" on their next sign-in — only genuinely new accounts
-- (inserted after this migration, defaulting to false) will fire it.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS signup_event_sent boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.signup_event_sent IS
  'Set true by the client once it has fired the Mixpanel account_created '
  'event for this user. Guarantees exactly-once emission across app '
  'reloads and re-auth. New rows default false; existing rows backfilled '
  'to true by migration 00058 to avoid retroactive false positives.';

-- Backfill: every existing profile predates this event, so mark them as
-- already-tracked. Only accounts created after this migration will fire
-- account_created.
UPDATE public.profiles
SET    signup_event_sent = true
WHERE  signup_event_sent = false;
