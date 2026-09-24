-- ================================================================
-- StreamFinder — Fix script
-- Safe to re-run (uses IF NOT EXISTS / CREATE OR REPLACE).
-- Run in: Supabase Dashboard → SQL Editor
-- ================================================================

-- ── 1. RATINGS ──────────────────────────────────────────────────
--
-- Sacado el 2026-09-24. Acá había una copia de `ratings` con `rating` entero
-- y una política de lectura pública que en producción no existe: correr este
-- archivo de nuevo habría hecho públicas las notas de todos sin que nadie lo
-- decidiera. La definición real está en `supabase-profile-setup.sql`.


-- ── 2. NOTIFICATIONS — table, RLS, triggers ─────────────────────

CREATE TABLE IF NOT EXISTS notifications (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type         text        NOT NULL CHECK (type IN ('follow', 'review_like')),
  review_id    uuid        REFERENCES reviews(id) ON DELETE CASCADE,
  review_title text,
  read         boolean     NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_idx
  ON notifications(user_id, created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'notifications' AND policyname = 'Users read own notifications'
  ) THEN
    CREATE POLICY "Users read own notifications"
      ON notifications FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'notifications' AND policyname = 'Users update own notifications'
  ) THEN
    CREATE POLICY "Users update own notifications"
      ON notifications FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$;


-- ── 3. TRIGGER: follow → notify followed user ───────────────────

CREATE OR REPLACE FUNCTION public.notify_on_follow()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Never notify self-follows
  IF NEW.following_id = NEW.follower_id THEN RETURN NEW; END IF;
  INSERT INTO notifications (user_id, actor_id, type)
  VALUES (NEW.following_id, NEW.follower_id, 'follow');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_follow ON follows;
CREATE TRIGGER trg_notify_follow
  AFTER INSERT ON follows
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_follow();


-- ── 4. TRIGGER: review like → notify review author ──────────────

CREATE OR REPLACE FUNCTION public.notify_on_review_like()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_owner uuid;
  v_title text;
BEGIN
  SELECT user_id, title INTO v_owner, v_title
  FROM reviews WHERE id = NEW.review_id;
  -- Never notify if liking your own review or review not found
  IF v_owner IS NULL OR v_owner = NEW.user_id THEN RETURN NEW; END IF;
  INSERT INTO notifications (user_id, actor_id, type, review_id, review_title)
  VALUES (v_owner, NEW.user_id, 'review_like', NEW.review_id, v_title);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_review_like ON review_likes;
CREATE TRIGGER trg_notify_review_like
  AFTER INSERT ON review_likes
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_review_like();


-- ── 5. Verify ────────────────────────────────────────────────────
-- Run these SELECTs manually to confirm everything is set up:
--
-- SELECT tablename, policyname FROM pg_policies
--   WHERE tablename IN ('ratings','notifications')
--   ORDER BY tablename, policyname;
--
-- SELECT trigger_name, event_object_table FROM information_schema.triggers
--   WHERE trigger_name IN ('trg_notify_follow','trg_notify_review_like');
