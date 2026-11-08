-- ============================================================================
-- Migration 013: Financial Uploads module
-- Super-admin-driven import of chart-of-accounts and voucher Excel files,
-- scoped to a chosen fiscal period. Each import is tracked as a "job" with
-- status, counts, and an error log, and every inserted row is tagged with the
-- job id so a job can be rolled back cleanly.
-- Idempotent — safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Jobs table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS financial_upload_jobs (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  fiscal_period_id   INT UNSIGNED NOT NULL,
  branch_id          INT UNSIGNED NULL,
  upload_type        ENUM('chart_of_accounts','vouchers') NOT NULL,
  original_filename  VARCHAR(255) NOT NULL,
  stored_filename    VARCHAR(255) NOT NULL,
  file_size          BIGINT UNSIGNED NOT NULL DEFAULT 0,
  status             ENUM('queued','processing','completed','failed','rolled_back')
                       NOT NULL DEFAULT 'queued',
  inserted_rows      INT UNSIGNED NOT NULL DEFAULT 0,
  skipped_rows       INT UNSIGNED NOT NULL DEFAULT 0,
  failed_rows        INT UNSIGNED NOT NULL DEFAULT 0,
  total_debit        DECIMAL(20,3) NOT NULL DEFAULT 0,
  total_credit       DECIMAL(20,3) NOT NULL DEFAULT 0,
  error_message      TEXT NULL,
  options_json       TEXT NULL,     -- user-supplied options as JSON
  uploaded_by        BIGINT UNSIGNED NOT NULL,
  started_at         DATETIME NULL,
  finished_at        DATETIME NULL,
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                       ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_fiscal_period  (fiscal_period_id),
  KEY idx_status         (status),
  KEY idx_uploaded_by    (uploaded_by),
  CONSTRAINT fk_fuj_period
    FOREIGN KEY (fiscal_period_id) REFERENCES fiscal_periods(id),
  CONSTRAINT fk_fuj_user
    FOREIGN KEY (uploaded_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 2. Tag rows inserted by a job, so rollback is one DELETE per table.
-- Added idempotently.
-- ---------------------------------------------------------------------------
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME   = 'accounts'
     AND COLUMN_NAME  = 'imported_by_job_id'
);
SET @ddl := IF(@col_exists = 0,
  'ALTER TABLE accounts
     ADD COLUMN imported_by_job_id BIGINT UNSIGNED NULL,
     ADD INDEX idx_accounts_imported_by (imported_by_job_id)',
  'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME   = 'vouchers'
     AND COLUMN_NAME  = 'imported_by_job_id'
);
SET @ddl := IF(@col_exists = 0,
  'ALTER TABLE vouchers
     ADD COLUMN imported_by_job_id BIGINT UNSIGNED NULL,
     ADD INDEX idx_vouchers_imported_by (imported_by_job_id)',
  'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- 3. Permissions for the new module (super_admin bypasses; other roles need these)
-- ---------------------------------------------------------------------------
INSERT IGNORE INTO permissions (code, module, label) VALUES
  ('finance.uploads.view',   'finance', 'View financial uploads'),
  ('finance.uploads.create', 'finance', 'Upload financial file'),
  ('finance.uploads.rollback','finance','Rollback financial upload');

-- Give super_admin role (if a roles<->permissions table exists) the new perms
-- Falls back silently if the join table isn't present in this schema.
SET @has_rp := (
  SELECT COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME   = 'role_permissions'
);
SET @sql := IF(@has_rp > 0,
  'INSERT IGNORE INTO role_permissions (role_id, permission_id)
     SELECT r.id, p.id FROM roles r JOIN permissions p
      WHERE r.code = ''super_admin''
        AND p.code IN (''finance.uploads.view'',''finance.uploads.create'',''finance.uploads.rollback'')',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
