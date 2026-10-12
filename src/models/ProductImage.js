const { DataTypes } = require('sequelize');
module.exports = sequelize => sequelize.define('ProductImage', {
  id:         { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  product_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  url:        { type: DataTypes.STRING(255), allowNull: false },
  alt:        { type: DataTypes.STRING(160) },
  sort_order: { type: DataTypes.INTEGER, defaultValue: 0 },
}, { tableName: 'product_images' });
