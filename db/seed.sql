-- Demo branches and admin user (password: admin)
-- bcrypt hash generated with: npm run hash-password admin

INSERT INTO branches (name)
SELECT v FROM (VALUES
  ('Sydney Airport'),
  ('Melbourne Airport'),
  ('Brisbane Airport')
) AS t(v)
WHERE NOT EXISTS (SELECT 1 FROM branches b WHERE lower(b.name) = lower(t.v));

-- Only insert admin if no users exist yet
INSERT INTO users (username, password_hash, full_name, role, is_active)
SELECT
  'admin',
  '$2a$10$Pbu.Avh47Yg9qj87WlhWXumRTxzTEK0fCJXiO2YPFSpuLX7bkBs4O',
  'Default Admin',
  'admin',
  true
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'admin');
