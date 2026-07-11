ALTER TABLE events ADD COLUMN class_credit INTEGER NOT NULL DEFAULT 1 CHECK (class_credit >= 1);
ALTER TABLE events ADD COLUMN posted_at TEXT;
