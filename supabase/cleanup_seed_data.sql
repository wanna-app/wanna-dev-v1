-- =============================================================================
-- Cleanup all seed data before launching to real users.
--
-- This is the manual SQL companion to the cleanup-seed-data Edge Function
-- (Section 9.1 of the PRD). Run this once before opening the app to real
-- users.
--
-- Order matters — children first, then parents, with auth.users last.
-- =============================================================================

BEGIN;

DELETE FROM messages WHERE is_seed = true;
DELETE FROM matches WHERE is_seed = true;
DELETE FROM interest_queue WHERE is_seed = true;
DELETE FROM swipes
  WHERE swiper_id IN (SELECT id FROM profiles WHERE is_seed = true);
DELETE FROM activities WHERE is_seed = true;
DELETE FROM blocks
  WHERE blocker_id IN (SELECT id FROM profiles WHERE is_seed = true)
     OR blocked_user_id IN (SELECT id FROM profiles WHERE is_seed = true);
DELETE FROM discovery_preferences
  WHERE user_id IN (SELECT id FROM profiles WHERE is_seed = true);
DELETE FROM profiles WHERE is_seed = true;

-- auth-side rows (cascades will delete profiles via FK if any survived)
DELETE FROM auth.identities
  WHERE user_id IN (
    SELECT id FROM auth.users
    WHERE email LIKE '%@wanna.seed' OR email = 'demo@joinwannaapp.com'
  );
DELETE FROM auth.users
  WHERE email LIKE '%@wanna.seed' OR email = 'demo@joinwannaapp.com';

COMMIT;

-- Reminder: also flip SHOW_DEMO_LOGIN=false in app/.env to hide the demo
-- button on the welcome screen.
