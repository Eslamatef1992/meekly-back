const { sequelize } = require('../db');

// Core
const Branch = require('./Branch')(sequelize);
const User = require('./User')(sequelize);
const Role = require('./Role')(sequelize);
const Permission = require('./Permission')(sequelize);
const Currency = require('./Currency')(sequelize);
const FiscalPeriod = require('./FiscalPeriod')(sequelize);

// Finance
const Account = require('./Account')(sequelize);
const Voucher = require('./Voucher')(sequelize);
const VoucherLine = require('./VoucherLine')(sequelize);
const GlEntry = require('./GlEntry')(sequelize);

// HR
const Department = require('./Department')(sequelize);
const Employee = require('./Employee')(sequelize);
const LeaveType = require('./LeaveType')(sequelize);
const LeaveRequest = require('./LeaveRequest')(sequelize);
const SalaryComponent = require('./SalaryComponent')(sequelize);
const EmployeeSalaryComponent = require('./EmployeeSalaryComponent')(sequelize);
const PayrollRun = require('./PayrollRun')(sequelize);
const Payslip = require('./Payslip')(sequelize);
const PayslipLine = require('./PayslipLine')(sequelize);
const OvertimeEntry = require('./OvertimeEntry')(sequelize);
const EmployeeRequest = require('./EmployeeRequest')(sequelize);

// Inventory
const Warehouse = require('./Warehouse')(sequelize);
const ItemCategory = require('./ItemCategory')(sequelize);
const Item = require('./Item')(sequelize);
const StockBalance = require('./StockBalance')(sequelize);
const StockMovement = require('./StockMovement')(sequelize);
const Uom = require('./Uom')(sequelize);

// E-Commerce
const ProductCategory = require('./ProductCategory')(sequelize);
const Product = require('./Product')(sequelize);
const ProductImage = require('./ProductImage')(sequelize);
const Customer = require('./Customer')(sequelize);
const Order = require('./Order')(sequelize);
const OrderItem = require('./OrderItem')(sequelize);

// POS
const Register = require('./Register')(sequelize);
const Shift = require('./Shift')(sequelize);
const POSSale = require('./POSSale')(sequelize);
const POSSaleLine = require('./POSSaleLine')(sequelize);
const POSPayment = require('./POSPayment')(sequelize);

// ---- Associations ----
// Branch links
User.belongsTo(Branch, { as: 'defaultBranch', foreignKey: 'default_branch_id' });
Voucher.belongsTo(Branch, { foreignKey: 'branch_id' });
Branch.hasMany(Voucher, { foreignKey: 'branch_id' });
GlEntry.belongsTo(Branch, { foreignKey: 'branch_id' });
Branch.hasMany(GlEntry, { foreignKey: 'branch_id' });
Warehouse.belongsTo(Branch, { foreignKey: 'branch_id' });
Branch.hasMany(Warehouse, { foreignKey: 'branch_id' });
StockMovement.belongsTo(Branch, { foreignKey: 'branch_id' });
Branch.hasMany(StockMovement, { foreignKey: 'branch_id' });
Employee.belongsTo(Branch, { foreignKey: 'branch_id' });
Branch.hasMany(Employee, { foreignKey: 'branch_id' });
Order.belongsTo(Branch, { foreignKey: 'branch_id' });
Branch.hasMany(Order, { foreignKey: 'branch_id' });

User.belongsToMany(Role, { through: 'user_roles', foreignKey: 'user_id', otherKey: 'role_id', timestamps: false });
Role.belongsToMany(User, { through: 'user_roles', foreignKey: 'role_id', otherKey: 'user_id', timestamps: false });
Role.belongsToMany(Permission, { through: 'role_permissions', foreignKey: 'role_id', otherKey: 'permission_id', timestamps: false });
Permission.belongsToMany(Role, { through: 'role_permissions', foreignKey: 'permission_id', otherKey: 'role_id', timestamps: false });

Account.belongsTo(Account, { as: 'parent', foreignKey: 'parent_id' });
Account.hasMany(Account, { as: 'children', foreignKey: 'parent_id' });
Account.belongsTo(Currency, { foreignKey: 'currency_id' });

Voucher.belongsTo(Currency, { foreignKey: 'currency_id' });
Voucher.belongsTo(FiscalPeriod, { foreignKey: 'fiscal_period_id' });
Voucher.hasMany(VoucherLine, { foreignKey: 'voucher_id', as: 'lines' });
VoucherLine.belongsTo(Voucher, { foreignKey: 'voucher_id' });
VoucherLine.belongsTo(Account, { foreignKey: 'account_id' });

GlEntry.belongsTo(Voucher, { foreignKey: 'voucher_id' });
GlEntry.belongsTo(VoucherLine, { foreignKey: 'voucher_line_id' });
GlEntry.belongsTo(Account, { foreignKey: 'account_id' });

Employee.belongsTo(Department, { foreignKey: 'department_id' });
Department.hasMany(Employee, { foreignKey: 'department_id' });

