-- Store the source system's (MSS) Student ID so legacy data can be re-synced
-- exactly, without fragile name matching. NULL for non-imported students.
ALTER TABLE students ADD COLUMN legacy_id INTEGER;
CREATE INDEX students_legacy_id_idx ON students(legacy_id);
