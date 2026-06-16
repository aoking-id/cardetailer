-- Car Detailer schema (Postgres / Neon)

CREATE TABLE IF NOT EXISTS branches (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name     TEXT,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'cs', 'detailer')),
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_branches (
  user_id   INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  branch_id INT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, branch_id)
);

CREATE TABLE IF NOT EXISTS jobs (
  id            SERIAL PRIMARY KEY,
  rego          TEXT NOT NULL,
  branch_id     INT REFERENCES branches(id),
  acriss_group  TEXT,
  fuel_eighths  INT,
  mileage       INT,
  service_type  TEXT,
  status        TEXT NOT NULL DEFAULT 'awaiting_wash'
                CHECK (status IN ('awaiting_wash', 'in_progress', 'done')),
  intake_by     INT REFERENCES users(id),
  detailer_id   INT REFERENCES users(id),
  notes         TEXT,
  after_notes   TEXT,
  returned_at   TIMESTAMPTZ,
  started_at    TIMESTAMPTZ,
  finished_at   TIMESTAMPTZ,
  sort_order    INT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jobs_branch_status ON jobs(branch_id, status);
CREATE INDEX IF NOT EXISTS idx_jobs_status_sort ON jobs(status, sort_order);
CREATE INDEX IF NOT EXISTS idx_user_branches_branch ON user_branches(branch_id);
