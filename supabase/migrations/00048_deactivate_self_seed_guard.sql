-- Migration 00048: refuse to deactivate seed accounts via deactivate_self()
--
-- Seed/demo accounts back the app's discovery feed and demo login. An
-- accidental deactivation (one tap of "Deactivate" from a seed login)
-- corrupts the demo experience until manually reverted. Block at the
-- function level so the client guard isn't the only defense.

CREATE OR REPLACE FUNCTION public.deactivate_self()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_seed boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT is_seed INTO v_is_seed
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_is_seed THEN
    RAISE EXCEPTION 'cannot deactivate seed account'
      USING HINT = 'Clear is_seed in the dashboard first if you really want to deactivate.';
  END IF;

  UPDATE public.profiles
    SET is_active      = false,
        deactivated_at = now()
    WHERE id = auth.uid();
END;
$$;
