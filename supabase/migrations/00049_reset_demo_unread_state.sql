-- Migration 00049: reset_demo_unread_state()
--
-- Called on every demo-account sign-in so the demo always starts with a
-- few unread messages visible — both as a tab badge and as per-row
-- pills in the matches list. Without this, once the demo user has
-- opened the chats their read_at gets set and subsequent demo sessions
-- show zero unreads, which weakens the demo.
--
-- Strategy: for the 3 most-recent matches the demo user is part of,
-- pick the latest message sent BY THE OTHER PARTY (i.e., not the demo
-- user) and clear its read_at. That gives one unread per match × 3
-- matches, which renders as bold rows + count pills + a "3" tab badge.
--
-- Only the demo user can call this — caller must be the user whose
-- email matches DEMO_EMAIL. Anyone else gets a no-op (no exception, so
-- we don't leak the demo email's existence).

CREATE OR REPLACE FUNCTION public.reset_demo_unread_state()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_demo_user_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  -- Resolve the demo user id from auth.users by email. Hard-coded
  -- email matches the constant in WelcomeScreen.tsx.
  SELECT id INTO v_demo_user_id
  FROM auth.users
  WHERE email = 'demo@joinwannaapp.com';

  -- Only proceed if the caller IS the demo user. Silently no-op
  -- otherwise — non-demo callers shouldn't be able to probe this.
  IF v_demo_user_id IS NULL OR v_demo_user_id <> auth.uid() THEN
    RETURN;
  END IF;

  -- For the 3 most-recent active matches the demo user is in, clear
  -- read_at on the latest message FROM the other party in each match.
  WITH demo_matches AS (
    SELECT m.id AS match_id,
           CASE WHEN m.user_a_id = v_demo_user_id THEN m.user_b_id
                ELSE m.user_a_id END AS other_user_id,
           m.last_message_at
    FROM public.matches m
    WHERE (m.user_a_id = v_demo_user_id OR m.user_b_id = v_demo_user_id)
      AND m.met_confirmed_at IS NULL
    ORDER BY m.last_message_at DESC NULLS LAST
    LIMIT 3
  ),
  latest_incoming AS (
    SELECT DISTINCT ON (msg.match_id) msg.id
    FROM public.messages msg
    JOIN demo_matches dm ON dm.match_id = msg.match_id
    WHERE msg.sender_id = dm.other_user_id
    ORDER BY msg.match_id, msg.created_at DESC
  )
  UPDATE public.messages
  SET read_at      = NULL,
      delivered_at = COALESCE(delivered_at, now()),
      status       = 'delivered'
  WHERE id IN (SELECT id FROM latest_incoming);
END;
$$;

REVOKE ALL ON FUNCTION public.reset_demo_unread_state() FROM public;
GRANT EXECUTE ON FUNCTION public.reset_demo_unread_state() TO authenticated;

COMMENT ON FUNCTION public.reset_demo_unread_state() IS
  'Called by the client on demo-account sign-in to repopulate unread message state across the demo''s 3 most-recent matches. No-op for non-demo callers.';
