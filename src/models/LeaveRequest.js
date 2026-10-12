const { DataTypes } = require('sequelize');
module.exports = sequelize => sequelize.define('LeaveRequest', {
  id:            { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  employee_id:   { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  leave_type_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  start_date:    { type: DataTypes.DATEONLY, allowNull: false },
  end_date:      { type: DataTypes.DATEONLY, allowNull: false },
  days:          { type: DataTypes.DECIMAL(6,2), allowNull: false },
  reason:        { type: DataTypes.STRING(500) },
  status:        { type: DataTypes.ENUM('pending','approved','rejected','cancelled'), defaultValue: 'pending' },
  approved_by:   { type: DataTypes.BIGINT.UNSIGNED },
  approved_at:   { type: DataTypes.DATE },
  created_at:    { type: DataTypes.DATE },
}, { tableName: 'leave_requests' });
