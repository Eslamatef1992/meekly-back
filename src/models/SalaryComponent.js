const { DataTypes } = require('sequelize');

module.exports = sequelize => sequelize.define('SalaryComponent', {
  id:           { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  code:         { type: DataTypes.STRING(40), allowNull: false, unique: true },
  name:         { type: DataTypes.STRING(120), allowNull: false },
  name_ar:      { type: DataTypes.STRING(120) },
  kind:         { type: DataTypes.ENUM('allowance','deduction'), allowNull: false },
  calculation:  { type: DataTypes.ENUM('fixed','percent_of_basic'), defaultValue: 'fixed' },
  default_amount: { type: DataTypes.DECIMAL(18,3), defaultValue: 0 },
  default_percent: { type: DataTypes.DECIMAL(6,3), defaultValue: 0 },  // 0..100
  is_taxable:   { type: DataTypes.TINYINT, defaultValue: 0 },          // future use
  affects_eos:  { type: DataTypes.TINYINT, defaultValue: 0 },          // include in EOS wage base
  gl_account_id:{ type: DataTypes.BIGINT.UNSIGNED, allowNull: true },  // GL account for posting
  is_active:    { type: DataTypes.TINYINT, defaultValue: 1 },
  notes:        { type: DataTypes.STRING(255) },
  created_at:   { type: DataTypes.DATE },
  updated_at:   { type: DataTypes.DATE },
}, { tableName: 'salary_components' });
