-- Migration 00026: Read receipts opt-in toggle
--
-- Adds profiles.read_receipts_enabled boolean (default FALSE).
-- When FALSE, the client skips writing messages.read_at on view, so the
-- sender continues to see 'Delivered' instead of 'Read'.
--
-- Default OFF per privacy-by-default principle. Users opt in via a
-- toggle in Settings → Notifications.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS read_receipts_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.read_receipts_enabled IS
  'When false (default), the user does not send read receipts — their messages.read_at stays NULL so the sender sees Delivered. Toggleable in Settings → Notifications.';
