const { DataTypes } = require('sequelize');
module.exports = sequelize => sequelize.define('Uom', {
  id:      { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  code:    { type: DataTypes.STRING(20), unique: true, allowNull: false },
  name:    { type: DataTypes.STRING(60), allowNull: false },
  name_ar: { type: DataTypes.STRING(60) },
}, { tableName: 'units_of_measure' });
