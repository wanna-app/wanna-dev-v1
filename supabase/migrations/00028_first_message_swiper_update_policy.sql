-- Migration 00028: RLS — let the swiper patch their own queue row
--
-- 00027 added interest_queue.first_message but the existing RLS only
-- allowed activity OWNERS to UPDATE queue rows (they need it to flip
-- status pending → accepted/rejected). This second policy lets the
-- swiper patch their own row so they can attach an optional first
-- message right after expressing interest.
--
-- Both policies coexist: PG evaluates RLS as OR across permissive
-- policies, so an UPDATE succeeds if either side qualifies.

DROP POLICY IF EXISTS "Swiper can update own queue row"
  ON public.interest_queue;

CREATE POLICY "Swiper can update own queue row"
  ON public.interest_queue FOR UPDATE
  TO authenticated
  USING (interested_user_id = auth.uid())
  WITH CHECK (interested_user_id = auth.uid());
