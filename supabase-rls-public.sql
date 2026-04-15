-- ================================================================
-- STREAMFINDER — Public read RLS policies (run this to fix profile)
-- Safe to run multiple times
-- ================================================================
-- This file consolidates ALL public SELECT policies needed for
-- /usuario/[username] to display data correctly.
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ================================================================

-- ── profiles ─────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='profiles'
    AND policyname='Public profiles are readable'
  ) THEN
    CREATE POLICY "Public profiles are readable"
      ON profiles FOR SELECT USING (true);
  END IF;
END $$;

-- ── watched ───────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='watched'
    AND policyname='Watched is publicly readable'
  ) THEN
    CREATE POLICY "Watched is publicly readable"
      ON watched FOR SELECT USING (true);
  END IF;
END $$;

-- ── watchlist ─────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='watchlist'
    AND policyname='Watchlist is publicly readable'
  ) THEN
    CREATE POLICY "Watchlist is publicly readable"
      ON watchlist FOR SELECT USING (true);
  END IF;
END $$;

-- ── follows ───────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='follows'
    AND policyname='Follows are publicly readable'
  ) THEN
    CREATE POLICY "Follows are publicly readable"
      ON follows FOR SELECT USING (true);
  END IF;
END $$;

-- ── reviews ───────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='reviews'
    AND policyname='Reviews are publicly readable'
  ) THEN
    CREATE POLICY "Reviews are publicly readable"
      ON reviews FOR SELECT USING (true);
  END IF;
END $$;

-- ── review_likes ──────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='review_likes'
    AND policyname='Review likes are publicly readable'
  ) THEN
    CREATE POLICY "Review likes are publicly readable"
      ON review_likes FOR SELECT USING (true);
  END IF;
END $$;

-- ── pinned_favorites ──────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='pinned_favorites'
    AND policyname='Pinned favorites are publicly readable'
  ) THEN
    CREATE POLICY "Pinned favorites are publicly readable"
      ON pinned_favorites FOR SELECT USING (true);
  END IF;
END $$;
