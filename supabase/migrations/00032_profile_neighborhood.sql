ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS neighborhood text NULL;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_neighborhood_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_neighborhood_check
  CHECK (neighborhood IS NULL OR char_length(neighborhood) <= 60);

COMMENT ON COLUMN public.profiles.neighborhood IS
  'Optional 60-char neighborhood label users can attach to their profile (e.g. "Echo Park", "Williamsburg"). Shown on Profile + UserProfile.';
