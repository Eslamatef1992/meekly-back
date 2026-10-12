-- 005_inventory.sql
-- Inventory enhancements: barcode, image, min/max stock, transfer infra
-- Idempotent — safe to re-run

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
-- Item enhancements
-- ============================================================
CALL add_col_if_missing('items', 'barcode',        "barcode VARCHAR(60) NULL AFTER sku");
CALL add_col_if_missing('items', 'image_url',      "image_url VARCHAR(500) NULL AFTER uom_id");
CALL add_col_if_missing('items', 'min_stock',      "min_stock DECIMAL(18,3) NOT NULL DEFAULT 0 AFTER reorder_level");
CALL add_col_if_missing('items', 'max_stock',      "max_stock DECIMAL(18,3) NOT NULL DEFAULT 0 AFTER min_stock");
CALL add_col_if_missing('items', 'weight_kg',      "weight_kg DECIMAL(10,3) NULL AFTER max_stock");
CALL add_col_if_missing('items', 'dimensions',     "dimensions VARCHAR(100) NULL AFTER weight_kg");
CALL add_col_if_missing('items', 'is_sellable',    "is_sellable TINYINT NOT NULL DEFAULT 1 AFTER is_active");
CALL add_col_if_missing('items', 'is_purchasable', "is_purchasable TINYINT NOT NULL DEFAULT 1 AFTER is_sellable");

-- Add a barcode index for POS scanner lookups
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

CALL add_index_if_missing('items', 'ix_items_barcode', 'barcode');
CALL add_index_if_missing('items', 'ix_items_category', 'category_id, is_active');

-- ============================================================
-- Permission: stock transfer (separate from generic stock.move)
-- ============================================================
INSERT IGNORE INTO permissions (code, name, module) VALUES
  ('inventory.transfer',  'Transfer stock between warehouses', 'inventory'),
  ('inventory.adjust',    'Adjust stock (count variance)',      'inventory'),
  ('inventory.category.manage', 'Manage item categories',       'inventory'),
  ('inventory.warehouse.manage','Manage warehouses',            'inventory');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p
  ON p.code IN ('inventory.transfer','inventory.adjust','inventory.category.manage','inventory.warehouse.manage')
WHERE r.code IN ('super_admin','inventory_manager');

DROP PROCEDURE IF EXISTS add_col_if_missing;
DROP PROCEDURE IF EXISTS add_index_if_missing;

SELECT 'Inventory migration applied' AS result;
