-- Data capture for the Reports tab. Additive only: existing rows are untouched.

-- Gender, for the demographics report. NULL = not recorded yet.
ALTER TABLE students ADD COLUMN gender TEXT CHECK (gender IN ('Male', 'Female', 'Other'));

-- Date a student was deactivated. Set by setStudentActive(); cleared on
-- reactivation. NULL for anyone deactivated before this existed -- reports fall
-- back to their last attended class for those.
ALTER TABLE students ADD COLUMN left_date TEXT;

-- One row per trial. "End trial" on the Trials page clears
-- students.trial_start_date, which used to erase all evidence a trial happened;
-- this keeps it so trial -> member conversion can be measured.
CREATE TABLE trial_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES students(id),
  start_date TEXT NOT NULL,
  ended_date TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX trial_history_student_idx ON trial_history(student_id);

-- Trials in progress right now.
INSERT INTO trial_history (student_id, start_date)
  SELECT id, trial_start_date FROM students WHERE trial_start_date IS NOT NULL;

-- Optional schedule details per class slot (class type x weekday), edited in
-- Settings. Capacity lets the class-slot report show how full each class runs.
CREATE TABLE class_slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_type TEXT NOT NULL,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time TEXT,
  capacity INTEGER CHECK (capacity IS NULL OR capacity > 0),
  UNIQUE (class_type, weekday)
);
