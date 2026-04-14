-- ================================================================
-- STREAMFINDER — Public profile tables
-- Run AFTER supabase-social-setup.sql
-- Safe to run multiple times
-- ================================================================

-- ----------------------------------------------------------------
-- 1. PINNED FAVORITES  (5 fixed poster slots per user)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pinned_favorites (
  user_id     UUID    NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  slot        INTEGER NOT NULL CHECK (slot BETWEEN 1 AND 5),
  media_id    INTEGER NOT NULL,
  media_type  TEXT    NOT NULL CHECK (media_type IN ('movie', 'tv')),
  title       TEXT    NOT NULL,
  poster_path TEXT,
  PRIMARY KEY (user_id, slot)
);

ALTER TABLE pinned_favorites ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pinned_favorites' AND policyname='Pinned favorites are publicly readable') THEN
    CREATE POLICY "Pinned favorites are publicly readable"
      ON pinned_favorites FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pinned_favorites' AND policyname='Users can manage own pinned favorites') THEN
    CREATE POLICY "Users can manage own pinned favorites"
      ON pinned_favorites FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- ----------------------------------------------------------------
-- 2. PUBLIC READ — watched & watchlist
--    Needed so public profile tabs "Ya vi" and "Para ver" work.
--    PostgreSQL ORs permissive policies, so existing owner-only
--    policy stays intact and becomes redundant (harmless).
-- ----------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='watched' AND policyname='Watched is publicly readable') THEN
    CREATE POLICY "Watched is publicly readable"
      ON watched FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='watchlist' AND policyname='Watchlist is publicly readable') THEN
    CREATE POLICY "Watchlist is publicly readable"
      ON watchlist FOR SELECT USING (true);
  END IF;
END $$;
