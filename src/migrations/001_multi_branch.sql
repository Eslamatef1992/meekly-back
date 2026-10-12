-- 001_multi_branch.sql
-- Adds the multi-branch foundation to the Mekky ERP database.
-- Idempotent: safe to re-run.
--
-- Run with:
--   mysql -u mekky_app -p mekky_erp < apps/api/src/migrations/001_multi_branch.sql

-- ============================================================
-- 1. Create the branches table
-- ============================================================
CREATE TABLE IF NOT EXISTS branches (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code          VARCHAR(30)  NOT NULL,
  name          VARCHAR(160) NOT NULL,
  name_ar       VARCHAR(160) NULL,
  address       VARCHAR(255) NULL,
  address_ar    VARCHAR(255) NULL,
  phone         VARCHAR(40)  NULL,
  email         VARCHAR(160) NULL,
  manager_name  VARCHAR(160) NULL,
  cr_number     VARCHAR(40)  NULL,
  tax_number    VARCHAR(40)  NULL,
  is_active     TINYINT      NOT NULL DEFAULT 1,
  is_default    TINYINT      NOT NULL DEFAULT 0,
  created_at    DATETIME     NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_branches_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert a default branch if none exists yet
INSERT INTO branches (id, code, name, name_ar, is_default, is_active)
SELECT 1, 'HQ', 'Head Office', 'المقر الرئيسي', 1, 1
WHERE NOT EXISTS (SELECT 1 FROM branches);

-- ============================================================
-- 2. Helper procedure: add column only if missing
-- ============================================================
DROP PROCEDURE IF EXISTS add_col_if_missing;
DELIMITER $$
CREATE PROCEDURE add_col_if_missing(
  IN tbl   VARCHAR(64),
  IN col   VARCHAR(64),
  IN ddl   VARCHAR(500)
)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = tbl
      AND COLUMN_NAME  = col
  ) THEN
    SET @s = CONCAT('ALTER TABLE `', tbl, '` ADD COLUMN ', ddl);
    PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  END IF;
END$$
DELIMITER ;

-- ============================================================
-- 3. Add branch_id to all transactional tables
-- ============================================================
CALL add_col_if_missing('vouchers',         'branch_id', 'branch_id INT UNSIGNED NULL AFTER voucher_date');
CALL add_col_if_missing('gl_entries',       'branch_id', 'branch_id INT UNSIGNED NULL AFTER entry_date');
CALL add_col_if_missing('warehouses',       'branch_id', 'branch_id INT UNSIGNED NULL AFTER id');
CALL add_col_if_missing('stock_movements',  'branch_id', 'branch_id INT UNSIGNED NULL AFTER movement_type');
CALL add_col_if_missing('employees',        'branch_id', 'branch_id INT UNSIGNED NULL AFTER id');
CALL add_col_if_missing('orders',           'branch_id', 'branch_id INT UNSIGNED NULL AFTER order_no');
CALL add_col_if_missing('users',            'default_branch_id', 'default_branch_id INT UNSIGNED NULL AFTER phone');

-- ============================================================
-- 4. Backfill existing rows with default branch (id=1)
-- ============================================================
UPDATE vouchers        SET branch_id = 1 WHERE branch_id IS NULL;
UPDATE gl_entries      SET branch_id = 1 WHERE branch_id IS NULL;
UPDATE warehouses      SET branch_id = 1 WHERE branch_id IS NULL;
UPDATE stock_movements SET branch_id = 1 WHERE branch_id IS NULL;
UPDATE employees       SET branch_id = 1 WHERE branch_id IS NULL;
UPDATE orders          SET branch_id = 1 WHERE branch_id IS NULL;
UPDATE users           SET default_branch_id = 1 WHERE default_branch_id IS NULL;

-- ============================================================
-- 5. Make branch_id NOT NULL on transactional tables
-- ============================================================
ALTER TABLE vouchers        MODIFY branch_id INT UNSIGNED NOT NULL;
ALTER TABLE gl_entries      MODIFY branch_id INT UNSIGNED NOT NULL;
ALTER TABLE warehouses      MODIFY branch_id INT UNSIGNED NOT NULL;
ALTER TABLE stock_movements MODIFY branch_id INT UNSIGNED NOT NULL;
ALTER TABLE employees       MODIFY branch_id INT UNSIGNED NOT NULL;
ALTER TABLE orders          MODIFY branch_id INT UNSIGNED NOT NULL;

-- ============================================================
-- 6. Add indexes for fast per-branch reporting
-- ============================================================
DROP PROCEDURE IF EXISTS add_index_if_missing;
DELIMITER $$
CREATE PROCEDURE add_index_if_missing(
  IN tbl VARCHAR(64), IN idx VARCHAR(64), IN col_list VARCHAR(255)
)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = tbl AND INDEX_NAME = idx
  ) THEN
    SET @s = CONCAT('ALTER TABLE `', tbl, '` ADD INDEX `', idx, '` (', col_list, ')');
    PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  END IF;
END$$
DELIMITER ;

CALL add_index_if_missing('vouchers',        'ix_vouchers_branch_date',     'branch_id, voucher_date');
CALL add_index_if_missing('gl_entries',      'ix_gl_branch_date_account',   'branch_id, entry_date, account_id');
CALL add_index_if_missing('stock_movements', 'ix_stock_branch_item',        'branch_id, item_id, movement_date');
CALL add_index_if_missing('orders',          'ix_orders_branch_status',     'branch_id, status, placed_at');
CALL add_index_if_missing('employees',       'ix_employees_branch_status',  'branch_id, status');

-- ============================================================
-- 7. Insert system.branch.manage permission
-- ============================================================
INSERT IGNORE INTO permissions (code, name, module)
VALUES ('system.branch.manage', 'Manage branches', 'system');

-- Grant to existing 'admin' role (id 1 by convention)
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  JOIN permissions p ON p.code = 'system.branch.manage'
 WHERE r.code = 'admin';

-- Cleanup helpers
DROP PROCEDURE IF EXISTS add_col_if_missing;
DROP PROCEDURE IF EXISTS add_index_if_missing;

-- Done.
SELECT 'multi-branch migration applied' AS result;