LeaveRequest.belongsTo(Employee, { foreignKey: 'employee_id' });
LeaveRequest.belongsTo(LeaveType, { foreignKey: 'leave_type_id' });

// HR — payroll associations
EmployeeSalaryComponent.belongsTo(Employee, { foreignKey: 'employee_id' });
EmployeeSalaryComponent.belongsTo(SalaryComponent, { foreignKey: 'salary_component_id' });
Employee.hasMany(EmployeeSalaryComponent, { foreignKey: 'employee_id', as: 'compensationLines' });

PayrollRun.belongsTo(Branch, { foreignKey: 'branch_id' });
PayrollRun.hasMany(Payslip, { foreignKey: 'payroll_run_id', as: 'payslips' });
Payslip.belongsTo(PayrollRun, { foreignKey: 'payroll_run_id' });
Payslip.belongsTo(Employee, { foreignKey: 'employee_id' });
Payslip.hasMany(PayslipLine, { foreignKey: 'payslip_id', as: 'lines' });
PayslipLine.belongsTo(Payslip, { foreignKey: 'payslip_id' });
PayslipLine.belongsTo(SalaryComponent, { foreignKey: 'salary_component_id' });

OvertimeEntry.belongsTo(Employee, { foreignKey: 'employee_id' });
OvertimeEntry.belongsTo(Branch, { foreignKey: 'branch_id' });

EmployeeRequest.belongsTo(Employee, { foreignKey: 'employee_id' });
EmployeeRequest.belongsTo(Branch, { foreignKey: 'branch_id' });

// POS associations
Register.belongsTo(Branch, { foreignKey: 'branch_id' });
Register.belongsTo(Warehouse, { foreignKey: 'warehouse_id' });
Branch.hasMany(Register, { foreignKey: 'branch_id' });

Shift.belongsTo(Register, { foreignKey: 'register_id' });
Shift.belongsTo(Branch, { foreignKey: 'branch_id' });
Shift.belongsTo(User, { as: 'cashier', foreignKey: 'cashier_id' });
Register.hasMany(Shift, { foreignKey: 'register_id' });

POSSale.belongsTo(Shift, { foreignKey: 'shift_id' });
POSSale.belongsTo(Register, { foreignKey: 'register_id' });
POSSale.belongsTo(Branch, { foreignKey: 'branch_id' });
POSSale.belongsTo(User, { as: 'cashier', foreignKey: 'cashier_id' });
POSSale.belongsTo(Customer, { foreignKey: 'customer_id' });
POSSale.belongsTo(Warehouse, { foreignKey: 'warehouse_id' });
POSSale.hasMany(POSSaleLine, { foreignKey: 'sale_id', as: 'lines' });
POSSale.hasMany(POSPayment, { foreignKey: 'sale_id', as: 'payments' });
Shift.hasMany(POSSale, { foreignKey: 'shift_id', as: 'sales' });

POSSaleLine.belongsTo(POSSale, { foreignKey: 'sale_id' });
POSSaleLine.belongsTo(Item, { foreignKey: 'item_id' });
POSSaleLine.belongsTo(Product, { foreignKey: 'product_id' });

POSPayment.belongsTo(POSSale, { foreignKey: 'sale_id' });
POSPayment.belongsTo(Account, { foreignKey: 'account_id' });

Item.belongsTo(ItemCategory, { foreignKey: 'category_id' });
Item.belongsTo(Uom, { foreignKey: 'uom_id' });
StockBalance.belongsTo(Item, { foreignKey: 'item_id' });
StockBalance.belongsTo(Warehouse, { foreignKey: 'warehouse_id' });
StockMovement.belongsTo(Item, { foreignKey: 'item_id' });
StockMovement.belongsTo(Warehouse, { foreignKey: 'warehouse_id' });

Product.belongsTo(ProductCategory, { foreignKey: 'category_id' });
Product.hasMany(ProductImage, { foreignKey: 'product_id', as: 'images' });
ProductImage.belongsTo(Product, { foreignKey: 'product_id' });

Order.belongsTo(Customer, { foreignKey: 'customer_id' });
Order.hasMany(OrderItem, { foreignKey: 'order_id', as: 'items' });
OrderItem.belongsTo(Order, { foreignKey: 'order_id' });
OrderItem.belongsTo(Product, { foreignKey: 'product_id' });

module.exports = {
  sequelize,
  Branch,
  User, Role, Permission, Currency, FiscalPeriod,
  Account, Voucher, VoucherLine, GlEntry,
  Department, Employee, LeaveType, LeaveRequest,
  SalaryComponent, EmployeeSalaryComponent,
  PayrollRun, Payslip, PayslipLine,
  OvertimeEntry, EmployeeRequest,
  Warehouse, ItemCategory, Item, StockBalance, StockMovement, Uom,
  ProductCategory, Product, ProductImage, Customer, Order, OrderItem,
  Register, Shift, POSSale, POSSaleLine, POSPayment,
};
