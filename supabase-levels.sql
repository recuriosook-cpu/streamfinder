-- ── Schema ────────────────────────────────────────────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS points INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS level  INTEGER DEFAULT 1;

-- ── Level calculator ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_level(p INTEGER)
RETURNS INTEGER AS $$
BEGIN
  IF p >= 1500 THEN RETURN 5;
  ELSIF p >= 700 THEN RETURN 4;
  ELSIF p >= 300 THEN RETURN 3;
  ELSIF p >= 100 THEN RETURN 2;
  ELSE RETURN 1;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ── Atomic add_points (called from client via rpc) ────────────────────────────
CREATE OR REPLACE FUNCTION add_points(p_user_id UUID, p_amount INTEGER)
RETURNS VOID AS $$
DECLARE
  v_new_points INTEGER;
  v_old_level  INTEGER;
  v_new_level  INTEGER;
BEGIN
  UPDATE profiles
  SET points = COALESCE(points, 0) + p_amount
  WHERE id = p_user_id
  RETURNING points, level INTO v_new_points, v_old_level;

  v_new_level := get_level(v_new_points);

  IF v_new_level != COALESCE(v_old_level, 1) THEN
    UPDATE profiles SET level = v_new_level WHERE id = p_user_id;

    INSERT INTO notifications (user_id, actor_id, type, review_title)
    VALUES (
      p_user_id,
      p_user_id,
      'level_up',
      CASE v_new_level
        WHEN 2 THEN '🎬 Cinéfilo'
        WHEN 3 THEN '⭐ Crítico'
        WHEN 4 THEN '🎭 Experto'
        WHEN 5 THEN '🏆 Maestro'
      END
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Back-fill existing users ───────────────────────────────────────────────────
UPDATE profiles p SET points =
  COALESCE((SELECT COUNT(*) * 3 FROM watched   w WHERE w.user_id = p.id AND w.media_type = 'movie'), 0) +
  COALESCE((SELECT COUNT(*) * 5 FROM watched   w WHERE w.user_id = p.id AND w.media_type = 'tv'),    0) +
  COALESCE((SELECT COUNT(*) * 10 FROM reviews  r WHERE r.user_id = p.id),                             0) +
  COALESCE((SELECT COUNT(*) * 5  FROM reviews  r WHERE r.user_id = p.id AND LENGTH(COALESCE(r.body,'')) >= 200), 0) +
  COALESCE((SELECT COUNT(*) * 2  FROM review_likes rl JOIN reviews r ON r.id = rl.review_id WHERE r.user_id = p.id), 0) +
  COALESCE((SELECT COUNT(*) * 1  FROM follows  f WHERE f.follower_id  = p.id), 0) +
  COALESCE((SELECT COUNT(*) * 3  FROM follows  f WHERE f.following_id = p.id), 0) +
  COALESCE((SELECT COUNT(*) * 1  FROM watchlist wl WHERE wl.user_id   = p.id), 0);

UPDATE profiles SET level = get_level(COALESCE(points, 0));
