-- Reports: moderator-specifiable fields used to render moderation emails.
--
-- Each row already records `reported_content_type` (what the reporter
-- flagged) and `resolution` (the moderator's chosen action). These three
-- new columns capture moderator overrides that feed directly into the
-- email templates rendered by `supabase/functions/moderate-user`:
--
--   removed_content_type — for `content_removed` resolutions: which kind
--     of content the moderator actually took down. May differ from what
--     was originally reported (e.g. report flagged the profile, but only
--     a single photo was removed).
--
--   ban_duration — for `temp_ban` resolutions: human-readable duration
--     the moderator wants surfaced in the suspension email. Falls back
--     to the canonical label tied to the action (24h / 7d / 30d) when
--     null. Allows custom durations without a code change.
--
--   ban_reason — for any ban: a short moderator-written explanation
--     ("Harassment in chat after prior warning"). Distinct from the
--     reporter's `reason` (which is from REPORT_REASONS) and the
--     free-form `moderator_notes` (internal). When set, this is what
--     the user sees in the email.
--
-- All three are nullable; existing rows keep working.

ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS removed_content_type text
    CHECK (removed_content_type IS NULL OR
           removed_content_type IN ('activity', 'photo', 'message')),
  ADD COLUMN IF NOT EXISTS ban_duration text
    CHECK (ban_duration IS NULL OR char_length(ban_duration) <= 60),
  ADD COLUMN IF NOT EXISTS ban_reason text
    CHECK (ban_reason IS NULL OR char_length(ban_reason) <= 500);

COMMENT ON COLUMN public.reports.removed_content_type IS
  'For content_removed resolutions: which kind of content the moderator removed. Feeds the {{ .ContentType }} variable in the content-removal email template.';

COMMENT ON COLUMN public.reports.ban_duration IS
  'For temp_ban resolutions: human-readable duration shown to the user. Overrides the canonical action-derived label.';

COMMENT ON COLUMN public.reports.ban_reason IS
  'For any ban: short moderator explanation shown to the user (e.g. "Harassment in chat after prior warning"). Distinct from reporter reason and internal moderator_notes.';
