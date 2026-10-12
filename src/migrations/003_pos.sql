-- 003_pos.sql
-- Point of Sale: registers, shifts, sales, sale lines, payments.
-- Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS pos_registers (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  branch_id       INT UNSIGNED NOT NULL,
  code            VARCHAR(30) NOT NULL,
  name            VARCHAR(120) NOT NULL,
  name_ar         VARCHAR(120) NULL,
  warehouse_id    INT UNSIGNED NULL,
  cash_account_id BIGINT UNSIGNED NULL,
  is_active       TINYINT NOT NULL DEFAULT 1,
  created_at      DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pos_registers_code (code),
  KEY ix_pos_registers_branch (branch_id, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pos_shifts (
  id                     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  shift_no               VARCHAR(40) NOT NULL,
  register_id            INT UNSIGNED NOT NULL,
  branch_id              INT UNSIGNED NOT NULL,
  cashier_id             BIGINT UNSIGNED NOT NULL,
  opened_at              DATETIME NOT NULL,
  opening_cash           DECIMAL(18,3) NOT NULL DEFAULT 0,
  closed_at              DATETIME NULL,
  expected_cash          DECIMAL(18,3) NOT NULL DEFAULT 0,
  counted_cash           DECIMAL(18,3) NOT NULL DEFAULT 0,
  variance               DECIMAL(18,3) NOT NULL DEFAULT 0,
  total_sales            DECIMAL(18,3) NOT NULL DEFAULT 0,
  sale_count             INT UNSIGNED NOT NULL DEFAULT 0,
  payment_breakdown_json JSON NULL,
  z_voucher_id           BIGINT UNSIGNED NULL,
  notes                  VARCHAR(500) NULL,
  status                 ENUM('open','closed','reconciled') NOT NULL DEFAULT 'open',
  created_at             DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pos_shifts_no (shift_no),
  KEY ix_pos_shifts_register_status (register_id, status),
  KEY ix_pos_shifts_branch_date (branch_id, opened_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pos_sales (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  sale_no       VARCHAR(40) NOT NULL,
  shift_id      BIGINT UNSIGNED NOT NULL,
  register_id   INT UNSIGNED NOT NULL,
  branch_id     INT UNSIGNED NOT NULL,
  warehouse_id  INT UNSIGNED NOT NULL,
  cashier_id    BIGINT UNSIGNED NOT NULL,
  customer_id   BIGINT UNSIGNED NULL,
  customer_name VARCHAR(160) NULL,
  sale_date     DATETIME NOT NULL,
  subtotal      DECIMAL(18,3) NOT NULL DEFAULT 0,
  discount      DECIMAL(18,3) NOT NULL DEFAULT 0,
  tax           DECIMAL(18,3) NOT NULL DEFAULT 0,
  total         DECIMAL(18,3) NOT NULL DEFAULT 0,
  total_cost    DECIMAL(18,3) NOT NULL DEFAULT 0,
  paid_total    DECIMAL(18,3) NOT NULL DEFAULT 0,
  change_due    DECIMAL(18,3) NOT NULL DEFAULT 0,
  status        ENUM('completed','voided','refunded') NOT NULL DEFAULT 'completed',
  voucher_id    BIGINT UNSIGNED NULL,
  notes         VARCHAR(500) NULL,
  created_at    DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pos_sales_no (sale_no),
  KEY ix_pos_sales_shift (shift_id),
  KEY ix_pos_sales_branch_date (branch_id, sale_date),
  KEY ix_pos_sales_cashier_date (cashier_id, sale_date),
  KEY ix_pos_sales_customer (customer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pos_sale_lines (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  sale_id    BIGINT UNSIGNED NOT NULL,
  line_no    INT UNSIGNED NOT NULL,
  item_id    BIGINT UNSIGNED NULL,
  product_id BIGINT UNSIGNED NULL,
  sku        VARCHAR(60) NULL,
  name       VARCHAR(200) NOT NULL,
  quantity   DECIMAL(18,3) NOT NULL,
  unit_price DECIMAL(18,3) NOT NULL,
  discount   DECIMAL(18,3) NOT NULL DEFAULT 0,
  line_total DECIMAL(18,3) NOT NULL,
  unit_cost  DECIMAL(18,3) NOT NULL DEFAULT 0,
  line_cost  DECIMAL(18,3) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY ix_pos_sale_lines_sale (sale_id),
  KEY ix_pos_sale_lines_item (item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pos_payments (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  sale_id    BIGINT UNSIGNED NOT NULL,
  method     ENUM('cash','knet','card','on_account','voucher','other') NOT NULL,
  amount     DECIMAL(18,3) NOT NULL,
  reference  VARCHAR(120) NULL,
  account_id BIGINT UNSIGNED NULL,
  notes      VARCHAR(255) NULL,
  created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_pos_payments_sale (sale_id),
  KEY ix_pos_payments_method (method)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Permissions
-- ============================================================
INSERT IGNORE INTO permissions (code, name, module) VALUES
  ('pos.sale.create',      'Create POS sale',         'pos'),
  ('pos.sale.void',        'Void POS sale',           'pos'),
  ('pos.shift.open',       'Open POS shift',          'pos'),
  ('pos.shift.close',      'Close POS shift',         'pos'),
  ('pos.register.manage',  'Manage POS registers',    'pos'),
  ('pos.report.view',      'View POS reports',        'pos');

-- Super admin gets everything
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p
ON p.code IN ('pos.sale.create','pos.sale.void','pos.shift.open','pos.shift.close','pos.register.manage','pos.report.view')
WHERE r.code = 'super_admin';

-- Sales role can do sale + shift open/close
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p
ON p.code IN ('pos.sale.create','pos.shift.open','pos.shift.close')
WHERE r.code = 'sales';

-- Seed one default register tied to the default branch + default warehouse
INSERT IGNORE INTO pos_registers (id, branch_id, code, name, name_ar, warehouse_id, is_active)
SELECT 1,
  (SELECT id FROM branches WHERE is_default = 1 LIMIT 1),
  'POS-01', 'POS Counter 1', 'كاشير 1',
  (SELECT id FROM warehouses ORDER BY id LIMIT 1),
  1
WHERE NOT EXISTS (SELECT 1 FROM pos_registers);

SELECT 'POS migration applied' AS result;
