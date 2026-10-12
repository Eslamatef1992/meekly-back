const { DataTypes } = require('sequelize');

module.exports = sequelize => sequelize.define('User', {
  id:            { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  email:         { type: DataTypes.STRING(160), allowNull: false, unique: true },
  username:      { type: DataTypes.STRING(80), allowNull: true, unique: true },
  password_hash: { type: DataTypes.STRING(255), allowNull: false },
  full_name:     { type: DataTypes.STRING(160), allowNull: false },
  full_name_ar:  { type: DataTypes.STRING(160), allowNull: true },
  phone:         { type: DataTypes.STRING(40), allowNull: true },
  default_branch_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
  is_active:     { type: DataTypes.TINYINT, defaultValue: 1 },
  last_login_at: { type: DataTypes.DATE, allowNull: true },
  created_at:    { type: DataTypes.DATE },
  updated_at:    { type: DataTypes.DATE },
}, { tableName: 'users' });
