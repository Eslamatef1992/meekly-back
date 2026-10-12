const { DataTypes } = require('sequelize');

module.exports = sequelize => sequelize.define('Register', {
  id:        { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  branch_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  code:      { type: DataTypes.STRING(30), allowNull: false, unique: true },
  name:      { type: DataTypes.STRING(120), allowNull: false },
  name_ar:   { type: DataTypes.STRING(120) },
  warehouse_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },  // which warehouse this register sells from
  cash_account_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true }, // optional: dedicated cash account per register
  is_active: { type: DataTypes.TINYINT, defaultValue: 1 },
  created_at:{ type: DataTypes.DATE },
  updated_at:{ type: DataTypes.DATE },
}, { tableName: 'pos_registers' });
