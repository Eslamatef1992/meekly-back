const { DataTypes } = require('sequelize');

module.exports = sequelize => sequelize.define('Currency', {
  id:           { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  code:         { type: DataTypes.CHAR(3), allowNull: false, unique: true },
  name:         { type: DataTypes.STRING(60), allowNull: false },
  symbol:       { type: DataTypes.STRING(10) },
  decimals:     { type: DataTypes.TINYINT, defaultValue: 3 },
  rate_to_base: { type: DataTypes.DECIMAL(18, 6), defaultValue: 1 },
  is_base:      { type: DataTypes.TINYINT, defaultValue: 0 },
  is_active:    { type: DataTypes.TINYINT, defaultValue: 1 },
}, { tableName: 'currencies' });
