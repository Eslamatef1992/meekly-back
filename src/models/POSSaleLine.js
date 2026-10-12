const { DataTypes } = require('sequelize');

module.exports = sequelize => sequelize.define('POSSaleLine', {
  id:          { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  sale_id:     { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  line_no:     { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  item_id:     { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },   // inventory item (preferred)
  product_id:  { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },   // ecom product (alternative)
  sku:         { type: DataTypes.STRING(60), allowNull: true },
  name:        { type: DataTypes.STRING(200), allowNull: false },      // snapshot
  quantity:    { type: DataTypes.DECIMAL(18,3), allowNull: false },
  unit_price:  { type: DataTypes.DECIMAL(18,3), allowNull: false },
  discount:    { type: DataTypes.DECIMAL(18,3), defaultValue: 0 },
  line_total:  { type: DataTypes.DECIMAL(18,3), allowNull: false },
  unit_cost:   { type: DataTypes.DECIMAL(18,3), defaultValue: 0 },     // captured at sale time for COGS
  line_cost:   { type: DataTypes.DECIMAL(18,3), defaultValue: 0 },
}, { tableName: 'pos_sale_lines', timestamps: false });
