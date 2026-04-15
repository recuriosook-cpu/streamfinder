-- ================================================================
-- StreamFinder — Review Comments + extended notification types
-- Run AFTER supabase-notifications-setup.sql
-- Safe to re-run (uses IF NOT EXISTS / CREATE OR REPLACE).
-- Run in: Supabase Dashboard → SQL Editor
-- ================================================================


-- ── SECTION 1: REVIEW COMMENTS TABLE ────────────────────────────

CREATE TABLE IF NOT EXISTS review_comments (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  review_id  uuid        NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id  uuid        REFERENCES review_comments(id) ON DELETE CASCADE,
  content    text        NOT NULL CHECK (length(content) > 0 AND length(content) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS review_comments_review_idx ON review_comments(review_id, created_at ASC);
CREATE INDEX IF NOT EXISTS review_comments_parent_idx ON review_comments(parent_id);

ALTER TABLE review_comments ENABLE ROW LEVEL SECURITY;

-- Anyone can read comments
DROP POLICY IF EXISTS "Public can read comments"  ON review_comments;
CREATE POLICY "Public can read comments"
  ON review_comments FOR SELECT USING (true);

-- Authenticated users can insert their own comments
DROP POLICY IF EXISTS "Users insert own comments" ON review_comments;
CREATE POLICY "Users insert own comments"
  ON review_comments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own comments
DROP POLICY IF EXISTS "Users delete own comments" ON review_comments;
CREATE POLICY "Users delete own comments"
  ON review_comments FOR DELETE TO authenticated
  USING (auth.uid() = user_id);


-- ── SECTION 2: EXTEND NOTIFICATIONS TABLE ───────────────────────
-- Add review_comment / comment_reply types and a comment_id column.
-- We drop and recreate the CHECK constraint so this is idempotent.

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('follow', 'review_like', 'review_comment', 'comment_reply'));

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS
  comment_id uuid REFERENCES review_comments(id) ON DELETE SET NULL;


-- ── SECTION 3: DIAGNOSTIC ────────────────────────────────────────
-- After running, all rows should show '✓ OK'.

SELECT item, status FROM (
  VALUES
    (
      '1. review_comments table',
      CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'review_comments'
      ) THEN '✓ OK' ELSE '✗ MISSING' END
    ),
    (
      '2. review_comments SELECT policy',
      CASE WHEN EXISTS (
        SELECT 1 FROM pg_policies
         WHERE tablename = 'review_comments' AND cmd = 'SELECT'
      ) THEN '✓ OK' ELSE '✗ MISSING' END
    ),
    (
      '3. review_comments INSERT policy',
      CASE WHEN EXISTS (
        SELECT 1 FROM pg_policies
         WHERE tablename = 'review_comments' AND cmd = 'INSERT'
      ) THEN '✓ OK' ELSE '✗ MISSING' END
    ),
    (
      '4. notifications type constraint updated',
      CASE WHEN EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname = 'notifications_type_check'
      ) THEN '✓ OK' ELSE '✗ MISSING' END
    ),
    (
      '5. notifications comment_id column',
      CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_name = 'notifications' AND column_name = 'comment_id'
      ) THEN '✓ OK' ELSE '✗ MISSING' END
    )
) AS t(item, status)
ORDER BY item;
