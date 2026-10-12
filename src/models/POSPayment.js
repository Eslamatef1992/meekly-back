const { DataTypes } = require('sequelize');

module.exports = sequelize => sequelize.define('POSPayment', {
  id:        { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  sale_id:   { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  method:    { type: DataTypes.ENUM('cash','knet','card','on_account','voucher','other'), allowNull: false },
  amount:    { type: DataTypes.DECIMAL(18,3), allowNull: false },
  reference: { type: DataTypes.STRING(120) },        // KNET ref, card last-4, etc.
  account_id:{ type: DataTypes.BIGINT.UNSIGNED, allowNull: true },   // resolved Finance account for the JV
  notes:     { type: DataTypes.STRING(255) },
  created_at:{ type: DataTypes.DATE },
}, { tableName: 'pos_payments' });
