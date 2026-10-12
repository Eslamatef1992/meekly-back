-- 008_branch_company.sql
-- Link branches to companies (departments table)
-- Idempotent — safe to re-run

DROP PROCEDURE IF EXISTS add_col_if_missing;
DELIMITER $$
CREATE PROCEDURE add_col_if_missing(IN tbl VARCHAR(64), IN col VARCHAR(64), IN ddl VARCHAR(500))
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = tbl AND COLUMN_NAME = col) THEN
    SET @s = CONCAT('ALTER TABLE `', tbl, '` ADD COLUMN ', ddl);
    PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  END IF;
END$$
DELIMITER ;

CALL add_col_if_missing('branches', 'company_id', "company_id INT UNSIGNED NULL AFTER id");

DROP PROCEDURE IF EXISTS add_index_if_missing;
DELIMITER $$
CREATE PROCEDURE add_index_if_missing(IN tbl VARCHAR(64), IN idx VARCHAR(64), IN col_list VARCHAR(255))
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = tbl AND INDEX_NAME = idx) THEN
    SET @s = CONCAT('ALTER TABLE `', tbl, '` ADD INDEX `', idx, '` (', col_list, ')');
    PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  END IF;
END$$
DELIMITER ;

CALL add_index_if_missing('branches', 'ix_branches_company', 'company_id');

-- Best-effort auto-assignment:
-- For each branch, pick the company that most of its employees belong to.
-- This is purely a heuristic so existing branches get a sensible default — admins can adjust afterwards.
UPDATE branches b
JOIN (
  SELECT branch_id, department_id, COUNT(*) AS n,
         ROW_NUMBER() OVER (PARTITION BY branch_id ORDER BY COUNT(*) DESC) AS rn
  FROM employees
  WHERE department_id IS NOT NULL AND branch_id IS NOT NULL
  GROUP BY branch_id, department_id
) e ON e.branch_id = b.id AND e.rn = 1
SET b.company_id = e.department_id
WHERE b.company_id IS NULL;

DROP PROCEDURE IF EXISTS add_col_if_missing;
DROP PROCEDURE IF EXISTS add_index_if_missing;

SELECT 'Branch ↔ Company link migration applied' AS result, COUNT(*) AS branches_with_company FROM branches WHERE company_id IS NOT NULL;
