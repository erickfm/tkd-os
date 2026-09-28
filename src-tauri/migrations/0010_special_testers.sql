CREATE TABLE special_testers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id  INTEGER NOT NULL REFERENCES students(id),
  test_date   TEXT    NOT NULL,
  tested      INTEGER NOT NULL DEFAULT 0 CHECK (tested IN (0,1)),
  notes       TEXT,
  created_at  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX special_testers_student_uniq ON special_testers(student_id);
CREATE INDEX special_testers_date_idx ON special_testers(test_date);
