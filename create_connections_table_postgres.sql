-- Tabla de conexiones del portal en PostgreSQL/Supabase.
-- Esta tabla guarda las credenciales de las bases administradas por el portal.

CREATE TABLE IF NOT EXISTS connections (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  host VARCHAR(255) NOT NULL,
  port INTEGER NOT NULL,
  "user" VARCHAR(120) NOT NULL,
  password TEXT NOT NULL,
  database_name VARCHAR(120) NOT NULL,
  engine VARCHAR(30) NOT NULL DEFAULT 'postgres',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT connections_engine_check
    CHECK (engine IN ('postgres', 'postgresql', 'mysql', 'sqlserver'))
);

CREATE INDEX IF NOT EXISTS idx_connections_engine ON connections (engine);
CREATE INDEX IF NOT EXISTS idx_connections_name ON connections (name);
