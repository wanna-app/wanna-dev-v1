-- Migration 00051: restrict SECURITY DEFINER function grants
--
-- The Security Advisor flags every SECURITY DEFINER function in
-- public schema as "Public Can Execute SECURITY DEFINER Function" —
-- i.e., grant defaults make these callable by the `public` pseudo-role
-- which includes anonymous users. Best practice is to:
--   REVOKE EXECUTE FROM PUBLIC
--   GRANT  EXECUTE TO authenticated, service_role
--
-- Newer functions (deactivate_self, etc.) already do this inline. This
-- migration backfills the legacy ones.
--
-- Triggers don't need grants — they fire on row events, not direct
-- invocation. pg_cron jobs run as the postgres superuser so they
-- aren't affected by these grants either. Edge-function callbacks
-- come through the service_role key, so service_role grant covers
-- those. Authenticated user RPCs work via the authenticated grant.
--
-- The migration is idempotent — re-running just re-applies the same
-- grants, safe.

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
      AND p.prosecdef = true  -- SECURITY DEFINER only
      AND p.prokind = 'f'
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC',
      r.schema_name, r.func_name, r.args
    );
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION %I.%I(%s) TO authenticated, service_role',
      r.schema_name, r.func_name, r.args
    );
  END LOOP;
END $$;
