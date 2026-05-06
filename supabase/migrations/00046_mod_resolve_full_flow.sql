-- Mod-resolve full flow: all data writes happen here in plpgsql, then
-- we fire pg_net at moderate-user in `email_only` mode just to render
-- + send the user-facing email. This way the in-app moderator flow
-- finally:
--
--   * Sets profiles.is_active = false for bans (existing)
--   * Sets profiles.banned_until from a parsed duration string for
--     temp bans (new — auto-unban can finally see them and expire)
--   * Sets profiles.ban_reason (new — was only set via the edge fn)
--   * Revokes auth.sessions for any ban (existing, from 00045)
--   * Locks auth.users.banned_until for permanent bans (existing)
--   * Adds the email to banned_emails for permanent bans (new — was
--     only done by the edge fn)
--   * Fires the user-facing email via moderate-user (new)
--
-- The duration parser uses Postgres's native `interval` cast which
-- accepts strings like "24 hours", "7 days", "14 days", "3 hours".
-- If the moderator's free-form input fails to parse, we log a
-- warning and leave banned_until null (effectively a permanent
-- deactivation until manually revisited) — better than guessing.
--
-- The pg_net call is fire-and-forget; net.http_post returns a
-- request id we don't await. If it fails, the resolution still
-- stuck and the moderator can manually re-fire the email later.

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
  v_target_user_id   uuid;
  v_target_email     text;
  v_banned_until     timestamptz;
  v_service_role_key text;
  v_function_url     text := 'https://ymztxrpkhenbcbjjfbxr.supabase.co/functions/v1/moderate-user';
  v_action           text;
  v_reason_for_email text;
BEGIN
  IF NOT is_current_user_moderator() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_resolution NOT IN (
    'no_action', 'warning', 'content_removed', 'temp_ban', 'permanent_ban'
  ) THEN
    RAISE EXCEPTION 'invalid resolution: %', p_resolution;
  END IF;

  -- Resolve target user + their auth email (used for banned_emails on
  -- permanent ban + email send via moderate-user).
  SELECT reported_user_id INTO v_target_user_id
    FROM reports WHERE id = p_report_id;
  IF v_target_user_id IS NULL THEN
    RAISE EXCEPTION 'report % not found', p_report_id;
  END IF;
  SELECT email INTO v_target_email
    FROM auth.users WHERE id = v_target_user_id;

  -- Parse ban_duration into a concrete timestamptz for temp bans. If
  -- the cast fails (malformed input), log and continue with null —
  -- the row still gets marked as a temp ban, but auto-unban won't
  -- expire it until the moderator fixes banned_until manually.
  IF p_resolution = 'temp_ban' AND p_ban_duration IS NOT NULL THEN
    BEGIN
      v_banned_until := now() + p_ban_duration::interval;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'mod_resolve_report: ban_duration % is not a valid interval; banned_until left null', p_ban_duration;
      v_banned_until := NULL;
    END;
  END IF;

  -- 1) Report row.
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

  -- 2) Profile + auth state for bans.
  IF p_resolution IN ('temp_ban', 'permanent_ban') THEN
    UPDATE profiles
       SET is_active    = false,
           banned_until = CASE
                            WHEN p_resolution = 'temp_ban' THEN v_banned_until
                            ELSE NULL
                          END,
           ban_reason   = COALESCE(p_ban_reason, ban_reason)
     WHERE id = v_target_user_id;

    -- Force sign-out across every device.
    DELETE FROM auth.sessions WHERE user_id = v_target_user_id;

    IF p_resolution = 'permanent_ban' THEN
      -- Block re-signin via auth.users.banned_until (sigtops Supabase
      -- Auth's signin path) AND re-signup via banned_emails (sigtops
      -- our own handle_new_user trigger).
      UPDATE auth.users
         SET banned_until = '9999-12-31 23:59:59+00'::timestamptz
       WHERE id = v_target_user_id;

      IF v_target_email IS NOT NULL THEN
        INSERT INTO banned_emails (email, original_user_id, reason)
        VALUES (
          lower(v_target_email),
          v_target_user_id,
          COALESCE(p_ban_reason, 'Permanent ban from in-app mod flow')
        )
        ON CONFLICT (email) DO NOTHING;
      END IF;
    END IF;
  END IF;

  -- 3) Fire the user-facing email. no_action skips it entirely (the
  -- moderator chose not to notify the user).
  IF p_resolution = 'no_action' THEN
    RETURN;
  END IF;

  SELECT decrypted_secret INTO v_service_role_key
    FROM vault.decrypted_secrets
   WHERE name = 'service_role_key' LIMIT 1;
  IF v_service_role_key IS NULL THEN
    RAISE WARNING 'service_role_key not in vault — moderation email skipped for %', v_target_user_id;
    RETURN;
  END IF;

  -- moderate-user's action enum is the source of truth for which
  -- email template renders. From the in-app flow we collapse the
  -- legacy 24h/7d/30d action variants into a single 'temp_ban' that
  -- moderate-user understands when email_only=true (see edge fn).
  v_action := p_resolution;

  -- Reason fed into the email body. ban_reason override takes
  -- priority; fall back to internal moderator_notes; final fallback
  -- so we never send "null" to the user.
  v_reason_for_email := COALESCE(
    p_ban_reason,
    p_notes,
    'Violation of community guidelines'
  );

  PERFORM net.http_post(
    url := v_function_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_service_role_key
    ),
    body := jsonb_build_object(
      'email_only',           true,
      'user_id',              v_target_user_id::text,
      'action',               v_action,
      'reason',               v_reason_for_email,
      'report_id',            p_report_id::text,
      'removed_content_type', p_removed_content_type,
      'ban_duration',         p_ban_duration,
      'ban_reason',           p_ban_reason,
      'banned_until',         v_banned_until
    )
  );
END;
$$;
