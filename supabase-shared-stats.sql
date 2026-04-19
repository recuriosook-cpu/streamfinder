-- ── shared_stats ─────────────────────────────────────────────────────────────
-- Posts de estadísticas compartidas desde el perfil al feed de amigos

CREATE TABLE IF NOT EXISTS shared_stats (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  stat_type       TEXT NOT NULL,
  -- 'top_actor' | 'top_actress' | 'top_director' | 'watch_hours_total'
  -- | 'watch_hours_month' | 'watch_hours_week' | 'top_genre'
  stat_title      TEXT NOT NULL,   -- "El actor más visto por Ferlageok"
  stat_value      TEXT NOT NULL,   -- "Gary Oldman"  /  "42"
  stat_detail     TEXT,            -- "Apareció en 12 títulos"
  stat_image_url  TEXT,            -- foto de perfil de actor/directora desde TMDB
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ── shared_stat_likes ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS shared_stat_likes (
  stat_id    UUID REFERENCES shared_stats(id) ON DELETE CASCADE NOT NULL,
  user_id    UUID REFERENCES profiles(id)     ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (stat_id, user_id)
);

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE shared_stats      ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_stat_likes ENABLE ROW LEVEL SECURITY;

-- shared_stats
CREATE POLICY "shared_stats_select" ON shared_stats
  FOR SELECT USING (true);

CREATE POLICY "shared_stats_insert" ON shared_stats
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "shared_stats_delete" ON shared_stats
  FOR DELETE USING (auth.uid() = user_id);

-- shared_stat_likes
CREATE POLICY "shared_stat_likes_select" ON shared_stat_likes
  FOR SELECT USING (true);

CREATE POLICY "shared_stat_likes_insert" ON shared_stat_likes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "shared_stat_likes_delete" ON shared_stat_likes
  FOR DELETE USING (auth.uid() = user_id);

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS shared_stats_user_id_idx    ON shared_stats (user_id);
CREATE INDEX IF NOT EXISTS shared_stats_created_at_idx ON shared_stats (created_at DESC);
