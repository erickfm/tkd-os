-- Pre-set the upcoming testing cycle's dates so Process Testing can roll
-- straight into them instead of guessing a 90-day placeholder window.
ALTER TABLE testing_cycles ADD COLUMN next_start_date TEXT;
ALTER TABLE testing_cycles ADD COLUMN next_end_date TEXT;
ALTER TABLE testing_cycles ADD COLUMN next_testing_date TEXT;

-- Snapshot of a cycle's window, recorded automatically whenever Process
-- Testing rolls the (single, reused) active cycle forward. testing_cycles
-- overwrites its own row in place each rollover, so this is the only record
-- of what a past cycle's dates actually were (e.g. for a "previous cycle"
-- attendance breakdown on a student's record).
CREATE TABLE testing_cycle_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  testing_date TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
