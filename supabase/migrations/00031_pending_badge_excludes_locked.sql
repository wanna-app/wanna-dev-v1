-- Migration 00031: Exclude locked-queue activities from the Who's In tab
-- badge. When an activity has an active match, its queue is locked — the
-- poster can't review pending rows until they unmatch — so those rows
-- shouldn't drive the badge.
--
-- Idempotent: CREATE OR REPLACE FUNCTION.

CREATE OR REPLACE FUNCTION get_total_pending_interest(p_user_id uuid)
RETURNS integer AS $$
DECLARE
  total integer;
BEGIN
  SELECT COUNT(*)::integer INTO total
  FROM interest_queue iq
  JOIN activities a ON a.id = iq.activity_id
  WHERE a.user_id = p_user_id
    AND a.status = 'active'
    AND iq.status = 'pending'
    AND NOT EXISTS (
      SELECT 1 FROM matches m
      WHERE m.activity_id = a.id AND m.status = 'active'
    );
  RETURN COALESCE(total, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
