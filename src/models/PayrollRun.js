const { DataTypes } = require('sequelize');

module.exports = sequelize => sequelize.define('PayrollRun', {
  id:            { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  run_no:        { type: DataTypes.STRING(40), unique: true, allowNull: false },
  branch_id:     { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  period_year:   { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  period_month:  { type: DataTypes.TINYINT.UNSIGNED, allowNull: false },     // 1..12
  pay_date:      { type: DataTypes.DATEONLY, allowNull: false },
  status:        { type: DataTypes.ENUM('draft','calculated','posted','cancelled'), defaultValue: 'draft' },
  voucher_id:    { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },        // resulting JV id
  total_gross:   { type: DataTypes.DECIMAL(18,3), defaultValue: 0 },
  total_deductions: { type: DataTypes.DECIMAL(18,3), defaultValue: 0 },
  total_net:     { type: DataTypes.DECIMAL(18,3), defaultValue: 0 },
  employee_count:{ type: DataTypes.INTEGER.UNSIGNED, defaultValue: 0 },
  notes:         { type: DataTypes.STRING(500) },
  created_by:    { type: DataTypes.BIGINT.UNSIGNED },
  posted_by:     { type: DataTypes.BIGINT.UNSIGNED },
  posted_at:     { type: DataTypes.DATE },
  created_at:    { type: DataTypes.DATE },
  updated_at:    { type: DataTypes.DATE },
}, { tableName: 'payroll_runs' });
