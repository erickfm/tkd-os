# Taekwondo Dojang Manager — Data Schema

Complete reference for all tables, fields, types, constraints, and relationships needed to rebuild this program from scratch.

---

## Table of Contents

1. [students](#1-students)
2. [belt\_ranks](#2-belt_ranks)
3. [rank\_history](#3-rank_history)
4. [student\_progress](#4-student_progress)
5. [attendance\_sessions](#5-attendance_sessions)
6. [attendance\_records](#6-attendance_records)
7. [events](#7-events)
8. [event\_roster](#8-event_roster)
9. [starter\_courses](#9-starter_courses)
10. [starter\_course\_enrollment](#10-starter_course_enrollment)
11. [testing\_cycles](#11-testing_cycles)
12. [testing\_registration](#12-testing_registration)
13. [Enumerations & Lookup Values](#13-enumerations--lookup-values)
14. [Relationships Diagram](#14-relationships-diagram)
15. [Business Rules & Constraints](#15-business-rules--constraints)
16. [Indexes](#16-indexes)

---

## 1. `students`

Core student profile. One row per student.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | INTEGER | NOT NULL | autoincrement | Primary key |
| `first_name` | VARCHAR(100) | NOT NULL | — | Student first name |
| `last_name` | VARCHAR(100) | NOT NULL | — | Student last name |
| `date_of_birth` | DATE | NULL | — | Used for reference; age group is manually set |
| `phone` | VARCHAR(30) | NULL | — | Student or guardian primary phone |
| `email` | VARCHAR(255) | NULL | — | Student or guardian email |
| `guardian1_name` | TEXT | NULL | — | Guardian 1 name |
| `guardian1_phone` | TEXT | NULL | — | Guardian 1 phone |
| `guardian1_email` | TEXT | NULL | — | Guardian 1 email |
| `guardian2_name` | TEXT | NULL | — | Guardian 2 name |
| `guardian2_phone` | TEXT | NULL | — | Guardian 2 phone |
| `guardian2_email` | TEXT | NULL | — | Guardian 2 email |
| `emergency_contact` | VARCHAR(255) | NULL | — | Name and phone of emergency contact |
| `track` | ENUM | NOT NULL | `'regular'` | See [Track](#track) — `'tiger'` or `'regular'` |
| `age_group` | ENUM | NOT NULL | `'jr'` | See [Age Group](#age-group) — `'jr'` or `'adult'`; ignored when track = `'tiger'` |
| `belt_rank_id` | INTEGER | NOT NULL | — | FK → `belt_ranks.id`; current belt |
| `belt_size` | VARCHAR(10) | NULL | — | Belt size (e.g. `'0'`, `'00'`, `'4'`); see [Belt Sizes](#belt-sizes) |
| `join_date` | DATE | NOT NULL | today | Date student joined the dojang |
| `is_starter_student` | BOOLEAN | NOT NULL | `FALSE` | Whether student is/was on a trial (kept in sync with `trial_start_date`) |
| `trial_start_date` | DATE | NULL | — | Start of the student's 6-week trial; trial end is derived (+42 days). NULL = not on a trial |
| `notes` | TEXT | NULL | — | Free-form notes (medical info, goals, parent name, etc.) |
| `is_active` | BOOLEAN | NOT NULL | `TRUE` | Soft-delete flag. For legacy imports, set from the MSS `Activity Level` (1 = active) — not the termination date |
| `legacy_id` | INTEGER | NULL | — | Source MSS `Student ID` for imported students (lets legacy data re-sync exactly); NULL for app-created students |
| `created_at` | TIMESTAMP | NOT NULL | now() | Record creation timestamp |
| `updated_at` | TIMESTAMP | NOT NULL | now() | Last update timestamp |

**Primary Key:** `id`

**Foreign Keys:**
- `belt_rank_id` → `belt_ranks.id`

---

## 2. `belt_ranks`

Master list of all belt ranks in both tracks. Seeded at setup; not edited by users.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | INTEGER | NOT NULL | autoincrement | Primary key |
| `track` | ENUM | NOT NULL | — | `'tiger'` or `'regular'` |
| `sort_order` | INTEGER | NOT NULL | — | Ascending rank order within track (0 = lowest) |
| `name` | VARCHAR(100) | NOT NULL | — | Display name (e.g. `'Sr. Green Belt'`, `'Tiger Cub Blue Stripe'`) |
| `class_group` | ENUM | NULL | — | Attendance class this belt belongs to; see [Class Groups](#class-groups); NULL for tiger track |
| `degree` | VARCHAR(50) | NULL | — | Degree label for black belts (e.g. `'1st Degree'`, `'2nd Degree'`); NULL for color belts |
| `level` | VARCHAR(10) | NULL | — | Level suffix for multi-level belts (e.g. `'L1'`, `'L2'`, `'L3'`, `'L4'`); NULL where not applicable |
| `color_hex` | VARCHAR(7) | NOT NULL | — | Belt color for UI display (e.g. `'#97C459'`) |
| `text_hex` | VARCHAR(7) | NOT NULL | — | Text color for contrast on the badge (e.g. `'#173404'`) |
| `border_hex` | VARCHAR(7) | NOT NULL | — | Border color for the badge |
| `is_graduation_rank` | BOOLEAN | NOT NULL | `FALSE` | TRUE only for Tiger Cub Black Stripe — triggers graduation flow to regular track |
| `next_rank_id` | INTEGER | NULL | — | FK → `belt_ranks.id`; the rank a student promotes to; NULL at top rank |

**Primary Key:** `id`

**Foreign Keys:**
- `next_rank_id` → `belt_ranks.id`

**Unique Constraint:** `(track, sort_order)`

### Seed Data — Tiger Cubs Track

| sort_order | name | is_graduation_rank |
|---|---|---|
| 0 | Tiger Cub White Belt | FALSE |
| 1 | Tiger Cub Yellow Stripe | FALSE |
| 2 | Tiger Cub Green Stripe | FALSE |
| 3 | Tiger Cub Blue Stripe | FALSE |
| 4 | Tiger Cub Purple Stripe | FALSE |
| 5 | Tiger Cub Brown Stripe | FALSE |
| 6 | Tiger Cub Red Stripe | FALSE |
| 7 | Tiger Cub Black Stripe | **TRUE** |

### Seed Data — Jr. & Adult Track

| sort_order | name | class_group | degree | level |
|---|---|---|---|---|
| 0 | White Belt | jr-wy | NULL | NULL |
| 1 | Yellow Belt | jr-wy | NULL | NULL |
| 2 | Green Belt | jr-gbp | NULL | NULL |
| 3 | Sr. Green Belt | jr-gbp | NULL | NULL |
| 4 | Blue Belt | jr-gbp | NULL | NULL |
| 5 | Sr. Blue Belt | jr-gbp | NULL | NULL |
| 6 | Purple Belt | jr-gbp | NULL | NULL |
| 7 | Sr. Purple Belt | jr-gbp | NULL | NULL |
| 8 | Brown Belt L1 | jr-brb | NULL | L1 |
| 9 | Brown Belt L2 | jr-brb | NULL | L2 |
| 10 | Brown Belt L3 | jr-brb | NULL | L3 |
| 11 | Red Belt L1 | jr-brb | NULL | L1 |
| 12 | Red Belt L2 | jr-brb | NULL | L2 |
| 13 | Red Belt L3 | jr-brb | NULL | L3 |
| 14 | 1st Degree Black L1 | jr-brb | 1st Degree | L1 |
| 15 | 1st Degree Black L2 | jr-brb | 1st Degree | L2 |
| 16 | 1st Degree Black L3 | jr-brb | 1st Degree | L3 |
| 17 | 1st Degree Black L4 | jr-brb | 1st Degree | L4 |
| 18 | 2nd Degree Black L1 | jr-brb | 2nd Degree | L1 |
| 19 | 2nd Degree Black L2 | jr-brb | 2nd Degree | L2 |
| 20 | 2nd Degree Black L3 | jr-brb | 2nd Degree | L3 |
| 21 | 2nd Degree Black L4 | jr-brb | 2nd Degree | L4 |
| 22 | 3rd Degree Black L1 | jr-brb | 3rd Degree | L1 |
| 23 | 3rd Degree Black L2 | jr-brb | 3rd Degree | L2 |
| 24 | 3rd Degree Black L3 | jr-brb | 3rd Degree | L3 |
| 25 | 3rd Degree Black L4 | jr-brb | 3rd Degree | L4 |
| 26 | 4th Degree Black | jr-brb | 4th Degree | NULL |
| 27 | 5th Degree Black | jr-brb | 5th Degree | NULL |
| 28 | 6th Degree Black | jr-brb | 6th Degree | NULL |
| 29 | 7th Degree Black | jr-brb | 7th Degree | NULL |
| 30 | 8th Degree Black | jr-brb | 8th Degree | NULL |
| 31 | 9th Degree Black | jr-brb | 9th Degree | NULL |

---

## 3. `rank_history`

Immutable log of every promotion and graduation. One row per promotion event per student.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | INTEGER | NOT NULL | autoincrement | Primary key |
| `student_id` | INTEGER | NOT NULL | — | FK → `students.id` |
| `from_rank_id` | INTEGER | NULL | — | FK → `belt_ranks.id`; belt before promotion; NULL for first-ever record |
| `to_rank_id` | INTEGER | NOT NULL | — | FK → `belt_ranks.id`; belt achieved |
| `track_at_time` | ENUM | NOT NULL | — | Track (`'tiger'` or `'regular'`) at time of promotion, in case student later graduates |
| `promotion_date` | DATE | NOT NULL | — | Date promotion occurred |
| `note` | VARCHAR(500) | NULL | — | Free-form note (testing score, ceremony info, etc.) |
| `promoted_at_event_id` | INTEGER | NULL | — | FK → `events.id`; the testing event, if applicable |
| `created_at` | TIMESTAMP | NOT NULL | now() | Record creation timestamp |
| `updated_at` | TIMESTAMP | NOT NULL | now() | Last update timestamp (for edits) |

**Primary Key:** `id`

**Foreign Keys:**
- `student_id` → `students.id`
- `from_rank_id` → `belt_ranks.id`
- `to_rank_id` → `belt_ranks.id`
- `promoted_at_event_id` → `events.id`

---

## 4. `student_progress`

Tracks progress stripes and Permission to Test (PTT) status for the current belt cycle. Reset to all FALSE on every promotion.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | INTEGER | NOT NULL | autoincrement | Primary key |
| `student_id` | INTEGER | NOT NULL | — | FK → `students.id` (one row per student) |
| `green_stripe` | BOOLEAN | NOT NULL | `FALSE` | Green stripe earned (regular track only) |
| `blue_stripe` | BOOLEAN | NOT NULL | `FALSE` | Blue stripe earned (regular track only) |
| `orange_stripe` | BOOLEAN | NOT NULL | `FALSE` | Orange stripe earned (regular track only) |
| `red_stripe` | BOOLEAN | NOT NULL | `FALSE` | Red stripe earned (regular track only) |
| `permission_to_test` | BOOLEAN | NOT NULL | `FALSE` | PTT sticker earned (all tracks) |
| `updated_at` | TIMESTAMP | NOT NULL | now() | Last update timestamp |

**Primary Key:** `id`

**Unique Constraint:** `student_id` (one progress row per student)

**Foreign Keys:**
- `student_id` → `students.id`

> **Note:** Tiger Cubs are only eligible for `permission_to_test`. The four stripe columns are always FALSE for tiger track students.

---

## 5. `attendance_sessions`

One row per class session held (date + class type combination).

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | INTEGER | NOT NULL | autoincrement | Primary key |
| `session_date` | DATE | NOT NULL | — | Date of the class |
| `class_type` | ENUM | NOT NULL | — | See [Class Types](#class-types) |
| `notes` | VARCHAR(500) | NULL | — | Optional session notes (topic covered, guest instructor, etc.) |
| `created_at` | TIMESTAMP | NOT NULL | now() | Record creation timestamp |

**Primary Key:** `id`

**Unique Constraint:** `(session_date, class_type)` — one session per class type per day

---

## 6. `attendance_records`

One row per student per session. Records individual presence or absence.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | INTEGER | NOT NULL | autoincrement | Primary key |
| `session_id` | INTEGER | NOT NULL | — | FK → `attendance_sessions.id` |
| `student_id` | INTEGER | NOT NULL | — | FK → `students.id` |
| `status` | ENUM | NOT NULL | `'unmarked'` | `'present'`, `'absent'`, or `'unmarked'` |
| `created_at` | TIMESTAMP | NOT NULL | now() | Record creation timestamp |
| `updated_at` | TIMESTAMP | NOT NULL | now() | Last update timestamp |

**Primary Key:** `id`

**Unique Constraint:** `(session_id, student_id)` — one record per student per session

**Foreign Keys:**
- `session_id` → `attendance_sessions.id`
- `student_id` → `students.id`

---

## 7. `events`

Events such as belt testings, seminars, tournaments, demos, and camps.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | INTEGER | NOT NULL | autoincrement | Primary key |
| `name` | VARCHAR(255) | NOT NULL | — | Event name (e.g. `'Spring Belt Testing 2025'`) |
| `event_date` | DATE | NOT NULL | — | Date of the event |
| `event_time` | TIME | NULL | — | Start time |
| `event_type` | ENUM | NOT NULL | — | See [Event Types](#event-types) |
| `location` | VARCHAR(255) | NULL | — | Venue or location name |
| `notes` | TEXT | NULL | — | Description, requirements, what to bring, etc. |
| `is_active` | BOOLEAN | NOT NULL | `TRUE` | Soft-delete flag |
| `created_at` | TIMESTAMP | NOT NULL | now() | Record creation timestamp |
| `updated_at` | TIMESTAMP | NOT NULL | now() | Last update timestamp |

**Primary Key:** `id`

---

## 8. `event_roster`

Enrollment of students in events. Supports add/remove before or after the event.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | INTEGER | NOT NULL | autoincrement | Primary key |
| `event_id` | INTEGER | NOT NULL | — | FK → `events.id` |
| `student_id` | INTEGER | NOT NULL | — | FK → `students.id` |
| `registered_at` | TIMESTAMP | NOT NULL | now() | When the student was added to the roster |
| `notes` | VARCHAR(255) | NULL | — | Per-student event notes (e.g. waiver status) |

**Primary Key:** `id`

**Unique Constraint:** `(event_id, student_id)` — a student can only be on a roster once per event

**Foreign Keys:**
- `event_id` → `events.id`
- `student_id` → `students.id`

---

## 9. `starter_courses`

Dedicated short-term introductory courses with a defined start and end date.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | INTEGER | NOT NULL | autoincrement | Primary key |
| `name` | VARCHAR(255) | NOT NULL | — | Course name (e.g. `'Spring 2025 Starter'`) |
| `start_date` | DATE | NOT NULL | — | First day of the course |
| `end_date` | DATE | NOT NULL | — | Last day of the course |
| `notes` | TEXT | NULL | — | Goals, focus areas, instructor notes |
| `is_active` | BOOLEAN | NOT NULL | `TRUE` | Soft-delete flag |
| `created_at` | TIMESTAMP | NOT NULL | now() | Record creation timestamp |
| `updated_at` | TIMESTAMP | NOT NULL | now() | Last update timestamp |

**Primary Key:** `id`

**Check Constraint:** `end_date >= start_date`

**Computed field (not stored):** `status` — derived as `'active'` if `end_date >= today`, else `'completed'`

---

## 10. `starter_course_enrollment`

Junction table linking students to starter courses.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | INTEGER | NOT NULL | autoincrement | Primary key |
| `course_id` | INTEGER | NOT NULL | — | FK → `starter_courses.id` |
| `student_id` | INTEGER | NOT NULL | — | FK → `students.id` |
| `enrolled_at` | TIMESTAMP | NOT NULL | now() | When student was added to the course |

**Primary Key:** `id`

**Unique Constraint:** `(course_id, student_id)` — a student can only be enrolled once per course

**Foreign Keys:**
- `course_id` → `starter_courses.id`
- `student_id` → `students.id`

---

## 11. `testing_cycles`

The current belt-testing period. The app works against a single active cycle at a time; `getCurrentCycle()` returns the most recent `is_active = 1` row (one is seeded by migration 0004).

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | INTEGER | NOT NULL | autoincrement | Primary key |
| `start_date` | DATE | NOT NULL | — | First day of the testing cycle |
| `end_date` | DATE | NOT NULL | — | Last day of the testing cycle |
| `testing_date` | DATE | NULL | — | Day the testing happens; class counts use start→testing_date (or end if unset) |
| `is_active` | BOOLEAN | NOT NULL | `TRUE` | Marks the current cycle |
| `created_at` | TIMESTAMP | NOT NULL | now() | Record creation timestamp |
| `updated_at` | TIMESTAMP | NOT NULL | now() | Last update timestamp |

**Primary Key:** `id`

**Check Constraint:** `end_date >= start_date`

---

## 12. `testing_registration`

Students registered to test in a given cycle (the "registered to test" list).

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | INTEGER | NOT NULL | autoincrement | Primary key |
| `cycle_id` | INTEGER | NOT NULL | — | FK → `testing_cycles.id` |
| `student_id` | INTEGER | NOT NULL | — | FK → `students.id` |
| `registered_at` | TIMESTAMP | NOT NULL | now() | When the student was registered |

**Primary Key:** `id`

**Unique Constraint:** `(cycle_id, student_id)` — a student registers once per cycle

**Foreign Keys:**
- `cycle_id` → `testing_cycles.id`
- `student_id` → `students.id`

> **Promote all:** promoting a cycle calls the single-student promotion flow for each registered student (lowest belt first), then clears the cycle's registrations so no one is promoted twice. Attendance shown per student is the count of `present` records between the cycle's `start_date` and `end_date`. The TSV export columns are **Name, Age, Current Belt, Testing For** (ordered by belt `sort_order`).

---

## 12b. `inventory_sections` / `inventory_items`

Equipment inventory, grouped into sections (migration 0008 seeds six: Sparring Gear, Uniforms, Shirts, Boards, Cub Belts, Belts).

- **`inventory_sections`**: `id`, `name`, `sort_order`, `updated_at` (bumped whenever any of its items change — drives the per-section "last updated").
- **`inventory_items`**: `id`, `section_id` → `inventory_sections.id`, `name` (product, e.g. Helmet / Board / Belt color), `size` (variant, nullable — e.g. `S`, `0000`, `Yellow Stripe`, `1`), `in_stock` (≥0), `to_order` (≥0), `sort_order`, `updated_at`.

Items are user-editable (add/remove, edit counts). Each section exports to `.xlsx` (write-excel-file → `write_bytes_file` Tauri command → native Save dialog).

## 13. Enumerations & Lookup Values

### Track

| Value | Description |
|---|---|
| `tiger` | Tiger Cubs program (ages 4–5) |
| `regular` | Jr. & Adult Track |

### Age Group

| Value | Description | Applies to |
|---|---|---|
| `jr` | Junior student | `regular` track only |
| `adult` | Adult student — set manually per student, not age-based | `regular` track only |

> Tiger Cubs (`track = 'tiger'`) do not use `age_group`. The field is stored but ignored in filtering.

### Class Types

Used in `attendance_sessions.class_type` and to drive attendance filtering logic.

| Value | Label | Eligible Tracks | Eligible Age Groups | Eligible Belt Class Groups |
|---|---|---|---|---|
| `tiger` | Tiger Cubs | `tiger` | N/A | N/A |
| `jr-wy` | Jr. White & Yellow | `regular` | `jr` | `jr-wy` |
| `jr-gbp` | Jr. Green, Blue & Purple | `regular` | `jr` | `jr-gbp` |
| `jr-brb` | Jr. Brown, Red & Black | `regular` | `jr` | `jr-brb` |
| `adult` | Adult | `regular` | `adult` | `jr-wy`, `jr-gbp`, `jr-brb` (all) |

**Cross-class eligibility (students may attend more than one class):**
- **`jr-wy`** also includes **Tiger Cub Red Stripe** students (they may attend either the Tiger or the Jr. W&Y class).
- **`adult`** also includes **any active student aged 12+** (by `date_of_birth`), in addition to regular `adult`-age-group students.

### Class Groups

Used in `belt_ranks.class_group` to assign each regular-track belt to its attendance class.

| Value | Belts Included |
|---|---|
| `jr-wy` | White Belt, Yellow Belt |
| `jr-gbp` | Green Belt, Sr. Green Belt, Blue Belt, Sr. Blue Belt, Purple Belt, Sr. Purple Belt |
| `jr-brb` | Brown Belt L1–L3, Red Belt L1–L3, all Black Belt levels |

### Event Types

Belt testing is no longer an event type — it now lives in the **testing cycle** feature (see tables 11 & 12). The DB `CHECK` from migration 0001 still permits the legacy `'Belt Testing'` string, but it is no longer offered in the UI.

| Value |
|---|
| `Seminar` |
| `Tournament` |
| `Demo` |
| `Camp` |
| `Other` |

### Attendance Status

| Value | Description |
|---|---|
| `present` | Student attended |
| `absent` | Student was absent |
| `unmarked` | Not yet recorded |

### Belt Sizes

Ordered smallest to largest. Stored as VARCHAR to preserve leading zeros.

`00000`, `0000`, `000`, `00`, `0`, `1`, `2`, `3`, `4`, `5`, `6`, `7`, `8`, `9`, `10`

---

## 14. Relationships Diagram

```
students ─────────────────────── belt_ranks
  │  (belt_rank_id → id)           │
  │                                 │ (next_rank_id → id, self-ref)
  │
  ├── student_progress (1:1)
  │
  ├── rank_history (1:many)
  │     ├── from_rank_id → belt_ranks.id
  │     ├── to_rank_id   → belt_ranks.id
  │     └── promoted_at_event_id → events.id (nullable)
  │
  ├── attendance_records (many:many via session)
  │     └── session_id → attendance_sessions.id
  │
  ├── event_roster (many:many via event)
  │     └── event_id → events.id
  │
  └── starter_course_enrollment (many:many via course)
        └── course_id → starter_courses.id
```

---

## 15. Business Rules & Constraints

### Track & Age Group

- A student with `track = 'tiger'` must have `belt_rank_id` pointing to a `belt_ranks` row where `track = 'tiger'`.
- A student with `track = 'regular'` must have `belt_rank_id` pointing to a `belt_ranks` row where `track = 'regular'`.
- `age_group` is only meaningful when `track = 'regular'`. Tiger Cubs should default to `'jr'` but the field is not used in filtering.
- Age group is **manually managed** by the instructor and is never computed from `date_of_birth`.

### Graduation (Tiger Cub Black Stripe)

When a Tiger Cub is promoted to `Tiger Cub Black Stripe` (`is_graduation_rank = TRUE`):

1. Insert a `rank_history` row recording the Black Stripe promotion (track = `'tiger'`).
2. Insert a second `rank_history` row recording graduation to `White Belt` (track = `'regular'`).
3. Update `students.track` from `'tiger'` to `'regular'`.
4. Update `students.belt_rank_id` to the `White Belt` row in `belt_ranks` (regular track, `sort_order = 0`).
5. Reset all `student_progress` fields to `FALSE`.

### Progress Stripe Reset

Whenever `students.belt_rank_id` changes (any promotion), reset the student's `student_progress` row: all stripes and `permission_to_test` set to `FALSE`.

### Attendance Filtering

To determine which students appear in a given class session, join `students` → `belt_ranks` and apply:

```sql
-- Example: Jr. Green, Blue & Purple class
SELECT s.*
FROM students s
JOIN belt_ranks br ON s.belt_rank_id = br.id
WHERE s.track = 'regular'
  AND s.age_group = 'jr'
  AND br.class_group = 'jr-gbp'
  AND s.is_active = TRUE;

-- Adult class (all belt groups)
SELECT s.*
FROM students s
JOIN belt_ranks br ON s.belt_rank_id = br.id
WHERE s.track = 'regular'
  AND s.age_group = 'adult'
  AND s.is_active = TRUE;
```

### Classes Since Promotion

Computed at query time, not stored.

```sql
SELECT COUNT(ar.id) AS classes_since_promotion
FROM attendance_records ar
JOIN attendance_sessions ats ON ar.session_id = ats.id
WHERE ar.student_id = :student_id
  AND ar.status = 'present'
  AND ats.session_date > (
    SELECT MAX(rh.promotion_date)
    FROM rank_history rh
    WHERE rh.student_id = :student_id
  );
-- If no rank_history rows exist, count all 'present' records.
```

### Classes Since Last Testing

Computed at query time, not stored.

```sql
SELECT COUNT(ar.id) AS classes_since_testing
FROM attendance_records ar
JOIN attendance_sessions ats ON ar.session_id = ats.id
WHERE ar.student_id = :student_id
  AND ar.status = 'present'
  AND ats.session_date > (
    SELECT MAX(e.event_date)
    FROM events e
    JOIN event_roster er ON e.id = er.event_id
    WHERE er.student_id = :student_id
      AND e.event_type = 'Belt Testing'
  );
-- If no Belt Testing events found for the student, fall back to classes_since_promotion.
```

### Auto-Promote (Testing Event)

When the auto-promote action is triggered for a Belt Testing event:

1. Fetch all students on the event roster, ordered by `belt_ranks.sort_order ASC`.
2. For each student, determine `next_rank_id` from `belt_ranks.next_rank_id`.
3. If `next_rank_id` is NULL (student is at highest rank), skip and log.
4. If `is_graduation_rank = TRUE`, execute the graduation flow (see above) instead of a normal promotion.
5. Otherwise, insert a `rank_history` row with `promoted_at_event_id = event.id`.
6. Update `students.belt_rank_id` to `next_rank_id`.
7. Reset `student_progress`.
8. Return a result set: `student name`, `previous belt name`, `new belt name`, `belt size` — ordered by original `sort_order`.

### Testing Roster Export (TSV)

Column order for the tab-separated export, ordered by `belt_ranks.sort_order ASC`:

| Column | Source |
|---|---|
| Name | `students.first_name + ' ' + students.last_name` |
| Track | Derived from `students.track` |
| Age Group | Derived from `students.age_group` |
| Current Belt | `belt_ranks.name` (current) |
| Testing For | `belt_ranks.name` (next, via `next_rank_id`) |
| Belt Size | `students.belt_size` |
| Phone | `students.phone` |
| Email | `students.email` |

---

## 16. Indexes

| Table | Columns | Type | Purpose |
|---|---|---|---|
| `students` | `last_name, first_name` | BTREE | Name search |
| `students` | `track` | BTREE | Filter by track |
| `students` | `age_group` | BTREE | Filter by age group |
| `students` | `belt_rank_id` | BTREE | Filter by rank |
| `students` | `is_active` | BTREE | Soft-delete filter |
| `belt_ranks` | `track, sort_order` | BTREE UNIQUE | Rank ordering |
| `belt_ranks` | `class_group` | BTREE | Attendance class filtering |
| `rank_history` | `student_id, promotion_date` | BTREE | Per-student history, date ordered |
| `rank_history` | `promoted_at_event_id` | BTREE | Look up promotions by event |
| `attendance_sessions` | `session_date` | BTREE | Date range queries |
| `attendance_sessions` | `class_type` | BTREE | Filter by class |
| `attendance_records` | `student_id, status` | BTREE | Count present per student |
| `attendance_records` | `session_id` | BTREE | All records for a session |
| `event_roster` | `event_id, student_id` | BTREE UNIQUE | Roster lookup |
| `event_roster` | `student_id` | BTREE | All events for a student |
| `events` | `event_date` | BTREE | Upcoming / past split |
| `events` | `event_type` | BTREE | Filter Belt Testing events |
| `starter_course_enrollment` | `course_id, student_id` | BTREE UNIQUE | Enrollment lookup |
| `starter_course_enrollment` | `student_id` | BTREE | All courses for a student |
| `starter_courses` | `end_date` | BTREE | Active vs. completed filter |
