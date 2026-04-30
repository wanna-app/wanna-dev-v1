-- Moderator role + RPCs powering the in-app moderation dashboard.
-- Until we have a true admin web app, gating an admin tab on the
-- profiles.is_moderator flag is enough to triage reports, photo
-- flags, and verification queue (PRD §8.5).

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_moderator boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_is_moderator
  ON profiles(is_moderator) WHERE is_moderator = true;

-- Helper used in RLS policies to centralize the "is the caller a mod?"
-- check. SECURITY DEFINER bypasses the very RLS rules it informs.
CREATE OR REPLACE FUNCTION is_current_user_moderator()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_moderator FROM profiles WHERE id = auth.uid()),
    false
  );
$$;

-- =============================================================================
-- Reports queue
-- =============================================================================
CREATE OR REPLACE FUNCTION mod_get_pending_reports(p_limit integer DEFAULT 50)
RETURNS TABLE (
  report_id uuid,
  reason text,
  description text,
  created_at timestamptz,
  reporter_id uuid,
  reporter_name text,
  reported_user_id uuid,
  reported_user_name text,
  reported_user_photo text,
  reported_user_is_verified boolean,
  reported_content_type text,
  reported_content_id uuid,
  total_reports_against_user integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_current_user_moderator() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    r.id, r.reason, r.description, r.created_at,
    r.reporter_id, reporter.first_name,
    r.reported_user_id, reported.first_name, reported.photos[1], reported.is_verified,
    r.reported_content_type, r.reported_content_id,
    (SELECT COUNT(*)::integer FROM reports r2
       WHERE r2.reported_user_id = r.reported_user_id)
  FROM reports r
  JOIN profiles reporter ON reporter.id = r.reporter_id
  JOIN profiles reported ON reported.id = r.reported_user_id
  WHERE r.status IN ('pending', 'reviewing')
  ORDER BY
    -- Underage reports float to the top per AC-SR-06
    CASE WHEN r.reason = 'Underage user' THEN 0 ELSE 1 END,
    r.created_at ASC
  LIMIT p_limit;
END;
$$;

CREATE OR REPLACE FUNCTION mod_resolve_report(
  p_report_id uuid,
  p_resolution text,
  p_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_current_user_moderator() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_resolution NOT IN (
    'no_action', 'warning', 'content_removed', 'temp_ban', 'permanent_ban'
  ) THEN
    RAISE EXCEPTION 'invalid resolution: %', p_resolution;
  END IF;

  UPDATE reports
     SET status = 'resolved',
         resolution = p_resolution,
         moderator_notes = p_notes,
         resolved_at = now()
   WHERE id = p_report_id;

  -- For temp/perm ban resolutions: deactivate the user's profile.
  -- (Real ban duration tracking is post-MVP — see DEFERRED.md.)
  IF p_resolution IN ('temp_ban', 'permanent_ban') THEN
    UPDATE profiles
       SET is_active = false
     WHERE id = (SELECT reported_user_id FROM reports WHERE id = p_report_id);
  END IF;
END;
$$;

-- =============================================================================
-- Photo moderation queue
-- =============================================================================
-- We already have get_pending_photo_flags() from migration 00010/00011 but
-- it doesn't gate on moderator role. Recreate as a moderator-gated mod_*.
CREATE OR REPLACE FUNCTION mod_get_pending_photo_flags(p_limit integer DEFAULT 50)
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
  IF NOT is_current_user_moderator() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT pm.id, pm.user_id, p.first_name, pm.photo_path, pm.bucket,
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

CREATE OR REPLACE FUNCTION mod_resolve_photo_flag(
  p_moderation_id uuid,
  p_decision text,         -- 'allowed_by_mod' | 'rejected'
  p_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_path text;
BEGIN
  IF NOT is_current_user_moderator() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_decision NOT IN ('allowed_by_mod', 'rejected') THEN
    RAISE EXCEPTION 'invalid decision: %', p_decision;
  END IF;

  SELECT user_id, photo_path INTO v_user_id, v_path
    FROM photo_moderation WHERE id = p_moderation_id;

  UPDATE photo_moderation
     SET result = p_decision,
         moderator_notes = p_notes,
         reviewed_by = auth.uid(),
         reviewed_at = now()
   WHERE id = p_moderation_id;

  -- 'allowed_by_mod' restores the photo into the user's profile array
  -- if it isn't there already (the moderate-photo function would have
  -- removed it).
  IF p_decision = 'allowed_by_mod' AND v_user_id IS NOT NULL THEN
    UPDATE profiles
       SET photos = ARRAY(
         SELECT DISTINCT unnest(photos || ARRAY[v_path]::text[])
       )
     WHERE id = v_user_id
       AND NOT (v_path = ANY(photos));
  END IF;
END;
$$;

-- =============================================================================
-- Verification queue
-- =============================================================================
CREATE OR REPLACE FUNCTION mod_get_pending_verifications(p_limit integer DEFAULT 50)
RETURNS TABLE (
  user_id uuid,
  first_name text,
  photos text[],
  verification_photo_url text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_current_user_moderator() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT p.id, p.first_name, p.photos, p.verification_photo_url, p.created_at
    FROM profiles p
   WHERE p.verification_photo_url IS NOT NULL
     AND p.is_verified = false
     AND p.is_active = true
     AND p.is_seed = false
   ORDER BY p.created_at ASC
   LIMIT p_limit;
END;
$$;

CREATE OR REPLACE FUNCTION mod_resolve_verification(
  p_user_id uuid,
  p_approve boolean,
  p_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_current_user_moderator() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_approve THEN
    UPDATE profiles
       SET is_verified = true
     WHERE id = p_user_id;
  ELSE
    -- Reject: clear the verification photo URL so the user is prompted
    -- to retake. We don't delete the actual file from Storage here —
    -- that's a separate cleanup task.
    UPDATE profiles
       SET verification_photo_url = NULL
     WHERE id = p_user_id;
  END IF;
END;
$$;

-- =============================================================================
-- Counts (for the admin tab badge)
-- =============================================================================
CREATE OR REPLACE FUNCTION mod_pending_counts()
RETURNS TABLE (reports integer, photo_flags integer, verifications integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_current_user_moderator() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT
    (SELECT COUNT(*)::integer FROM reports WHERE status IN ('pending', 'reviewing')),
    (SELECT COUNT(*)::integer FROM photo_moderation WHERE result = 'flagged'),
    (SELECT COUNT(*)::integer FROM profiles
       WHERE verification_photo_url IS NOT NULL
         AND is_verified = false
         AND is_active = true
         AND is_seed = false);
END;
$$;

-- =============================================================================
-- Storage policies for moderators
-- =============================================================================
-- Verification selfies bucket: write-only for users (existing migration
-- 00002), but moderators need to read them to review verifications.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'objects'
       AND schemaname = 'storage'
       AND policyname = 'Moderators can read verification selfies'
  ) THEN
    CREATE POLICY "Moderators can read verification selfies"
      ON storage.objects FOR SELECT TO authenticated
      USING (
        bucket_id = 'verification-selfies'
        AND public.is_current_user_moderator()
      );
  END IF;
END $$;
