const { DataTypes } = require('sequelize');

module.exports = sequelize => sequelize.define('GlEntry', {
  id:              { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  voucher_id:      { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  voucher_line_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  entry_date:      { type: DataTypes.DATEONLY, allowNull: false },
  branch_id:       { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  account_id:      { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  debit:           { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 },
  credit:          { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 },
  currency_id:     { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  fiscal_period_id:{ type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
  narration:       { type: DataTypes.STRING(500) },
  created_at:      { type: DataTypes.DATE },
}, { tableName: 'gl_entries' });
