-- Migration 00052: revoke EXECUTE from anon on SECURITY DEFINER functions
--
-- Migration 00051 revoked EXECUTE from PUBLIC and granted to
-- authenticated + service_role, but Supabase's default grants gave
-- anon its OWN explicit EXECUTE privilege on every function — separate
-- from PUBLIC. So 00051 cleared the PUBLIC entry from the ACL but
-- left anon=X/postgres intact, which is why splinter still flags
-- these as publicly-executable.
--
-- This migration revokes EXECUTE from anon on every SECURITY DEFINER
-- function in public schema. Anonymous users couldn't actually run
-- most of these anyway (the functions check auth.uid() IS NOT NULL),
-- but the ACL surface area was unnecessarily broad.
--
-- After this, ACL on each SECURITY DEFINER function should read:
--   {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- — no anon entry, no PUBLIC entry.

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
      AND p.prosecdef = true
      AND p.prokind = 'f'
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM anon',
      r.schema_name, r.func_name, r.args
    );
  END LOOP;
END $$;
