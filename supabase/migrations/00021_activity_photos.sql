-- Migration 00021: Required activity photos
--
-- Every activity now has a hero photo. Three sources (poster picks one):
--   1. Auto-rendered OG image when poster pastes a link
--   2. Manual upload (run through Google Cloud Vision moderation; skipped for seed users)
--   3. Unsplash search (proxied via the unsplash-search edge function)
--
-- New columns:
--   photo_url           — required, the canonical URL (storage URL or Unsplash hotlink)
--   photo_source        — 'link' | 'upload' | 'unsplash' (audit / future tooling)
--   photo_attribution   — jsonb, only populated for source='unsplash':
--                         { photographer_name, photographer_username, photo_id, photo_url, download_location }
--
-- Backfill: existing activities (mostly seed) get a category-derived placeholder
-- so the schema can go NOT NULL without breaking the seed data. New posts must
-- set a photo via the client.

ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS photo_url         text  NULL,
  ADD COLUMN IF NOT EXISTS photo_source      text  NULL,
  ADD COLUMN IF NOT EXISTS photo_attribution jsonb NULL;

-- Audit: photo_source must be one of three known values when set
ALTER TABLE public.activities
  DROP CONSTRAINT IF EXISTS activities_photo_source_check;
ALTER TABLE public.activities
  ADD CONSTRAINT activities_photo_source_check
  CHECK (photo_source IS NULL OR photo_source IN ('link', 'upload', 'unsplash'));

-- Backfill seed activities with a single Unsplash placeholder per category.
-- These are tagged with photo_source='unsplash' so future cleanup can find
-- them. Photos picked are non-controversial editorial stock for each
-- category. Real users posting after this migration will set their own.
UPDATE public.activities SET photo_url = COALESCE(photo_url, CASE category
  WHEN 'Music & Concerts'    THEN 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=1200&q=80&auto=format&fit=crop'
  WHEN 'Outdoors & Adventure'THEN 'https://images.unsplash.com/photo-1547036967-23d11aacaee0?w=1200&q=80&auto=format&fit=crop'
  WHEN 'Fitness & Sports'    THEN 'https://images.unsplash.com/photo-1571902943202-507ec2618e8f?w=1200&q=80&auto=format&fit=crop'
  WHEN 'Food & Dining'       THEN 'https://images.unsplash.com/photo-1557872943-16a5ac26437e?w=1200&q=80&auto=format&fit=crop'
  WHEN 'Arts & Culture'      THEN 'https://images.unsplash.com/photo-1503095396549-807759245b35?w=1200&q=80&auto=format&fit=crop'
  WHEN 'Bars & Nightlife'    THEN 'https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=1200&q=80&auto=format&fit=crop'
  WHEN 'Books & Learning'    THEN 'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=1200&q=80&auto=format&fit=crop'
  WHEN 'Movies & Shows'      THEN 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=1200&q=80&auto=format&fit=crop'
  WHEN 'Gaming & Tech'       THEN 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=1200&q=80&auto=format&fit=crop'
  ELSE                            'https://images.unsplash.com/photo-1521334884684-d80222895322?w=1200&q=80&auto=format&fit=crop'
END), photo_source = COALESCE(photo_source, 'unsplash')
WHERE photo_url IS NULL;

-- Now require it. Future inserts MUST set photo_url and photo_source.
ALTER TABLE public.activities
  ALTER COLUMN photo_url   SET NOT NULL,
  ALTER COLUMN photo_source SET NOT NULL;

COMMENT ON COLUMN public.activities.photo_url IS
  'Hero photo URL. Required. From OG link preview, user upload (Storage), or Unsplash hotlink.';
COMMENT ON COLUMN public.activities.photo_source IS
  'One of: link | upload | unsplash. Drives compliance + attribution rendering.';
COMMENT ON COLUMN public.activities.photo_attribution IS
  'Unsplash compliance JSON. Only set when photo_source=unsplash. Shape: { photographer_name, photographer_username, photo_id, photo_url, download_location }';

-- ============================================================================
-- Storage bucket: activity-photos
-- ============================================================================
-- Private bucket. Owners can write to their own folder; everyone signed-in
-- can read (we serve photos via signed URLs in `get_feed`-style RPCs).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'activity-photos',
  'activity-photos',
  false,
  10485760, -- 10 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- RLS policies on storage.objects for this bucket.
-- Path convention: activity-photos/<user_id>/<activity_id>.<ext>
-- Authenticated users may upload to their own folder; read access is
-- broader so the feed can show others' activities.

DROP POLICY IF EXISTS "activity_photos_owner_write"   ON storage.objects;
DROP POLICY IF EXISTS "activity_photos_owner_update"  ON storage.objects;
DROP POLICY IF EXISTS "activity_photos_owner_delete"  ON storage.objects;
DROP POLICY IF EXISTS "activity_photos_authed_read"   ON storage.objects;

CREATE POLICY "activity_photos_owner_write"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'activity-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "activity_photos_owner_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'activity-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "activity_photos_owner_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'activity-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "activity_photos_authed_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'activity-photos');
