const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const errorHandler = require('./middleware/errorHandler');
const notFound = require('./middleware/notFound');

const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const branchRoutes = require('./routes/branch.routes');
const roleRoutes = require('./routes/role.routes');
const companyRoutes = require('./routes/company.routes');
const accountRoutes = require('./routes/account.routes');
const voucherRoutes = require('./routes/voucher.routes');
const reportRoutes = require('./routes/report.routes');
const employeeRoutes = require('./routes/employee.routes');
const leaveRoutes = require('./routes/leave.routes');
const payrollRoutes = require('./routes/payroll.routes');
const salaryComponentRoutes = require('./routes/salaryComponent.routes');
const employeeRequestRoutes = require('./routes/employeeRequest.routes');
const posRoutes = require('./routes/pos.routes');
const itemRoutes = require('./routes/item.routes');
const stockRoutes = require('./routes/stock.routes');
const productRoutes = require('./routes/product.routes');
const orderRoutes = require('./routes/order.routes');
const customerAuthRoutes = require('./routes/customerAuth.routes');
const lookupRoutes = require('./routes/lookup.routes');

const app = express();

// Trust nginx — needed for express-rate-limit and accurate client IPs
app.set('trust proxy', 1);

// security & basic middleware
app.use(helmet());
app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// CORS
const origins = (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: origins.length ? origins : true,
  credentials: true,
}));

// rate limit /auth a bit
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 50 });

// health
app.get('/health', (req, res) => res.json({ ok: true, service: 'mekky-erp-api', time: new Date().toISOString() }));

// routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/branches', branchRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/lookups', lookupRoutes);

// finance
app.use('/api/finance/accounts', accountRoutes);
app.use('/api/finance/vouchers', voucherRoutes);
app.use('/api/finance/reports', reportRoutes);

// hr
app.use('/api/hr/employees', employeeRoutes);
app.use('/api/hr/leaves', leaveRoutes);
app.use('/api/hr/payroll', payrollRoutes);
app.use('/api/hr/salary-components', salaryComponentRoutes);
app.use('/api/hr/requests', employeeRequestRoutes);

// pos
app.use('/api/pos', posRoutes);

// inventory
app.use('/api/inventory/items', itemRoutes);
app.use('/api/inventory/stock', stockRoutes);

// e-commerce
app.use('/api/ecom/products', productRoutes);
app.use('/api/ecom/orders', orderRoutes);
app.use('/api/ecom/auth', customerAuthRoutes);

// 404 + error
app.use(notFound);
app.use(errorHandler);

module.exports = app;
