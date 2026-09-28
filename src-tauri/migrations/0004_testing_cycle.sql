-- Belt testing as a first-class "testing cycle" with a registration list,
-- replacing the old Belt Testing event type. One active cycle at a time.

CREATE TABLE testing_cycles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  start_date TEXT NOT NULL,
  end_date   TEXT NOT NULL,
  is_active  INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (end_date >= start_date)
);

CREATE TABLE testing_registration (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cycle_id   INTEGER NOT NULL REFERENCES testing_cycles(id),
  student_id INTEGER NOT NULL REFERENCES students(id),
  registered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX testing_registration_cycle_student_uniq
  ON testing_registration(cycle_id, student_id);
CREATE INDEX testing_registration_student_idx
  ON testing_registration(student_id);

-- Seed a starting cycle so the tab always has a current cycle to work with.
INSERT INTO testing_cycles (start_date, end_date)
  VALUES (date('now'), date('now', '+2 months'));
