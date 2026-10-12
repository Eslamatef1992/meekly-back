const { DataTypes } = require('sequelize');

module.exports = sequelize => sequelize.define('Item', {
  id:             { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  sku:            { type: DataTypes.STRING(60), unique: true, allowNull: false },
  barcode:        { type: DataTypes.STRING(60), allowNull: true },      // POS scanner
  name:           { type: DataTypes.STRING(200), allowNull: false },
  name_ar:        { type: DataTypes.STRING(200) },
  description:    { type: DataTypes.TEXT },
  description_ar: { type: DataTypes.TEXT },
  category_id:    { type: DataTypes.INTEGER.UNSIGNED },
  uom_id:         { type: DataTypes.INTEGER.UNSIGNED },
  image_url:      { type: DataTypes.STRING(500), allowNull: true },     // product image
  cost_price:     { type: DataTypes.DECIMAL(18,3), defaultValue: 0 },
  sale_price:     { type: DataTypes.DECIMAL(18,3), defaultValue: 0 },
  reorder_level:  { type: DataTypes.DECIMAL(18,3), defaultValue: 0 },
  min_stock:      { type: DataTypes.DECIMAL(18,3), defaultValue: 0 },
  max_stock:      { type: DataTypes.DECIMAL(18,3), defaultValue: 0 },
  weight_kg:      { type: DataTypes.DECIMAL(10,3), allowNull: true },
  dimensions:     { type: DataTypes.STRING(100), allowNull: true },     // e.g. "120x60x75 cm"
  is_active:      { type: DataTypes.TINYINT, defaultValue: 1 },
  is_sellable:    { type: DataTypes.TINYINT, defaultValue: 1 },         // can be sold (POS / e-com)
  is_purchasable: { type: DataTypes.TINYINT, defaultValue: 1 },         // can be purchased (PO)
  created_at:     { type: DataTypes.DATE },
  updated_at:     { type: DataTypes.DATE },
}, { tableName: 'items' });
