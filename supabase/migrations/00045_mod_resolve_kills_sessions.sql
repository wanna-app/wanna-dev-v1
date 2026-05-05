-- When a moderator bans a user from the in-app Mod tab, we want the
-- effect to be immediate across all devices the user has open — not
-- just on next launch. Without this, an active session keeps working
-- until its access token naturally expires (~1h) and refresh tokens
-- keep silently renewing for 30 days. So:
--
--   * For BOTH temp and permanent bans: delete every row in
--     auth.sessions for the user. Their next API call (or app open)
--     fails auth and the app falls into the BannedScreen / sign-in
--     flow.
--
--   * For PERMANENT bans only: set auth.users.banned_until to a
--     far-future date. Supabase Auth rejects sign-in entirely while
--     this is set in the future, which closes the loop on attempts
--     to sign back in with the same credentials. (The
--     `banned_emails` blocklist already handles fresh signups; this
--     handles existing-credential re-signin.)
--
-- Temp-ban duration tracking on `profiles.banned_until` and the
-- auto-unban cron are unchanged — auto-unban already flips
-- profiles.is_active back to true on expiry. We don't touch
-- auth.users.banned_until for temp bans because the in-app flow
-- doesn't yet compute and persist a concrete expiry timestamp on
-- profiles.banned_until (separate gap, see DEFERRED). Killing the
-- session is enough for now: a re-signin lands the user in the
-- BannedScreen until is_active flips back.

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
DECLARE
  v_target_user_id uuid;
BEGIN
  IF NOT is_current_user_moderator() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_resolution NOT IN (
    'no_action', 'warning', 'content_removed', 'temp_ban', 'permanent_ban'
  ) THEN
    RAISE EXCEPTION 'invalid resolution: %', p_resolution;
  END IF;

  -- Load once so we can reuse for the auth-side updates below.
  SELECT reported_user_id
    INTO v_target_user_id
    FROM reports
   WHERE id = p_report_id;

  UPDATE reports
     SET status                = 'resolved',
         resolution            = p_resolution,
         moderator_notes       = p_notes,
         resolved_at           = now(),
         removed_content_type  = CASE
                                   WHEN p_resolution = 'content_removed'
                                   THEN p_removed_content_type
                                   ELSE removed_content_type
                                 END,
         ban_duration          = CASE
                                   WHEN p_resolution = 'temp_ban'
                                   THEN p_ban_duration
                                   ELSE ban_duration
                                 END,
         ban_reason            = CASE
                                   WHEN p_resolution IN ('temp_ban', 'permanent_ban')
                                   THEN COALESCE(p_ban_reason, ban_reason)
                                   ELSE ban_reason
                                 END
   WHERE id = p_report_id;

  -- For temp/perm ban resolutions: deactivate the profile + revoke
  -- existing sessions; for permanent bans, also lock auth.users so
  -- they can't sign back in.
  IF p_resolution IN ('temp_ban', 'permanent_ban') THEN
    UPDATE profiles
       SET is_active = false
     WHERE id = v_target_user_id;

    -- Force sign-out across every device. The user's next request
    -- is treated as unauthenticated.
    DELETE FROM auth.sessions
     WHERE user_id = v_target_user_id;

    IF p_resolution = 'permanent_ban' THEN
      -- Far-future date — Supabase Auth rejects sign-in attempts
      -- while banned_until is in the future. Equivalent to the
      -- "Ban user" action in the Supabase Dashboard.
      UPDATE auth.users
         SET banned_until = '9999-12-31 23:59:59+00'::timestamptz
       WHERE id = v_target_user_id;
    END IF;
  END IF;
END;
$$;
