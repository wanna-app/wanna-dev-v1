-- Migration 00053: delete_self() RPC
--
-- Apple Guideline 5.1.1(v) (since 2022) requires apps that let users
-- create accounts to also offer a path to **complete account deletion**
-- from inside the app — not just deactivation. Apps that ship with only
-- a deactivate-and-wait flow get rejected at App Review.
--
-- This RPC hard-deletes auth.users for the caller. ON DELETE CASCADE
-- foreign keys (set in 00001 + later migrations) handle the rest:
-- profiles, activities, swipes, interest_queue, matches, messages,
-- device_tokens, notification_log, blocks, reports, discovery
-- preferences — all go.
--
-- Seed accounts are blocked from calling this (parallel to migration
-- 00048 for deactivate_self). Anyone else can permanently delete only
-- their own account.

CREATE OR REPLACE FUNCTION public.delete_self()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
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
    RAISE EXCEPTION 'cannot delete seed account'
      USING HINT = 'Clear is_seed in the dashboard first if you really want to delete.';
  END IF;

  -- Delete the auth.users row. FK CASCADEs handle every dependent row.
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.delete_self() FROM public;
REVOKE EXECUTE ON FUNCTION public.delete_self() FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_self() TO authenticated, service_role;

COMMENT ON FUNCTION public.delete_self() IS
  'User-initiated permanent account deletion (Apple Guideline 5.1.1(v)). Deletes auth.users for the caller; FK CASCADEs handle dependent data. Refuses to delete seed accounts.';
