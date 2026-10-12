const { DataTypes } = require('sequelize');

module.exports = sequelize => sequelize.define('PayslipLine', {
  id:                    { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  payslip_id:            { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  salary_component_id:   { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
  kind:                  { type: DataTypes.ENUM('basic','allowance','overtime','deduction','pifss'), allowNull: false },
  label:                 { type: DataTypes.STRING(120), allowNull: false },
  label_ar:              { type: DataTypes.STRING(120) },
  amount:                { type: DataTypes.DECIMAL(18,3), allowNull: false },
  notes:                 { type: DataTypes.STRING(255) },
}, { tableName: 'payslip_lines', timestamps: false });
