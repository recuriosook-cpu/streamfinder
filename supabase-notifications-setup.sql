-- ================================================================
-- StreamFinder — Notifications + Ratings setup (DEFINITIVE)
-- Run in: Supabase Dashboard → SQL Editor
--
-- This script:
--   1. Creates notifications table with correct RLS
--   2. Creates follow + review_like triggers (with SET search_path)
--   3. Fixes ratings table public SELECT
--   4. Ends with a diagnostic SELECT so you can verify everything
-- ================================================================


-- ── SECTION 1: RATINGS ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ratings (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  media_id    integer     NOT NULL,
  media_type  text        NOT NULL CHECK (media_type IN ('movie', 'tv')),
  title       text        NOT NULL DEFAULT '',
  poster_path text,
  rating      integer     NOT NULL CHECK (rating BETWEEN 1 AND 5),
  rated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, media_id, media_type)
);

ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;

-- Drop and recreate to avoid "already exists" errors
DROP POLICY IF EXISTS "Public can read ratings"    ON ratings;
DROP POLICY IF EXISTS "Users manage own ratings"   ON ratings;

CREATE POLICY "Public can read ratings"
  ON ratings FOR SELECT USING (true);

CREATE POLICY "Users manage own ratings"
  ON ratings FOR ALL USING (auth.uid() = user_id);


-- ── SECTION 2: NOTIFICATIONS TABLE ──────────────────────────────

CREATE TABLE IF NOT EXISTS notifications (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type         text        NOT NULL CHECK (type IN ('follow', 'review_like')),
  review_id    uuid,
  review_title text,
  read         boolean     NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_idx
  ON notifications(user_id, created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;


-- ── SECTION 3: NOTIFICATIONS RLS ────────────────────────────────
-- Drop existing before recreating — avoids silent failures

DROP POLICY IF EXISTS "Users read own notifications"   ON notifications;
DROP POLICY IF EXISTS "Users update own notifications" ON notifications;
DROP POLICY IF EXISTS "Actor can insert notifications" ON notifications;

-- Owner reads their own notifications
CREATE POLICY "Users read own notifications"
  ON notifications
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Owner can mark as read
CREATE POLICY "Users update own notifications"
  ON notifications
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role / triggers bypass RLS (SECURITY DEFINER).
-- anon + authenticated need no INSERT policy because all
-- inserts come from triggers only.


-- ── SECTION 4: TRIGGER — new follow ─────────────────────────────
-- SET search_path = public is required in Supabase so the function
-- can resolve table names without a full schema prefix.

CREATE OR REPLACE FUNCTION public.notify_on_follow()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  -- Skip self-follows
  IF NEW.following_id = NEW.follower_id THEN
    RETURN NEW;
  END IF;

  INSERT INTO notifications (user_id, actor_id, type)
  VALUES (NEW.following_id, NEW.follower_id, 'follow');

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block the follow even if notification insert fails
  RAISE WARNING 'notify_on_follow: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_follow ON follows;

CREATE TRIGGER trg_notify_follow
  AFTER INSERT ON follows
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_follow();


-- ── SECTION 5: TRIGGER — review like ────────────────────────────

CREATE OR REPLACE FUNCTION public.notify_on_review_like()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_title text;
BEGIN
  SELECT user_id, title
    INTO v_owner, v_title
    FROM reviews
   WHERE id = NEW.review_id;

  -- Skip if review not found or user liked their own review
  IF v_owner IS NULL OR v_owner = NEW.user_id THEN
    RETURN NEW;
  END IF;

  INSERT INTO notifications (user_id, actor_id, type, review_id, review_title)
  VALUES (v_owner, NEW.user_id, 'review_like', NEW.review_id, v_title);

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_on_review_like: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_review_like ON review_likes;

CREATE TRIGGER trg_notify_review_like
  AFTER INSERT ON review_likes
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_review_like();


-- ── SECTION 6: DIAGNOSTIC ────────────────────────────────────────
-- After running this script, the following SELECT should return
-- 5 rows all with status '✓ OK'.

SELECT item, status FROM (
  VALUES
    (
      '1. notifications table',
      CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'notifications'
      ) THEN '✓ OK' ELSE '✗ MISSING — table not created' END
    ),
    (
      '2. notifications SELECT policy',
      CASE WHEN EXISTS (
        SELECT 1 FROM pg_policies
         WHERE tablename = 'notifications' AND cmd = 'SELECT'
      ) THEN '✓ OK' ELSE '✗ MISSING — users cannot read notifications' END
    ),
    (
      '3. notifications UPDATE policy',
      CASE WHEN EXISTS (
        SELECT 1 FROM pg_policies
         WHERE tablename = 'notifications' AND cmd = 'UPDATE'
      ) THEN '✓ OK' ELSE '✗ MISSING — users cannot mark as read' END
    ),
    (
      '4. trg_notify_follow trigger',
      CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.triggers
         WHERE trigger_name = 'trg_notify_follow'
      ) THEN '✓ OK' ELSE '✗ MISSING — follow trigger not created' END
    ),
    (
      '5. trg_notify_review_like trigger',
      CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.triggers
         WHERE trigger_name = 'trg_notify_review_like'
      ) THEN '✓ OK' ELSE '✗ MISSING — review like trigger not created' END
    ),
    (
      '6. ratings SELECT policy',
      CASE WHEN EXISTS (
        SELECT 1 FROM pg_policies
         WHERE tablename = 'ratings' AND cmd = 'SELECT'
      ) THEN '✓ OK' ELSE '✗ MISSING — ratings not publicly readable' END
    )
) AS t(item, status)
ORDER BY item;
