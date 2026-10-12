const { DataTypes } = require('sequelize');

module.exports = sequelize => sequelize.define('Voucher', {
  id:               { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  voucher_no:       { type: DataTypes.STRING(40), allowNull: false, unique: true },
  voucher_type:     { type: DataTypes.ENUM('receipt','payment','journal','contra','sales','purchase'), allowNull: false },
  voucher_date:     { type: DataTypes.DATEONLY, allowNull: false },
  branch_id:        { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  fiscal_period_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
  currency_id:      { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  exchange_rate:    { type: DataTypes.DECIMAL(18, 6), defaultValue: 1 },
  reference:        { type: DataTypes.STRING(120) },
  narration:        { type: DataTypes.STRING(500) },
  narration_ar:     { type: DataTypes.STRING(500) },
  total_debit:      { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 },
  total_credit:     { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 },
  status:           { type: DataTypes.ENUM('draft','posted','cancelled'), defaultValue: 'draft' },
  posted_at:        { type: DataTypes.DATE, allowNull: true },
  posted_by:        { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
  created_by:       { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  created_at:       { type: DataTypes.DATE },
  updated_at:       { type: DataTypes.DATE },
}, { tableName: 'vouchers' });
