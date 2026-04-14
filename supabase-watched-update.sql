-- ================================================================
-- STREAMFINDER — watched table update for stats
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ================================================================
-- Adds metadata columns so statistics can be computed from
-- the "Ya lo vi" list (genre, runtime, seasons).
-- The watched_at column already exists with DEFAULT NOW();
-- these ALTER statements only add the new columns.

ALTER TABLE watched ADD COLUMN IF NOT EXISTS genre_ids     INTEGER[] DEFAULT '{}';
ALTER TABLE watched ADD COLUMN IF NOT EXISTS runtime       INTEGER;   -- minutes (movies)
ALTER TABLE watched ADD COLUMN IF NOT EXISTS seasons_count INTEGER;   -- TV seasons count
