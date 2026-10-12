-- 006_customer_auth.sql
-- Storefront customer authentication: OTP storage + phone uniqueness

-- Customer OTP codes (one row per phone, latest wins)
CREATE TABLE IF NOT EXISTS customer_otps (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  phone       VARCHAR(40) NOT NULL,
  code        VARCHAR(10) NOT NULL,
  expires_at  DATETIME NOT NULL,
  used        TINYINT NOT NULL DEFAULT 0,
  created_at  DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_customer_otps_phone (phone),
  KEY ix_customer_otps_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Unique index on customer phone (for OTP lookup) — only if not already unique
DROP PROCEDURE IF EXISTS add_index_if_missing;
DELIMITER $$
CREATE PROCEDURE add_index_if_missing(
  IN tbl VARCHAR(64), IN idx VARCHAR(64), IN col_list VARCHAR(255), IN is_unique TINYINT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = tbl AND INDEX_NAME = idx
  ) THEN
    SET @s = CONCAT('ALTER TABLE `', tbl, '` ADD ', IF(is_unique, 'UNIQUE ', ''), 'INDEX `', idx, '` (', col_list, ')');
    PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  END IF;
END$$
DELIMITER ;

CALL add_index_if_missing('customers', 'uq_customers_phone', 'phone', 1);

DROP PROCEDURE IF EXISTS add_index_if_missing;

SELECT 'Customer auth migration applied' AS result;
