const { DataTypes } = require('sequelize');
module.exports = sequelize => sequelize.define('StockMovement', {
  id:            { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  movement_date: { type: DataTypes.DATEONLY, allowNull: false },
  movement_type: { type: DataTypes.ENUM('in','out','transfer','adjustment'), allowNull: false },
  branch_id:     { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  item_id:       { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  warehouse_id:  { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  quantity:      { type: DataTypes.DECIMAL(18,3), allowNull: false },
  unit_cost:     { type: DataTypes.DECIMAL(18,3), defaultValue: 0 },
  reference:     { type: DataTypes.STRING(120) },
  notes:         { type: DataTypes.STRING(500) },
  created_by:    { type: DataTypes.BIGINT.UNSIGNED },
  created_at:    { type: DataTypes.DATE },
}, { tableName: 'stock_movements' });
