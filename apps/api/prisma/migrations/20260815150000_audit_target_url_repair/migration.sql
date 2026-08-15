-- Repair migration for deployments where the prior compatibility migration was
-- recorded but the physical column is still absent. This is safe on correct DBs.
ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS target_url TEXT NOT NULL DEFAULT '';
