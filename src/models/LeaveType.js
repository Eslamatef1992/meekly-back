const { DataTypes } = require('sequelize');
module.exports = sequelize => sequelize.define('LeaveType', {
  id:                { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  code:              { type: DataTypes.STRING(30), unique: true, allowNull: false },
  name:              { type: DataTypes.STRING(120), allowNull: false },
  name_ar:           { type: DataTypes.STRING(120) },
  annual_quota_days: { type: DataTypes.DECIMAL(6,2), allowNull: true },
  is_paid:           { type: DataTypes.TINYINT, defaultValue: 1 },
}, { tableName: 'leave_types' });
