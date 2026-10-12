const { DataTypes } = require('sequelize');
module.exports = sequelize => sequelize.define('Customer', {
  id:            { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  email:         { type: DataTypes.STRING(160), unique: true, allowNull: false },
  full_name:     { type: DataTypes.STRING(160), allowNull: false },
  full_name_ar:  { type: DataTypes.STRING(160) },
  phone:         { type: DataTypes.STRING(40) },
  password_hash: { type: DataTypes.STRING(255) },
  address_line1: { type: DataTypes.STRING(255) },
  address_line2: { type: DataTypes.STRING(255) },
  city:          { type: DataTypes.STRING(80) },
  area:          { type: DataTypes.STRING(80) },
  country:       { type: DataTypes.STRING(80), defaultValue: 'Kuwait' },
  created_at:    { type: DataTypes.DATE },
}, { tableName: 'customers' });
