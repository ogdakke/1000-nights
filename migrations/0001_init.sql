CREATE TABLE IF NOT EXISTS readings (
  id TEXT PRIMARY KEY,
  night INTEGER NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  author TEXT,
  kind TEXT,
  original_url TEXT,
  resolved_url TEXT,
  link_status TEXT NOT NULL DEFAULT 'unverified',
  evidence TEXT,
  UNIQUE(night, position)
);
CREATE INDEX IF NOT EXISTS readings_night ON readings(night, position);
CREATE INDEX IF NOT EXISTS readings_status ON readings(link_status);
CREATE VIRTUAL TABLE IF NOT EXISTS readings_fts USING fts5(title, author, content='readings', content_rowid='rowid');
CREATE TRIGGER IF NOT EXISTS readings_ai AFTER INSERT ON readings BEGIN
  INSERT INTO readings_fts(rowid, title, author) VALUES (new.rowid, new.title, new.author);
END;
CREATE TRIGGER IF NOT EXISTS readings_ad AFTER DELETE ON readings BEGIN
  INSERT INTO readings_fts(readings_fts, rowid, title, author) VALUES ('delete', old.rowid, old.title, old.author);
END;
CREATE TRIGGER IF NOT EXISTS readings_au AFTER UPDATE ON readings BEGIN
  INSERT INTO readings_fts(readings_fts, rowid, title, author) VALUES ('delete', old.rowid, old.title, old.author);
  INSERT INTO readings_fts(rowid, title, author) VALUES (new.rowid, new.title, new.author);
END;
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  github_id INTEGER UNIQUE NOT NULL,
  name TEXT NOT NULL,
  avatar_url TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS progress (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reading_id TEXT NOT NULL REFERENCES readings(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK(status IN ('want_to_read', 'reading', 'read')),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id, reading_id)
);
