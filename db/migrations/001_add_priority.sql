-- Run against existing Neon database (safe to re-run: skips if column exists)
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal';
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_priority_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_priority_check CHECK (priority IN ('high', 'normal'));
