-- Add two guardian contacts (name / phone / email) to each student.
ALTER TABLE students ADD COLUMN guardian1_name TEXT;
ALTER TABLE students ADD COLUMN guardian1_phone TEXT;
ALTER TABLE students ADD COLUMN guardian1_email TEXT;
ALTER TABLE students ADD COLUMN guardian2_name TEXT;
ALTER TABLE students ADD COLUMN guardian2_phone TEXT;
ALTER TABLE students ADD COLUMN guardian2_email TEXT;
