-- Existing deployments may have an audit_logs table created before target_url
-- was present. Keep this additive so Prisma queries work without changing data.
ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS target_url TEXT NOT NULL DEFAULT '';
