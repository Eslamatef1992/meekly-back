-- ============================================================================
-- Migration 014: Add company_id to financial_upload_jobs
-- Idempotent — safe to re-run.
-- ============================================================================

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME   = 'financial_upload_jobs'
     AND COLUMN_NAME  = 'company_id'
);
SET @ddl := IF(@col_exists = 0,
  'ALTER TABLE financial_upload_jobs
     ADD COLUMN company_id INT UNSIGNED NULL AFTER fiscal_period_id,
     ADD INDEX idx_fuj_company (company_id)',
  'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
