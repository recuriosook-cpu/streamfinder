-- ================================================================
-- STREAMFINDER — Social features setup
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ================================================================

-- ----------------------------------------------------------------
-- 1. EXTEND PROFILES
-- ----------------------------------------------------------------
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bio          TEXT;

-- Unique username index (partial: only for non-null values)
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique
  ON profiles(username) WHERE username IS NOT NULL;

-- Make profiles publicly readable (for public profile pages)
DROP POLICY IF EXISTS "Public profiles are readable" ON profiles;
CREATE POLICY "Public profiles are readable"
  ON profiles FOR SELECT USING (true);

-- Auto-populate username from email on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  base_username TEXT;
  final_username TEXT;
  counter INTEGER := 0;
BEGIN
  base_username := regexp_replace(split_part(NEW.email, '@', 1), '[^a-zA-Z0-9_]', '_', 'g');
  final_username := base_username;
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = final_username) LOOP
    counter := counter + 1;
    final_username := base_username || counter::text;
  END LOOP;
  INSERT INTO public.profiles (id, username)
    VALUES (NEW.id, final_username)
    ON CONFLICT (id) DO UPDATE
      SET username = EXCLUDED.username
      WHERE profiles.username IS NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill usernames for existing users (UUID suffix ensures uniqueness)
UPDATE profiles p
SET username = (
  SELECT regexp_replace(split_part(u.email, '@', 1), '[^a-zA-Z0-9_]', '_', 'g')
         || '_' || substring(p.id::text, 1, 6)
  FROM auth.users u
  WHERE u.id = p.id
)
WHERE p.username IS NULL;

-- ----------------------------------------------------------------
-- 2. REVIEWS
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reviews (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  media_id    INTEGER NOT NULL,
  media_type  TEXT NOT NULL CHECK (media_type IN ('movie', 'tv')),
  title       TEXT NOT NULL,
  poster_path TEXT,
  rating      INTEGER CHECK (rating BETWEEN 1 AND 5),
  body        TEXT,
  recommended BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, media_id, media_type)
);

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reviews are publicly readable"
  ON reviews FOR SELECT USING (true);
CREATE POLICY "Users can insert own reviews"
  ON reviews FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own reviews"
  ON reviews FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own reviews"
  ON reviews FOR DELETE USING (auth.uid() = user_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS reviews_updated_at ON reviews;
CREATE TRIGGER reviews_updated_at
  BEFORE UPDATE ON reviews
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ----------------------------------------------------------------
-- 3. REVIEW LIKES
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS review_likes (
  review_id  UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (review_id, user_id)
);

ALTER TABLE review_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Review likes are publicly readable"
  ON review_likes FOR SELECT USING (true);
CREATE POLICY "Users can like reviews"
  ON review_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can unlike reviews"
  ON review_likes FOR DELETE USING (auth.uid() = user_id);

-- ----------------------------------------------------------------
-- 4. FOLLOWS
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS follows (
  follower_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id != following_id)
);

ALTER TABLE follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Follows are publicly readable"
  ON follows FOR SELECT USING (true);
CREATE POLICY "Users can follow others"
  ON follows FOR INSERT WITH CHECK (auth.uid() = follower_id);
CREATE POLICY "Users can unfollow"
  ON follows FOR DELETE USING (auth.uid() = follower_id);
