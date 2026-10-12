const { DataTypes } = require('sequelize');
module.exports = sequelize => sequelize.define('StockBalance', {
  id:           { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  item_id:      { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  warehouse_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  quantity:     { type: DataTypes.DECIMAL(18,3), defaultValue: 0 },
  avg_cost:     { type: DataTypes.DECIMAL(18,3), defaultValue: 0 },
}, { tableName: 'stock_balances' });
