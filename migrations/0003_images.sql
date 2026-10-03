ALTER TABLE readings ADD COLUMN author_slug TEXT;
ALTER TABLE readings ADD COLUMN title_slug TEXT;
ALTER TABLE readings ADD COLUMN image_url TEXT;
ALTER TABLE readings ADD COLUMN image_source_url TEXT;
ALTER TABLE readings ADD COLUMN image_credit TEXT;
ALTER TABLE readings ADD COLUMN image_alt TEXT;
CREATE INDEX IF NOT EXISTS readings_work_slug ON readings(author_slug, title_slug);
