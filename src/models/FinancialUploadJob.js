const { DataTypes } = require('sequelize');

module.exports = sequelize => sequelize.define('FinancialUploadJob', {
  id:                { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  fiscal_period_id:  { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  branch_id:         { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
  upload_type:       { type: DataTypes.ENUM('chart_of_accounts', 'vouchers'), allowNull: false },
  original_filename: { type: DataTypes.STRING(255), allowNull: false },
  stored_filename:   { type: DataTypes.STRING(255), allowNull: false },
  file_size:         { type: DataTypes.BIGINT.UNSIGNED, defaultValue: 0 },
  status:            { type: DataTypes.ENUM('queued', 'processing', 'completed', 'failed', 'rolled_back'), defaultValue: 'queued' },
  inserted_rows:     { type: DataTypes.INTEGER.UNSIGNED, defaultValue: 0 },
  skipped_rows:      { type: DataTypes.INTEGER.UNSIGNED, defaultValue: 0 },
  failed_rows:       { type: DataTypes.INTEGER.UNSIGNED, defaultValue: 0 },
  total_debit:       { type: DataTypes.DECIMAL(20, 3), defaultValue: 0 },
  total_credit:      { type: DataTypes.DECIMAL(20, 3), defaultValue: 0 },
  error_message:     { type: DataTypes.TEXT, allowNull: true },
  options_json:      { type: DataTypes.TEXT, allowNull: true },
  uploaded_by:       { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  started_at:        { type: DataTypes.DATE, allowNull: true },
  finished_at:       { type: DataTypes.DATE, allowNull: true },
  created_at:        { type: DataTypes.DATE },
  updated_at:        { type: DataTypes.DATE },
}, { tableName: 'financial_upload_jobs' });
