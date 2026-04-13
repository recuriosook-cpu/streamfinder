-- ================================================================
-- STREAMFINDER — Profile & social features setup
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ================================================================

-- ----------------------------------------------------------------
-- 1. PROFILES (username + avatar)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username   TEXT,
  avatar_url TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);

-- Auto-create empty profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ----------------------------------------------------------------
-- 2. WATCH HISTORY (auto-recorded on each detail page visit)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS watch_history (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  media_id    INTEGER NOT NULL,
  media_type  TEXT NOT NULL CHECK (media_type IN ('movie', 'tv')),
  title       TEXT NOT NULL,
  poster_path TEXT,
  visited_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE watch_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own history"
  ON watch_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own history"
  ON watch_history FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own history"
  ON watch_history FOR DELETE USING (auth.uid() = user_id);

-- ----------------------------------------------------------------
-- 3. WATCHED  (explicitly marked as "ya lo vi")
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS watched (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  media_id    INTEGER NOT NULL,
  media_type  TEXT NOT NULL CHECK (media_type IN ('movie', 'tv')),
  title       TEXT NOT NULL,
  poster_path TEXT,
  watched_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, media_id, media_type)
);

ALTER TABLE watched ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own watched"
  ON watched FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own watched"
  ON watched FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own watched"
  ON watched FOR DELETE USING (auth.uid() = user_id);

-- ----------------------------------------------------------------
-- 4. WATCHLIST  ("para ver después")
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS watchlist (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  media_id    INTEGER NOT NULL,
  media_type  TEXT NOT NULL CHECK (media_type IN ('movie', 'tv')),
  title       TEXT NOT NULL,
  poster_path TEXT,
  added_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, media_id, media_type)
);

ALTER TABLE watchlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own watchlist"
  ON watchlist FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own watchlist"
  ON watchlist FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own watchlist"
  ON watchlist FOR DELETE USING (auth.uid() = user_id);

-- ----------------------------------------------------------------
-- 5. RATINGS  (1–5 estrellas por película/serie)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ratings (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  media_id    INTEGER NOT NULL,
  media_type  TEXT NOT NULL CHECK (media_type IN ('movie', 'tv')),
  title       TEXT NOT NULL,
  poster_path TEXT,
  rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  rated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, media_id, media_type)
);

ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own ratings"
  ON ratings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own ratings"
  ON ratings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own ratings"
  ON ratings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own ratings"
  ON ratings FOR DELETE USING (auth.uid() = user_id);

-- ----------------------------------------------------------------
-- 6. EXTEND FAVORITES with metadata for statistics
--    (genre_ids, runtime, seasons for hour estimates + genre/platform stats)
-- ----------------------------------------------------------------
ALTER TABLE favorites ADD COLUMN IF NOT EXISTS genre_ids     INTEGER[] DEFAULT '{}';
ALTER TABLE favorites ADD COLUMN IF NOT EXISTS runtime       INTEGER;   -- minutes (movies)
ALTER TABLE favorites ADD COLUMN IF NOT EXISTS seasons_count INTEGER;   -- TV seasons
ALTER TABLE favorites ADD COLUMN IF NOT EXISTS provider_id   INTEGER;
ALTER TABLE favorites ADD COLUMN IF NOT EXISTS provider_name TEXT;

-- ----------------------------------------------------------------
-- 7. STORAGE BUCKET for avatars
--    Run these lines separately if the bucket doesn't exist yet.
--    You can also create it from: Dashboard > Storage > New bucket
-- ----------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT DO NOTHING;

-- Public read access
CREATE POLICY "Avatar images are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

-- Users can upload/update only their own folder ({userId}/*)
CREATE POLICY "Users can upload own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update own avatar"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
