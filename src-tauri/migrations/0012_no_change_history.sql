-- A registered student tested but wasn't promoted ("No Change"). Recorded
-- instead of a rank_history row; the belt they were testing AT is kept for
-- record-keeping (rank_id), and cycle_id links back to the cycle it
-- happened in (nullable defensively, though cycles are never deleted).
CREATE TABLE no_change_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id  INTEGER NOT NULL REFERENCES students(id),
  rank_id     INTEGER NOT NULL REFERENCES belt_ranks(id),
  cycle_id    INTEGER REFERENCES testing_cycles(id),
  test_date   TEXT NOT NULL,
  reason      TEXT NOT NULL CHECK (reason IN ('F','S','BB','CS','ACT','Other')),
  note        TEXT,
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX no_change_history_student_date_idx ON no_change_history(student_id, test_date);
