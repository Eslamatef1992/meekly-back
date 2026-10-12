const { DataTypes } = require('sequelize');

module.exports = sequelize => sequelize.define('Role', {
  id:          { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  code:        { type: DataTypes.STRING(60), allowNull: false, unique: true },
  name:        { type: DataTypes.STRING(120), allowNull: false },
  name_ar:     { type: DataTypes.STRING(120), allowNull: true },
  description: { type: DataTypes.STRING(255), allowNull: true },
}, { tableName: 'roles' });
