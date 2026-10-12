const { DataTypes } = require('sequelize');

module.exports = sequelize => sequelize.define('FiscalPeriod', {
  id:         { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  code:       { type: DataTypes.STRING(20), allowNull: false, unique: true },
  name:       { type: DataTypes.STRING(60), allowNull: false },
  start_date: { type: DataTypes.DATEONLY, allowNull: false },
  end_date:   { type: DataTypes.DATEONLY, allowNull: false },
  is_closed:  { type: DataTypes.TINYINT, defaultValue: 0 },
}, { tableName: 'fiscal_periods' });
