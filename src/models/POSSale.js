const { DataTypes } = require('sequelize');

module.exports = sequelize => sequelize.define('POSSale', {
  id:            { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  sale_no:       { type: DataTypes.STRING(40), unique: true, allowNull: false },
  shift_id:      { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  register_id:   { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  branch_id:     { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  warehouse_id:  { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  cashier_id:    { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  customer_id:   { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },   // null = walk-in
  customer_name: { type: DataTypes.STRING(160) },                         // snapshot or walk-in label
  sale_date:     { type: DataTypes.DATE, allowNull: false },
  subtotal:      { type: DataTypes.DECIMAL(18,3), defaultValue: 0 },
  discount:      { type: DataTypes.DECIMAL(18,3), defaultValue: 0 },
  tax:           { type: DataTypes.DECIMAL(18,3), defaultValue: 0 },
  total:         { type: DataTypes.DECIMAL(18,3), defaultValue: 0 },
  total_cost:    { type: DataTypes.DECIMAL(18,3), defaultValue: 0 },     // sum of (qty × avg_cost) at time of sale
  paid_total:    { type: DataTypes.DECIMAL(18,3), defaultValue: 0 },
  change_due:    { type: DataTypes.DECIMAL(18,3), defaultValue: 0 },
  status:        { type: DataTypes.ENUM('completed','voided','refunded'), defaultValue: 'completed' },
  voucher_id:    { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },   // linked Finance JV
  notes:         { type: DataTypes.STRING(500) },
  created_at:    { type: DataTypes.DATE },
  updated_at:    { type: DataTypes.DATE },
}, { tableName: 'pos_sales' });
