const { DataTypes } = require('sequelize');

module.exports = sequelize => sequelize.define('VoucherLine', {
  id:          { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  voucher_id:  { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  line_no:     { type: DataTypes.SMALLINT.UNSIGNED, allowNull: false },
  account_id:  { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  description: { type: DataTypes.STRING(500) },
  debit:       { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 },
  credit:      { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 },
  cost_center: { type: DataTypes.STRING(40) },
  reference:   { type: DataTypes.STRING(120) },
}, { tableName: 'voucher_lines' });
