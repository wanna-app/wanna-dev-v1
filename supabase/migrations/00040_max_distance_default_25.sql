-- Migration 00040: drop default max_distance_miles from 50 → 25
--
-- Product call: 50 mi was too wide for a "let's hang out tonight"
-- discovery experience. 25 keeps Discover meaningfully local.
-- Existing rows that still carry the 50 default flip to 25; users who
-- explicitly chose another value keep their pick.

ALTER TABLE public.discovery_preferences
  ALTER COLUMN max_distance_miles SET DEFAULT 25;

UPDATE public.discovery_preferences
SET max_distance_miles = 25
WHERE max_distance_miles = 50;
