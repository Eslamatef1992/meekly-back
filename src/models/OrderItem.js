const { DataTypes } = require('sequelize');
module.exports = sequelize => sequelize.define('OrderItem', {
  id:           { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  order_id:     { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  product_id:   { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
  product_name: { type: DataTypes.STRING(200), allowNull: false },
  sku:          { type: DataTypes.STRING(60) },
  unit_price:   { type: DataTypes.DECIMAL(18,3), allowNull: false },
  quantity:     { type: DataTypes.DECIMAL(18,3), allowNull: false },
  line_total:   { type: DataTypes.DECIMAL(18,3), allowNull: false },
}, { tableName: 'order_items' });
