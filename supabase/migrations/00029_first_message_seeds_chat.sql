-- Migration 00029: When accepting interest, seed the new chat thread with
-- the swiper's optional first_message (if they attached one in the
-- interest_queue row).
--
-- Wraps the original accept_interest body from 00003. Idempotent: uses
-- CREATE OR REPLACE FUNCTION.

CREATE OR REPLACE FUNCTION accept_interest(
  p_queue_id uuid
)
RETURNS uuid AS $$
DECLARE
  v_activity_id uuid;
  v_interested_id uuid;
  v_owner_id uuid;
  v_existing_match uuid;
  v_new_match_id uuid;
  v_first_message text;
BEGIN
  SELECT iq.activity_id, iq.interested_user_id, iq.first_message
    INTO v_activity_id, v_interested_id, v_first_message
    FROM interest_queue iq
    WHERE iq.id = p_queue_id AND iq.status = 'pending';

  IF v_activity_id IS NULL THEN
    RAISE EXCEPTION 'Queue entry not found or already reviewed';
  END IF;

  SELECT user_id INTO v_owner_id FROM activities WHERE id = v_activity_id;
  IF v_owner_id != auth.uid() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Lock check
  SELECT id INTO v_existing_match
    FROM matches
    WHERE activity_id = v_activity_id AND status = 'active';
  IF v_existing_match IS NOT NULL THEN
    RAISE EXCEPTION 'Activity already has an active match';
  END IF;

  -- Create match
  INSERT INTO matches (activity_id, poster_id, interested_id, status)
  VALUES (v_activity_id, v_owner_id, v_interested_id, 'active')
  RETURNING id INTO v_new_match_id;

  -- Mark queue entry accepted
  UPDATE interest_queue
    SET status = 'accepted', reviewed_at = now()
    WHERE id = p_queue_id;

  -- Seed the chat with the swiper's first_message, if any. Sender is the
  -- swiper (interested user). Skips when null/empty/whitespace.
  IF v_first_message IS NOT NULL
     AND length(btrim(v_first_message)) > 0 THEN
    INSERT INTO messages (match_id, sender_id, body, created_at)
    VALUES (v_new_match_id, v_interested_id, v_first_message, now());
  END IF;

  RETURN v_new_match_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
