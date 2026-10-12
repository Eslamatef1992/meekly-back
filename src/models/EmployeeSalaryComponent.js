const { DataTypes } = require('sequelize');

module.exports = sequelize => sequelize.define('EmployeeSalaryComponent', {
  id:                    { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  employee_id:           { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  salary_component_id:   { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  amount:                { type: DataTypes.DECIMAL(18,3), defaultValue: 0 },
  percent:               { type: DataTypes.DECIMAL(6,3), defaultValue: 0 },
  effective_from:        { type: DataTypes.DATEONLY, allowNull: false },
  effective_to:          { type: DataTypes.DATEONLY, allowNull: true },
  is_active:             { type: DataTypes.TINYINT, defaultValue: 1 },
  notes:                 { type: DataTypes.STRING(255) },
  created_at:            { type: DataTypes.DATE },
  updated_at:            { type: DataTypes.DATE },
}, { tableName: 'employee_salary_components' });
