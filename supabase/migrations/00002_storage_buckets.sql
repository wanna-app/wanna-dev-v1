-- Storage buckets for profile photos and verification selfies
-- Both are private; access controlled via signed URLs and RLS

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('profile-photos', 'profile-photos', false, 10485760, ARRAY['image/jpeg','image/png','image/heic','image/webp']),
  ('verification-selfies', 'verification-selfies', false, 10485760, ARRAY['image/jpeg','image/png','image/heic'])
ON CONFLICT (id) DO NOTHING;

-- profile-photos: users can manage files in their own folder (folder = user uuid)
CREATE POLICY "Users can upload own profile photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'profile-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can update own profile photos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'profile-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete own profile photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'profile-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Authenticated can read profile photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'profile-photos');

-- verification-selfies: users can only upload to their own folder; no read policy = only service-role (moderators) can read
CREATE POLICY "Users can upload own verification selfie"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'verification-selfies'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
