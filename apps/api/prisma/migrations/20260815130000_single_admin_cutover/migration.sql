-- Destructive single-admin cutover. Existing users, virtual API keys, and audit logs
-- are intentionally removed; subsequent keys and audits are global records.
DELETE FROM audit_logs;
DELETE FROM api_keys;
DELETE FROM settings WHERE key = 'user_inactivity_suspend_days';

ALTER TABLE api_keys DROP CONSTRAINT IF EXISTS api_keys_user_id_fkey;
DROP INDEX IF EXISTS idx_api_keys_user_id;
ALTER TABLE api_keys DROP COLUMN IF EXISTS user_id;

ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_user_id_fkey;
DROP INDEX IF EXISTS idx_audit_logs_user_id;
ALTER TABLE audit_logs DROP COLUMN IF EXISTS user_id;

DROP TABLE IF EXISTS users;
