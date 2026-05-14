-- Migration 00050: pin search_path on every public-schema function
--
-- The Supabase Security Advisor flagged ~88 functions with the
-- "Function Search Path Mutable" warning. Without an explicit
-- search_path, a session can prepend a hostile schema and trick a
-- function (especially SECURITY DEFINER) into resolving objects from
-- the wrong place. Mitigation is one ALTER FUNCTION per function
-- adding `SET search_path = public`.
--
-- Newer functions (deactivate_self, reset_demo_unread_state, etc.)
-- already include this declaration inline. This migration patches the
-- legacy functions that predate that convention.
--
-- Implementation: a DO block iterates pg_proc and ALTERs every regular
-- function in the public schema that doesn't already have a
-- search_path config. Idempotent — re-runnable, skips functions that
-- are already pinned.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema_name,
           p.proname AS func_name,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'  -- regular functions only (not aggregates / window)
      AND NOT EXISTS (
        SELECT 1
        FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) AS cfg
        WHERE cfg LIKE 'search_path=%'
      )
  LOOP
    EXECUTE format(
      'ALTER FUNCTION %I.%I(%s) SET search_path = public',
      r.schema_name, r.func_name, r.args
    );
  END LOOP;
END $$;
