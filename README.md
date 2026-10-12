# Mekky ERP — Backend API

Node.js + Express + Sequelize backend for the Mekky International ERP system
(Kuwait, multi-branch, bilingual AR/EN, double-entry accounting).

Pairs with the admin frontend at: https://github.com/Eslamatef1992/meekly-admin

## Stack

- **Runtime:** Node.js 20+
- **Framework:** Express 4
- **ORM:** Sequelize 6 (MySQL 8)
- **Auth:** JWT (access + refresh), bcryptjs, role-based ACL with per-branch scoping
- **Validation:** Joi
- **Deployment:** PM2 + nginx + Let's Encrypt (see `deploy/` in the parent project)

## Modules

| Module              | Status |
|---------------------|--------|
| Auth & RBAC         | Done   |
| Multi-branch        | Done   |
| Chart of Accounts   | Done   |
| Vouchers / Journals | Done   |
| General Ledger      | Done   |
| Trial Balance       | Done   |
| Income Statement    | Done   |
| Balance Sheet       | Done   |
| HR (Kuwait Labor)   | Done   |
| Payroll Engine      | Done   |
| Inventory           | Done   |
| POS                 | Stub   |
| E-commerce          | Stub   |

## Quick start

```bash
# 1. Install
npm install

# 2. Configure environment
cp .env.example .env
#   Edit .env — set DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, JWT_SECRET

# 3. Create database
mysql -u root -p -e "CREATE DATABASE mekky_erp CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# 4. Run migrations (in order)
for f in src/migrations/*.sql; do
  mysql -u <user> -p mekky_erp < "$f"
done

# 5. Run
npm run dev        # http://localhost:4000
```

## Project layout

```
src/
├── config/         # DB, env, logger
├── controllers/    # Route handlers (one per module)
├── middleware/     # auth, acl, errorHandler, i18n
├── migrations/     # Idempotent SQL migrations (001..012)
├── models/         # Sequelize models
├── routes/         # Express routers (mounted in app.js)
├── services/       # Business logic (voucher.service, payroll.service, ...)
├── utils/          # HttpError, logger, helpers
└── app.js          # Express app bootstrap
```

## Notes

The large FY2020 import migrations (`010_fy2020_import.sql`,
`011_fy2020_vouchers.sql`, `012_fy2020_vouchers_complete.sql`) contain real
company financial data and are **not** included in this public repository
(see `.gitignore`). They are kept on the production server and distributed
separately to authorized users.

## License

Proprietary — Mekky International.
