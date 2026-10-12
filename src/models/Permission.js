const { DataTypes } = require('sequelize');

module.exports = sequelize => sequelize.define('Permission', {
  id:     { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  code:   { type: DataTypes.STRING(120), allowNull: false, unique: true },
  name:   { type: DataTypes.STRING(160), allowNull: false },
  module: { type: DataTypes.STRING(40), allowNull: false },
}, { tableName: 'permissions' });
