-- Photo moderation: every uploaded profile photo gets scanned by
-- Google Cloud Vision SafeSearch. Results live in this table for audit.
-- Flagged photos (LIKELY+ on adult/violence/racy) are removed from the
-- user's profile.photos array immediately by the edge function and
-- queued for human review (PRD §7.4, AC-PR-04).

CREATE TABLE photo_moderation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  photo_path text NOT NULL,
  bucket text NOT NULL DEFAULT 'profile-photos',
  result text NOT NULL CHECK (result IN (
    'allowed',
    'flagged',          -- auto-flagged, awaiting human review
    'rejected',         -- moderator rejected
    'allowed_by_mod',   -- moderator overrode auto-flag
    'error'             -- API call failed; treat as allowed for now
  )),
  adult_likelihood text,     -- VERY_UNLIKELY .. VERY_LIKELY (or null on error)
  violence_likelihood text,
  racy_likelihood text,
  spoof_likelihood text,
  medical_likelihood text,
  flagged_categories text[], -- subset of {adult, violence, racy}
  moderator_notes text,
  reviewed_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);

CREATE INDEX idx_photo_moderation_user ON photo_moderation(user_id);
CREATE INDEX idx_photo_moderation_result ON photo_moderation(result);
CREATE INDEX idx_photo_moderation_path ON photo_moderation(photo_path);

ALTER TABLE photo_moderation ENABLE ROW LEVEL SECURITY;

-- Users can see the verdict on their own photos so the app can show
-- "your photo is being reviewed" if needed.
CREATE POLICY "Users can view own moderation records"
  ON photo_moderation FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
-- Inserts and updates are done by the edge function with the user's JWT
-- (which RLS recognises as the row owner via user_id = auth.uid()).
CREATE POLICY "Users can insert own moderation records"
  ON photo_moderation FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own moderation records"
  ON photo_moderation FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

-- =============================================================================
-- get_pending_photo_flags  — drives a future moderation dashboard.
-- =============================================================================
CREATE OR REPLACE FUNCTION get_pending_photo_flags(p_limit integer DEFAULT 50)
RETURNS TABLE (
  moderation_id uuid,
  user_id uuid,
  user_first_name text,
  photo_path text,
  bucket text,
  flagged_categories text[],
  adult_likelihood text,
  violence_likelihood text,
  racy_likelihood text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    pm.id, pm.user_id, p.first_name, pm.photo_path, pm.bucket,
    pm.flagged_categories, pm.adult_likelihood, pm.violence_likelihood,
    pm.racy_likelihood, pm.created_at
  FROM photo_moderation pm
  JOIN profiles p ON p.id = pm.user_id
  WHERE pm.result = 'flagged'
  ORDER BY pm.created_at ASC
  LIMIT p_limit;
END;
$$;
