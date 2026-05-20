-- Migration 00054: app_config table + min-version gate
--
-- Lets us force-upgrade users off a stale version without needing
-- App Store re-submission. The client reads min_supported_version on
-- cold boot; if its bundled version is below, it renders a blocking
-- "please update" screen with a link to the store.
--
-- Schema is a key/value singleton table — only ever one row. Future
-- config values (feature flags, kill switches) can live here too.

CREATE TABLE IF NOT EXISTS public.app_config (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  min_supported_version text NOT NULL DEFAULT '1.0.0',
  store_url_ios text NOT NULL DEFAULT 'https://apps.apple.com/app/idTBD',
  store_url_android text NOT NULL DEFAULT 'https://play.google.com/store/apps/details?id=com.joinwannaapp.wanna',
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Seed the singleton row.
INSERT INTO public.app_config (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- Anyone (incl. anon, for pre-auth boot check) can read; only
-- service_role / postgres can write.
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read app_config"
  ON public.app_config FOR SELECT
  TO anon, authenticated
  USING (true);

GRANT SELECT ON public.app_config TO anon, authenticated, service_role;
GRANT UPDATE ON public.app_config TO service_role;

COMMENT ON TABLE public.app_config IS
  'Singleton key/value config read by the client on cold boot. Holds min_supported_version (force-upgrade gate) + store URLs.';
