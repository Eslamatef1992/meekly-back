const { DataTypes } = require('sequelize');

module.exports = sequelize => sequelize.define('EmployeeRequest', {
  id:           { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  request_no:   { type: DataTypes.STRING(40), unique: true, allowNull: false },
  employee_id:  { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  branch_id:    { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  request_type: {
    type: DataTypes.ENUM(
      'leave', 'sick_leave',
      'salary_advance', 'loan',
      'salary_certificate', 'noc',
      'iqama_renewal', 'passport_renewal',
      'business_card', 'other'
    ),
    allowNull: false,
  },
  subject:      { type: DataTypes.STRING(160), allowNull: false },
  description:  { type: DataTypes.STRING(2000) },
  amount:       { type: DataTypes.DECIMAL(18,3), defaultValue: 0 },
  from_date:    { type: DataTypes.DATEONLY },
  to_date:      { type: DataTypes.DATEONLY },
  status:       { type: DataTypes.ENUM('pending','approved','rejected','completed','cancelled'), defaultValue: 'pending' },
  approved_by:  { type: DataTypes.BIGINT.UNSIGNED },
  approved_at:  { type: DataTypes.DATE },
  rejection_reason: { type: DataTypes.STRING(500) },
  created_by:   { type: DataTypes.BIGINT.UNSIGNED },
  created_at:   { type: DataTypes.DATE },
  updated_at:   { type: DataTypes.DATE },
}, { tableName: 'employee_requests' });
