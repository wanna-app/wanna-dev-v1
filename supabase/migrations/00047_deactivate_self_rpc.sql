-- Migration 00047: deactivate_self() RPC
--
-- Replaces the direct-from-client UPDATE on profiles in SettingsScreen's
-- handleDeactivate. Direct mutations on lifecycle ops (deactivate/ban/delete)
-- are fragile against future RLS policy changes — wrapping the operation in
-- a SECURITY DEFINER function gives us:
--   - an explicit auth.uid() null-check
--   - a stable contract that survives RLS evolution
--   - parity with the mod_resolve_report pattern (server-side state machine)
--
-- The function only ever mutates the caller's own row (id = auth.uid()) so
-- the SECURITY DEFINER bypass is scoped and safe.

CREATE OR REPLACE FUNCTION public.deactivate_self()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  UPDATE public.profiles
    SET is_active      = false,
        deactivated_at = now()
    WHERE id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.deactivate_self() FROM public;
GRANT EXECUTE ON FUNCTION public.deactivate_self() TO authenticated;

COMMENT ON FUNCTION public.deactivate_self() IS
  'User-initiated account deactivation. Sets is_active=false and deactivated_at=now() on the caller''s profile. Pairs with the 30-day retention cleanup in 00019.';
