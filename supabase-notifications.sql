-- =========================================================
-- Notifications system
-- Run in Supabase Dashboard → SQL Editor
-- =========================================================

-- 1. Table
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

CREATE INDEX IF NOT EXISTS notifications_user_id_idx
  ON notifications(user_id, created_at DESC);

-- 2. RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own notifications"
  ON notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users update own notifications"
  ON notifications FOR UPDATE
  USING (auth.uid() = user_id);

-- Triggers run as SECURITY DEFINER so they bypass this,
-- but the policy is needed for any direct inserts.
CREATE POLICY "Actor can insert notifications"
  ON notifications FOR INSERT
  WITH CHECK (auth.uid() = actor_id);

-- 3. Trigger: new follow → notify the followed user
CREATE OR REPLACE FUNCTION public.notify_on_follow()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
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

-- 4. Trigger: review like → notify the review author
CREATE OR REPLACE FUNCTION public.notify_on_review_like()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_owner uuid;
  v_title text;
BEGIN
  SELECT user_id, title INTO v_owner, v_title FROM reviews WHERE id = NEW.review_id;
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
