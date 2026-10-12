const { DataTypes } = require('sequelize');
module.exports = sequelize => sequelize.define('Warehouse', {
  id:        { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  branch_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  code:      { type: DataTypes.STRING(30), unique: true, allowNull: false },
  name:      { type: DataTypes.STRING(120), allowNull: false },
  name_ar:   { type: DataTypes.STRING(120) },
  address:   { type: DataTypes.STRING(255) },
  is_active: { type: DataTypes.TINYINT, defaultValue: 1 },
}, { tableName: 'warehouses' });
