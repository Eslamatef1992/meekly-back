-- 009_employee_docs_company_fix.sql
-- Adds employee image + license fields + backfills missing company codes
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

-- 1) Employee personal/document fields
CALL add_col_if_missing('employees', 'image_url',                 "image_url VARCHAR(500) NULL AFTER phone");
CALL add_col_if_missing('employees', 'driving_license_no',        "driving_license_no VARCHAR(40) NULL AFTER work_permit_expiry");
CALL add_col_if_missing('employees', 'driving_license_expiry',    "driving_license_expiry DATE NULL AFTER driving_license_no");
CALL add_col_if_missing('employees', 'car_plate_no',              "car_plate_no VARCHAR(30) NULL AFTER driving_license_expiry");
CALL add_col_if_missing('employees', 'car_registration_expiry',   "car_registration_expiry DATE NULL AFTER car_plate_no");
CALL add_col_if_missing('employees', 'health_card_expiry',        "health_card_expiry DATE NULL AFTER car_registration_expiry");
CALL add_col_if_missing('employees', 'notes',                     "notes TEXT NULL");

-- 2) Generic employee document attachments
CREATE TABLE IF NOT EXISTS employee_documents (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  employee_id  BIGINT UNSIGNED NOT NULL,
  doc_type     ENUM('civil_id','passport','iqama','work_permit','driving_license','contract','health_card','showroom_license','other') NOT NULL DEFAULT 'other',
  title        VARCHAR(160) NOT NULL,
  file_url     VARCHAR(500) NULL,                 -- /uploads/employees/<id>/<file>
  issue_date   DATE NULL,
  expiry_date  DATE NULL,
  notes        VARCHAR(500) NULL,
  uploaded_by  BIGINT UNSIGNED NULL,
  created_at   DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_emp_docs_employee_type (employee_id, doc_type),
  KEY ix_emp_docs_expiry (expiry_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3) Backfill missing company codes (some seeded rows have empty/NULL code)
UPDATE departments
   SET code = UPPER(REGEXP_REPLACE(name, '[^a-zA-Z0-9]', ''))
 WHERE code IS NULL OR code = '';

-- 4) Ensure leave_types have user-friendly defaults for the seeded codes
INSERT IGNORE INTO leave_types (code, name, name_ar, annual_quota_days, is_paid) VALUES
  ('annual',       'Annual Leave',       'إجازة سنوية',           30, 1),
  ('sick_full',    'Sick Leave (Full)',  'إجازة مرضية (كامل)',    15, 1),
  ('sick_75',      'Sick Leave (75%)',   'إجازة مرضية (٧٥٪)',     10, 1),
  ('sick_50',      'Sick Leave (50%)',   'إجازة مرضية (٥٠٪)',     10, 1),
  ('sick_25',      'Sick Leave (25%)',   'إجازة مرضية (٢٥٪)',     10, 1),
  ('sick_unpaid',  'Sick Leave (Unpaid)','إجازة مرضية بدون أجر',   30, 0),
  ('emergency',    'Emergency Leave',    'إجازة طارئة',            5,  1),
  ('unpaid',       'Unpaid Leave',       'إجازة بدون أجر',         NULL, 0),
  ('maternity',    'Maternity Leave',    'إجازة وضع',              70, 1),
  ('hajj',         'Hajj Leave',         'إجازة حج',               21, 1);

DROP PROCEDURE IF EXISTS add_col_if_missing;
SELECT 'Employee docs + company-code migration applied' AS result;
