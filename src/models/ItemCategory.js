const { DataTypes } = require('sequelize');
module.exports = sequelize => sequelize.define('ItemCategory', {
  id:        { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  code:      { type: DataTypes.STRING(30), unique: true, allowNull: false },
  name:      { type: DataTypes.STRING(120), allowNull: false },
  name_ar:   { type: DataTypes.STRING(120) },
  parent_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
}, { tableName: 'item_categories' });
