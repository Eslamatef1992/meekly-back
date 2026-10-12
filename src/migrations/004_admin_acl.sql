-- 004_admin_acl.sql
-- Per-user branch ACL + RBAC reinforcement
-- Idempotent — safe to re-run

-- 1. user_branches join (which branches a non-super_admin can operate in)
CREATE TABLE IF NOT EXISTS user_branches (
  user_id   BIGINT UNSIGNED NOT NULL,
  branch_id INT UNSIGNED    NOT NULL,
  PRIMARY KEY (user_id, branch_id),
  KEY ix_user_branches_branch (branch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Make sure all listed permissions exist (seed any missing ones discovered later)
INSERT IGNORE INTO permissions (code, name, module) VALUES
  ('system.branch.manage', 'Manage branches', 'system'),
  ('system.audit.view',    'View audit log',  'system'),
  ('system.settings.edit', 'Edit system settings', 'system');

-- 3. super_admin should hold ALL permissions (re-grant in case new perms were added)
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE code = 'super_admin'), id
FROM permissions;

-- 4. Seed: give the admin@mekky.com user (id=1 assumed) access to all branches
INSERT IGNORE INTO user_branches (user_id, branch_id)
SELECT u.id, b.id
FROM users u CROSS JOIN branches b
WHERE u.email = 'admin@mekky.com' AND b.is_active = 1;

SELECT 'Admin ACL migration applied' AS result;
