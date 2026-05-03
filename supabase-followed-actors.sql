-- Tabla para actores/directores seguidos por el usuario
CREATE TABLE IF NOT EXISTS followed_actors (
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_id    INTEGER     NOT NULL,
  actor_name  TEXT        NOT NULL,
  actor_photo TEXT,
  birthday    TEXT,        -- formato YYYY-MM-DD, se guarda al seguir
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, actor_id)
);

ALTER TABLE followed_actors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios gestionan sus propios actores seguidos"
  ON followed_actors FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS followed_actors_user_idx ON followed_actors(user_id);
