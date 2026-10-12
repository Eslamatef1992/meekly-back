const { DataTypes } = require('sequelize');
module.exports = sequelize => sequelize.define('ProductCategory', {
  id:         { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  slug:       { type: DataTypes.STRING(80), unique: true, allowNull: false },
  name:       { type: DataTypes.STRING(120), allowNull: false },
  name_ar:    { type: DataTypes.STRING(120) },
  parent_id:  { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
  image_url:  { type: DataTypes.STRING(255) },
  sort_order: { type: DataTypes.INTEGER, defaultValue: 0 },
}, { tableName: 'product_categories' });
