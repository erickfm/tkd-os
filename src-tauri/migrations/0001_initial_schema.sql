-- TKD OS — initial schema
-- See docs/schema.md for the full spec.

PRAGMA foreign_keys = ON;

CREATE TABLE belt_ranks (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  track               TEXT    NOT NULL CHECK (track IN ('tiger','regular')),
  sort_order          INTEGER NOT NULL,
  name                TEXT    NOT NULL,
  class_group         TEXT    CHECK (class_group IS NULL OR class_group IN ('jr-wy','jr-gbp','jr-brb')),
  degree              TEXT,
  level               TEXT,
  color_hex           TEXT    NOT NULL,
  text_hex            TEXT    NOT NULL,
  border_hex          TEXT    NOT NULL,
  is_graduation_rank  INTEGER NOT NULL DEFAULT 0 CHECK (is_graduation_rank IN (0,1)),
  next_rank_id        INTEGER REFERENCES belt_ranks(id)
);
CREATE UNIQUE INDEX belt_ranks_track_sort_uniq ON belt_ranks(track, sort_order);
CREATE INDEX belt_ranks_class_group_idx ON belt_ranks(class_group);

CREATE TABLE students (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name          TEXT    NOT NULL,
  last_name           TEXT    NOT NULL,
  date_of_birth       TEXT,
  phone               TEXT,
  email               TEXT,
  emergency_contact   TEXT,
  track               TEXT    NOT NULL DEFAULT 'regular' CHECK (track IN ('tiger','regular')),
  age_group           TEXT    NOT NULL DEFAULT 'jr'      CHECK (age_group IN ('jr','adult')),
  belt_rank_id        INTEGER NOT NULL REFERENCES belt_ranks(id),
  belt_size           TEXT,
  join_date           TEXT    NOT NULL,
  is_starter_student  INTEGER NOT NULL DEFAULT 0 CHECK (is_starter_student IN (0,1)),
  notes               TEXT,
  is_active           INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at          TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX students_name_idx       ON students(last_name, first_name);
CREATE INDEX students_track_idx      ON students(track);
CREATE INDEX students_age_group_idx  ON students(age_group);
CREATE INDEX students_belt_rank_idx  ON students(belt_rank_id);
CREATE INDEX students_active_idx     ON students(is_active);

CREATE TABLE events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  event_date    TEXT    NOT NULL,
  event_time    TEXT,
  event_type    TEXT    NOT NULL CHECK (event_type IN ('Belt Testing','Seminar','Tournament','Demo','Camp','Other')),
  location      TEXT,
  notes         TEXT,
  is_active     INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at    TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX events_date_idx ON events(event_date);
CREATE INDEX events_type_idx ON events(event_type);

CREATE TABLE rank_history (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id            INTEGER NOT NULL REFERENCES students(id),
  from_rank_id          INTEGER REFERENCES belt_ranks(id),
  to_rank_id            INTEGER NOT NULL REFERENCES belt_ranks(id),
  track_at_time         TEXT    NOT NULL CHECK (track_at_time IN ('tiger','regular')),
  promotion_date        TEXT    NOT NULL,
  note                  TEXT,
  promoted_at_event_id  INTEGER REFERENCES events(id),
  created_at            TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX rank_history_student_date_idx ON rank_history(student_id, promotion_date);
CREATE INDEX rank_history_event_idx        ON rank_history(promoted_at_event_id);

CREATE TABLE student_progress (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id          INTEGER NOT NULL UNIQUE REFERENCES students(id),
  green_stripe        INTEGER NOT NULL DEFAULT 0 CHECK (green_stripe IN (0,1)),
  blue_stripe         INTEGER NOT NULL DEFAULT 0 CHECK (blue_stripe IN (0,1)),
  orange_stripe       INTEGER NOT NULL DEFAULT 0 CHECK (orange_stripe IN (0,1)),
  red_stripe          INTEGER NOT NULL DEFAULT 0 CHECK (red_stripe IN (0,1)),
  permission_to_test  INTEGER NOT NULL DEFAULT 0 CHECK (permission_to_test IN (0,1)),
  updated_at          TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE attendance_sessions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  session_date  TEXT    NOT NULL,
  class_type    TEXT    NOT NULL CHECK (class_type IN ('tiger','jr-wy','jr-gbp','jr-brb','adult')),
  notes         TEXT,
  created_at    TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX attendance_sessions_date_class_uniq ON attendance_sessions(session_date, class_type);
CREATE INDEX attendance_sessions_date_idx       ON attendance_sessions(session_date);
CREATE INDEX attendance_sessions_class_type_idx ON attendance_sessions(class_type);

CREATE TABLE attendance_records (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  INTEGER NOT NULL REFERENCES attendance_sessions(id),
  student_id  INTEGER NOT NULL REFERENCES students(id),
  status      TEXT    NOT NULL DEFAULT 'unmarked' CHECK (status IN ('present','absent','unmarked')),
  created_at  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX attendance_records_session_student_uniq ON attendance_records(session_id, student_id);
CREATE INDEX attendance_records_student_status_idx ON attendance_records(student_id, status);
CREATE INDEX attendance_records_session_idx        ON attendance_records(session_id);

CREATE TABLE event_roster (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id       INTEGER NOT NULL REFERENCES events(id),
  student_id     INTEGER NOT NULL REFERENCES students(id),
  registered_at  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notes          TEXT
);
CREATE UNIQUE INDEX event_roster_event_student_uniq ON event_roster(event_id, student_id);
CREATE INDEX event_roster_student_idx ON event_roster(student_id);

CREATE TABLE starter_courses (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  start_date  TEXT    NOT NULL,
  end_date    TEXT    NOT NULL CHECK (end_date >= start_date),
  notes       TEXT,
  is_active   INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX starter_courses_end_date_idx ON starter_courses(end_date);

CREATE TABLE starter_course_enrollment (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id   INTEGER NOT NULL REFERENCES starter_courses(id),
  student_id  INTEGER NOT NULL REFERENCES students(id),
  enrolled_at TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX starter_course_enrollment_course_student_uniq ON starter_course_enrollment(course_id, student_id);
CREATE INDEX starter_course_enrollment_student_idx ON starter_course_enrollment(student_id);

-- Seed: Tiger Cubs track
INSERT INTO belt_ranks (track, sort_order, name, class_group, degree, level, color_hex, text_hex, border_hex, is_graduation_rank) VALUES
  ('tiger', 0, 'Tiger Cub White Belt',         NULL, NULL, NULL, '#FFFFFF', '#1F2937', '#D1D5DB', 0),
  ('tiger', 1, 'Tiger Cub Yellow Stripe',      NULL, NULL, NULL, '#FEF08A', '#713F12', '#CA8A04', 0),
  ('tiger', 2, 'Tiger Cub Green Stripe',       NULL, NULL, NULL, '#BBF7D0', '#14532D', '#15803D', 0),
  ('tiger', 3, 'Tiger Cub Blue Stripe',        NULL, NULL, NULL, '#BFDBFE', '#1E3A8A', '#1D4ED8', 0),
  ('tiger', 4, 'Tiger Cub Purple Stripe',      NULL, NULL, NULL, '#DDD6FE', '#4C1D95', '#6D28D9', 0),
  ('tiger', 5, 'Tiger Cub Brown Stripe',       NULL, NULL, NULL, '#FED7AA', '#7C2D12', '#9A3412', 0),
  ('tiger', 6, 'Tiger Cub Red Stripe',         NULL, NULL, NULL, '#FECACA', '#7F1D1D', '#B91C1C', 0),
  ('tiger', 7, 'Tiger Cub Black Stripe',       NULL, NULL, NULL, '#1F2937', '#FBBF24', '#F59E0B', 1);

-- Seed: Jr. & Adult track
INSERT INTO belt_ranks (track, sort_order, name, class_group, degree, level, color_hex, text_hex, border_hex, is_graduation_rank) VALUES
  ('regular',  0, 'White Belt',           'jr-wy',  NULL,         NULL, '#FFFFFF', '#1F2937', '#E5E7EB', 0),
  ('regular',  1, 'Yellow Belt',          'jr-wy',  NULL,         NULL, '#FDE047', '#422006', '#CA8A04', 0),
  ('regular',  2, 'Green Belt',           'jr-gbp', NULL,         NULL, '#97C459', '#173404', '#547023', 0),
  ('regular',  3, 'Sr. Green Belt',       'jr-gbp', NULL,         NULL, '#65A30D', '#FFFFFF', '#3F6212', 0),
  ('regular',  4, 'Blue Belt',            'jr-gbp', NULL,         NULL, '#3B82F6', '#FFFFFF', '#1E40AF', 0),
  ('regular',  5, 'Sr. Blue Belt',        'jr-gbp', NULL,         NULL, '#1D4ED8', '#FFFFFF', '#1E3A8A', 0),
  ('regular',  6, 'Purple Belt',          'jr-gbp', NULL,         NULL, '#8B5CF6', '#FFFFFF', '#5B21B6', 0),
  ('regular',  7, 'Sr. Purple Belt',      'jr-gbp', NULL,         NULL, '#6D28D9', '#FFFFFF', '#4C1D95', 0),
  ('regular',  8, 'Brown Belt L1',        'jr-brb', NULL,         'L1', '#92400E', '#FFFFFF', '#451A03', 0),
  ('regular',  9, 'Brown Belt L2',        'jr-brb', NULL,         'L2', '#92400E', '#FFFFFF', '#451A03', 0),
  ('regular', 10, 'Brown Belt L3',        'jr-brb', NULL,         'L3', '#92400E', '#FFFFFF', '#451A03', 0),
  ('regular', 11, 'Red Belt L1',          'jr-brb', NULL,         'L1', '#DC2626', '#FFFFFF', '#7F1D1D', 0),
  ('regular', 12, 'Red Belt L2',          'jr-brb', NULL,         'L2', '#DC2626', '#FFFFFF', '#7F1D1D', 0),
  ('regular', 13, 'Red Belt L3',          'jr-brb', NULL,         'L3', '#DC2626', '#FFFFFF', '#7F1D1D', 0),
  ('regular', 14, '1st Degree Black L1',  'jr-brb', '1st Degree', 'L1', '#000000', '#FFFFFF', '#4B5563', 0),
  ('regular', 15, '1st Degree Black L2',  'jr-brb', '1st Degree', 'L2', '#000000', '#FFFFFF', '#4B5563', 0),
  ('regular', 16, '1st Degree Black L3',  'jr-brb', '1st Degree', 'L3', '#000000', '#FFFFFF', '#4B5563', 0),
  ('regular', 17, '1st Degree Black L4',  'jr-brb', '1st Degree', 'L4', '#000000', '#FFFFFF', '#4B5563', 0),
  ('regular', 18, '2nd Degree Black L1',  'jr-brb', '2nd Degree', 'L1', '#000000', '#FFFFFF', '#4B5563', 0),
  ('regular', 19, '2nd Degree Black L2',  'jr-brb', '2nd Degree', 'L2', '#000000', '#FFFFFF', '#4B5563', 0),
  ('regular', 20, '2nd Degree Black L3',  'jr-brb', '2nd Degree', 'L3', '#000000', '#FFFFFF', '#4B5563', 0),
  ('regular', 21, '2nd Degree Black L4',  'jr-brb', '2nd Degree', 'L4', '#000000', '#FFFFFF', '#4B5563', 0),
  ('regular', 22, '3rd Degree Black L1',  'jr-brb', '3rd Degree', 'L1', '#000000', '#FFFFFF', '#4B5563', 0),
  ('regular', 23, '3rd Degree Black L2',  'jr-brb', '3rd Degree', 'L2', '#000000', '#FFFFFF', '#4B5563', 0),
  ('regular', 24, '3rd Degree Black L3',  'jr-brb', '3rd Degree', 'L3', '#000000', '#FFFFFF', '#4B5563', 0),
  ('regular', 25, '3rd Degree Black L4',  'jr-brb', '3rd Degree', 'L4', '#000000', '#FFFFFF', '#4B5563', 0),
  ('regular', 26, '4th Degree Black',     'jr-brb', '4th Degree', NULL, '#000000', '#FFFFFF', '#4B5563', 0),
  ('regular', 27, '5th Degree Black',     'jr-brb', '5th Degree', NULL, '#000000', '#FFFFFF', '#4B5563', 0),
  ('regular', 28, '6th Degree Black',     'jr-brb', '6th Degree', NULL, '#000000', '#FFFFFF', '#4B5563', 0),
  ('regular', 29, '7th Degree Black',     'jr-brb', '7th Degree', NULL, '#000000', '#FFFFFF', '#4B5563', 0),
  ('regular', 30, '8th Degree Black',     'jr-brb', '8th Degree', NULL, '#000000', '#FFFFFF', '#4B5563', 0),
  ('regular', 31, '9th Degree Black',     'jr-brb', '9th Degree', NULL, '#000000', '#FFFFFF', '#4B5563', 0);

-- Link each belt to its next rank (NULL at the top of each track).
UPDATE belt_ranks
SET next_rank_id = (
  SELECT b2.id
  FROM belt_ranks b2
  WHERE b2.track = belt_ranks.track
    AND b2.sort_order = belt_ranks.sort_order + 1
);
