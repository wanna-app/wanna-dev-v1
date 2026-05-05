-- Extend mod_resolve_report to accept the moderator-overridable fields
-- introduced in migration 00043. The RPC continues to set
-- status/resolution/resolved_at and deactivate the user for bans, but
-- now also persists `removed_content_type`, `ban_duration`,
-- `ban_reason` on the report row. All three new params are optional —
-- callers that don't pass them get the existing behavior (and the new
-- columns stay null on those rows).
--
-- Note: this RPC still does NOT send the user-facing moderation email.
-- The email pipeline lives in the `moderate-user` edge function, which
-- is service-role only. Wiring the mobile mod UI into that flow is a
-- separate task (see DEFERRED.md). For now the new columns are
-- captured here so the moderator can still input them in the app, and
-- when we wire the email flow the values are already on the row.

CREATE OR REPLACE FUNCTION mod_resolve_report(
  p_report_id uuid,
  p_resolution text,
  p_notes text DEFAULT NULL,
  p_removed_content_type text DEFAULT NULL,
  p_ban_duration text DEFAULT NULL,
  p_ban_reason text DEFAULT NULL
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
     SET status                = 'resolved',
         resolution            = p_resolution,
         moderator_notes       = p_notes,
         resolved_at           = now(),
         -- Only meaningful for content_removed; ignored otherwise.
         removed_content_type  = CASE
                                   WHEN p_resolution = 'content_removed'
                                   THEN p_removed_content_type
                                   ELSE removed_content_type
                                 END,
         -- Only meaningful for temp_ban; ignored otherwise.
         ban_duration          = CASE
                                   WHEN p_resolution = 'temp_ban'
                                   THEN p_ban_duration
                                   ELSE ban_duration
                                 END,
         -- Applies to any ban (temp + permanent). Falls back to existing
         -- value if caller didn't pass one.
         ban_reason            = CASE
                                   WHEN p_resolution IN ('temp_ban', 'permanent_ban')
                                   THEN COALESCE(p_ban_reason, ban_reason)
                                   ELSE ban_reason
                                 END
   WHERE id = p_report_id;

  -- For temp/perm ban resolutions: deactivate the user's profile.
  IF p_resolution IN ('temp_ban', 'permanent_ban') THEN
    UPDATE profiles
       SET is_active = false
     WHERE id = (SELECT reported_user_id FROM reports WHERE id = p_report_id);
  END IF;
END;
$$;
