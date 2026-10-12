const { DataTypes } = require('sequelize');

module.exports = sequelize => sequelize.define('Branch', {
  id:           { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  company_id:   { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },   // FK → departments(id) — the legal entity this branch belongs to
  code:         { type: DataTypes.STRING(30), allowNull: false, unique: true },
  name:         { type: DataTypes.STRING(160), allowNull: false },
  name_ar:      { type: DataTypes.STRING(160) },
  address:      { type: DataTypes.STRING(255) },
  address_ar:   { type: DataTypes.STRING(255) },
  phone:        { type: DataTypes.STRING(40) },
  email:        { type: DataTypes.STRING(160) },
  manager_name: { type: DataTypes.STRING(160) },
  cr_number:    { type: DataTypes.STRING(40) },   // Commercial Registration (Kuwait)
  tax_number:   { type: DataTypes.STRING(40) },
  is_active:    { type: DataTypes.TINYINT, defaultValue: 1 },
  is_default:   { type: DataTypes.TINYINT, defaultValue: 0 },
  created_at:   { type: DataTypes.DATE },
  updated_at:   { type: DataTypes.DATE },
}, { tableName: 'branches' });
