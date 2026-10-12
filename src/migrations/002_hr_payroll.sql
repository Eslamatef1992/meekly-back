-- 002_hr_payroll.sql
-- HR + Payroll tables for the Kuwait labor law module.
-- Idempotent: safe to re-run.

-- ============================================================
-- 1. Salary components catalog
-- ============================================================
CREATE TABLE IF NOT EXISTS salary_components (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code            VARCHAR(40)  NOT NULL,
  name            VARCHAR(120) NOT NULL,
  name_ar         VARCHAR(120) NULL,
  kind            ENUM('allowance','deduction') NOT NULL,
  calculation     ENUM('fixed','percent_of_basic') NOT NULL DEFAULT 'fixed',
  default_amount  DECIMAL(18,3) NOT NULL DEFAULT 0,
  default_percent DECIMAL(6,3)  NOT NULL DEFAULT 0,
  is_taxable      TINYINT NOT NULL DEFAULT 0,
  affects_eos     TINYINT NOT NULL DEFAULT 0,
  gl_account_id   BIGINT UNSIGNED NULL,
  is_active       TINYINT NOT NULL DEFAULT 1,
  notes           VARCHAR(255) NULL,
  created_at      DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_salary_components_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO salary_components (code, name, name_ar, kind, calculation, default_amount) VALUES
  ('MOBILE',      'Mobile Allowance',  'بدل هاتف',          'allowance', 'fixed', 0),
  ('FOOD',        'Food Allowance',    'بدل طعام',          'allowance', 'fixed', 0),
  ('NATURE',      'Nature of Work',    'بدل طبيعة العمل',   'allowance', 'fixed', 0),
  ('SOCIAL',      'Social Allowance',  'بدل اجتماعي',       'allowance', 'fixed', 0),
  ('ADVANCE',     'Salary Advance',    'سلفة على الراتب',   'deduction', 'fixed', 0),
  ('LOAN',        'Loan Repayment',    'سداد قرض',          'deduction', 'fixed', 0),
  ('ABSENCE',     'Absence Deduction', 'خصم غياب',          'deduction', 'fixed', 0),
  ('PENALTY',     'Penalty',           'جزاء',              'deduction', 'fixed', 0);

-- ============================================================
-- 2. Per-employee salary component assignments
-- ============================================================
CREATE TABLE IF NOT EXISTS employee_salary_components (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  employee_id         BIGINT UNSIGNED NOT NULL,
  salary_component_id INT UNSIGNED NOT NULL,
  amount              DECIMAL(18,3) NOT NULL DEFAULT 0,
  percent             DECIMAL(6,3)  NOT NULL DEFAULT 0,
  effective_from      DATE NOT NULL,
  effective_to        DATE NULL,
  is_active           TINYINT NOT NULL DEFAULT 1,
  notes               VARCHAR(255) NULL,
  created_at          DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_esc_employee (employee_id, is_active),
  KEY ix_esc_component (salary_component_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 3. Payroll runs (monthly header)
-- ============================================================
CREATE TABLE IF NOT EXISTS payroll_runs (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  run_no            VARCHAR(40)  NOT NULL,
  branch_id         INT UNSIGNED NOT NULL,
  period_year       INT UNSIGNED NOT NULL,
  period_month      TINYINT UNSIGNED NOT NULL,
  pay_date          DATE NOT NULL,
  status            ENUM('draft','calculated','posted','cancelled') NOT NULL DEFAULT 'draft',
  voucher_id        BIGINT UNSIGNED NULL,
  total_gross       DECIMAL(18,3) NOT NULL DEFAULT 0,
  total_deductions  DECIMAL(18,3) NOT NULL DEFAULT 0,
  total_net         DECIMAL(18,3) NOT NULL DEFAULT 0,
  employee_count    INT UNSIGNED NOT NULL DEFAULT 0,
  notes             VARCHAR(500) NULL,
  created_by        BIGINT UNSIGNED NULL,
  posted_by         BIGINT UNSIGNED NULL,
  posted_at         DATETIME NULL,
  created_at        DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payroll_runs_no (run_no),
  KEY ix_payroll_branch_period (branch_id, period_year, period_month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 4. Payslips (one row per employee per run)
-- ============================================================
CREATE TABLE IF NOT EXISTS payslips (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  payroll_run_id       INT UNSIGNED NOT NULL,
  employee_id          BIGINT UNSIGNED NOT NULL,
  branch_id            INT UNSIGNED NOT NULL,
  period_year          INT UNSIGNED NOT NULL,
  period_month         TINYINT UNSIGNED NOT NULL,
  working_days         DECIMAL(6,2) NOT NULL DEFAULT 26,
  paid_days            DECIMAL(6,2) NOT NULL DEFAULT 26,
  basic_salary         DECIMAL(18,3) NOT NULL DEFAULT 0,
  total_allowances     DECIMAL(18,3) NOT NULL DEFAULT 0,
  total_overtime       DECIMAL(18,3) NOT NULL DEFAULT 0,
  gross_pay            DECIMAL(18,3) NOT NULL DEFAULT 0,
  total_deductions     DECIMAL(18,3) NOT NULL DEFAULT 0,
  pifss_employee       DECIMAL(18,3) NOT NULL DEFAULT 0,
  pifss_employer       DECIMAL(18,3) NOT NULL DEFAULT 0,
  net_pay              DECIMAL(18,3) NOT NULL DEFAULT 0,
  unpaid_leave_days    DECIMAL(6,2) NOT NULL DEFAULT 0,
  unpaid_leave_amount  DECIMAL(18,3) NOT NULL DEFAULT 0,
  notes                VARCHAR(500) NULL,
  created_at           DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_payslips_run (payroll_run_id),
  KEY ix_payslips_employee_period (employee_id, period_year, period_month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 5. Payslip line items (one per allowance / OT / deduction line)
-- ============================================================
CREATE TABLE IF NOT EXISTS payslip_lines (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  payslip_id          BIGINT UNSIGNED NOT NULL,
  salary_component_id INT UNSIGNED NULL,
  kind                ENUM('basic','allowance','overtime','deduction','pifss') NOT NULL,
  label               VARCHAR(120) NOT NULL,
  label_ar            VARCHAR(120) NULL,
  amount              DECIMAL(18,3) NOT NULL,
  notes               VARCHAR(255) NULL,
  PRIMARY KEY (id),
  KEY ix_payslip_lines_payslip (payslip_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 6. Overtime entries
-- ============================================================
CREATE TABLE IF NOT EXISTS overtime_entries (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  employee_id   BIGINT UNSIGNED NOT NULL,
  branch_id     INT UNSIGNED NOT NULL,
  entry_date    DATE NOT NULL,
  regular_hours DECIMAL(6,2) NOT NULL DEFAULT 0,
  weekend_hours DECIMAL(6,2) NOT NULL DEFAULT 0,
  status        ENUM('pending','approved','rejected','paid') NOT NULL DEFAULT 'pending',
  approved_by   BIGINT UNSIGNED NULL,
  approved_at   DATETIME NULL,
  notes         VARCHAR(255) NULL,
  created_at    DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_ot_employee_date (employee_id, entry_date),
  KEY ix_ot_branch_status (branch_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 7. Employee requests (leave, salary advance, certificate, NOC, etc.)
-- ============================================================
CREATE TABLE IF NOT EXISTS employee_requests (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  request_no      VARCHAR(40) NOT NULL,
  employee_id     BIGINT UNSIGNED NOT NULL,
  branch_id       INT UNSIGNED NOT NULL,
  request_type    ENUM('leave','sick_leave','salary_advance','loan','salary_certificate','noc','iqama_renewal','passport_renewal','business_card','other') NOT NULL,
  subject         VARCHAR(160) NOT NULL,
  description     VARCHAR(2000) NULL,
  amount          DECIMAL(18,3) NOT NULL DEFAULT 0,
  from_date       DATE NULL,
  to_date         DATE NULL,
  status          ENUM('pending','approved','rejected','completed','cancelled') NOT NULL DEFAULT 'pending',
  approved_by     BIGINT UNSIGNED NULL,
  approved_at     DATETIME NULL,
  rejection_reason VARCHAR(500) NULL,
  created_by      BIGINT UNSIGNED NULL,
  created_at      DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_employee_requests_no (request_no),
  KEY ix_emp_req_employee (employee_id, status),
  KEY ix_emp_req_branch_type (branch_id, request_type, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 8. Add new HR-related accounts to the COA if missing
-- ============================================================
INSERT IGNORE INTO accounts (code, name, name_ar, account_type, account_subtype, normal_balance, is_group, level, is_active, parent_id)
SELECT '2104', 'PIFSS Payable', 'التأمينات الاجتماعية المستحقة', 'liability', 'tax', 'credit', 0, 3, 1,
  (SELECT id FROM accounts WHERE code='21')
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE code='2104');

INSERT IGNORE INTO accounts (code, name, name_ar, account_type, account_subtype, normal_balance, is_group, level, is_active, parent_id)
SELECT '5209', 'Overtime Wages', 'أجور العمل الإضافي', 'expense', 'salary', 'debit', 0, 3, 1,
  (SELECT id FROM accounts WHERE code='52')
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE code='5209');

INSERT IGNORE INTO accounts (code, name, name_ar, account_type, account_subtype, normal_balance, is_group, level, is_active, parent_id)
SELECT '5210', 'End of Service Expense', 'مصروف نهاية الخدمة', 'expense', 'salary', 'debit', 0, 3, 1,
  (SELECT id FROM accounts WHERE code='52')
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE code='5210');

-- ============================================================
-- 9. Permissions
-- ============================================================
INSERT IGNORE INTO permissions (code, name, module) VALUES
  ('hr.payroll.run',     'Run and post payroll',  'hr'),
  ('hr.request.manage',  'Manage employee requests','hr');

-- Grant to super_admin
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  JOIN permissions p ON p.code IN ('hr.payroll.run', 'hr.request.manage')
 WHERE r.code = 'super_admin';

-- Grant to hr_manager
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  JOIN permissions p ON p.code IN ('hr.payroll.run', 'hr.request.manage')
 WHERE r.code = 'hr_manager';

SELECT 'HR/Payroll migration applied' AS result;
