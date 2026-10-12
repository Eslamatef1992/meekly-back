const { DataTypes } = require('sequelize');

module.exports = sequelize => sequelize.define('OvertimeEntry', {
  id:            { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  employee_id:   { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  branch_id:     { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  entry_date:    { type: DataTypes.DATEONLY, allowNull: false },
  regular_hours: { type: DataTypes.DECIMAL(6,2), defaultValue: 0 },
  weekend_hours: { type: DataTypes.DECIMAL(6,2), defaultValue: 0 },
  status:        { type: DataTypes.ENUM('pending','approved','rejected','paid'), defaultValue: 'pending' },
  approved_by:   { type: DataTypes.BIGINT.UNSIGNED },
  approved_at:   { type: DataTypes.DATE },
  notes:         { type: DataTypes.STRING(255) },
  created_at:    { type: DataTypes.DATE },
  updated_at:    { type: DataTypes.DATE },
}, { tableName: 'overtime_entries' });
