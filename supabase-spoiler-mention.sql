-- ── CAMBIO 1: Spoiler column ──────────────────────────────────────────────────
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS has_spoiler BOOLEAN DEFAULT false;

-- ── CAMBIO 2: Mention notification type ──────────────────────────────────────
-- No schema change needed — uses existing notifications table with type='mention'
-- Columns used: user_id, actor_id, type, review_id, review_title
-- (same columns already used by review_like / review_comment / comment_reply)
