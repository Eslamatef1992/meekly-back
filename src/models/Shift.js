const { DataTypes } = require('sequelize');

module.exports = sequelize => sequelize.define('Shift', {
  id:                    { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  shift_no:              { type: DataTypes.STRING(40), unique: true, allowNull: false },
  register_id:           { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  branch_id:             { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  cashier_id:            { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  opened_at:             { type: DataTypes.DATE, allowNull: false },
  opening_cash:          { type: DataTypes.DECIMAL(18,3), defaultValue: 0 },
  closed_at:             { type: DataTypes.DATE, allowNull: true },
  expected_cash:         { type: DataTypes.DECIMAL(18,3), defaultValue: 0 },
  counted_cash:          { type: DataTypes.DECIMAL(18,3), defaultValue: 0 },
  variance:              { type: DataTypes.DECIMAL(18,3), defaultValue: 0 },
  total_sales:           { type: DataTypes.DECIMAL(18,3), defaultValue: 0 },
  sale_count:            { type: DataTypes.INTEGER.UNSIGNED, defaultValue: 0 },
  payment_breakdown_json:{ type: DataTypes.JSON, allowNull: true },   // { cash: 100, knet: 50, card: 30, on_account: 20 }
  z_voucher_id:          { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
  notes:                 { type: DataTypes.STRING(500) },
  status:                { type: DataTypes.ENUM('open','closed','reconciled'), defaultValue: 'open' },
  created_at:            { type: DataTypes.DATE },
  updated_at:            { type: DataTypes.DATE },
}, { tableName: 'pos_shifts' });
