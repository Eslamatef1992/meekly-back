const { DataTypes } = require('sequelize');

module.exports = sequelize => sequelize.define('Account', {
  id:              { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  code:            { type: DataTypes.STRING(40), allowNull: false, unique: true },
  name:            { type: DataTypes.STRING(160), allowNull: false },
  name_ar:         { type: DataTypes.STRING(160) },
  parent_id:       { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
  account_type:    { type: DataTypes.ENUM('asset','liability','equity','income','expense'), allowNull: false },
  account_subtype: { type: DataTypes.STRING(60) },
  normal_balance:  { type: DataTypes.ENUM('debit','credit'), allowNull: false },
  is_group:        { type: DataTypes.TINYINT, defaultValue: 0 },
  currency_id:     { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
  level:           { type: DataTypes.TINYINT.UNSIGNED, defaultValue: 1 },
  is_active:       { type: DataTypes.TINYINT, defaultValue: 1 },
  notes:           { type: DataTypes.STRING(500) },
  created_at:      { type: DataTypes.DATE },
  updated_at:      { type: DataTypes.DATE },
}, { tableName: 'accounts' });
