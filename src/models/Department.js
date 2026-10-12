const { DataTypes } = require('sequelize');
module.exports = sequelize => sequelize.define('Department', {
  id:        { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  code:      { type: DataTypes.STRING(30), unique: true, allowNull: false },
  name:      { type: DataTypes.STRING(120), allowNull: false },
  name_ar:   { type: DataTypes.STRING(120) },
  parent_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
  manager_id:{ type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
}, { tableName: 'departments' });
