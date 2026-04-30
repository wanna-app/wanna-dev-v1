-- Add activities table to supabase_realtime publication so the Discover
-- feed can auto-prepend new matching activities as they're posted
-- (AC-SW-06).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'activities'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE activities;
  END IF;
END $$;
