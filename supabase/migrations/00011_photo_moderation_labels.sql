-- Extend photo_moderation to record the actual Vision LABEL_DETECTION
-- descriptions that triggered a flag (e.g., "Handgun", "Cannabis").
-- The flagged_categories array now also includes label-based categories
-- (nudity / hate_speech / hate_symbol / drug / weapon) alongside the
-- SafeSearch ones (adult / violence / racy / spoof).

ALTER TABLE photo_moderation
  ADD COLUMN IF NOT EXISTS flagged_labels text[];

-- Update get_pending_photo_flags to surface the labels too. Drop first
-- because the return-type signature changed.
DROP FUNCTION IF EXISTS get_pending_photo_flags(integer);

CREATE OR REPLACE FUNCTION get_pending_photo_flags(p_limit integer DEFAULT 50)
RETURNS TABLE (
  moderation_id uuid,
  user_id uuid,
  user_first_name text,
  photo_path text,
  bucket text,
  flagged_categories text[],
  flagged_labels text[],
  adult_likelihood text,
  violence_likelihood text,
  racy_likelihood text,
  spoof_likelihood text,
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
    pm.flagged_categories, pm.flagged_labels,
    pm.adult_likelihood, pm.violence_likelihood,
    pm.racy_likelihood, pm.spoof_likelihood, pm.created_at
  FROM photo_moderation pm
  JOIN profiles p ON p.id = pm.user_id
  WHERE pm.result = 'flagged'
  ORDER BY pm.created_at ASC
  LIMIT p_limit;
END;
$$;
