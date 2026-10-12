// Global error handler. Returns JSON.
module.exports = function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  // Sequelize validation / NOT NULL / unique errors → return as 400 with readable message
  if (err.name === 'SequelizeValidationError' || err.name === 'SequelizeUniqueConstraintError') {
    const details = (err.errors || []).map(e => ({
      field: e.path,
      message: e.message,
      type: e.validatorKey || e.type,
    }));
    const message = err.name === 'SequelizeUniqueConstraintError'
      ? `Duplicate value: ${details.map(d => d.field).join(', ')}`
      : details.length === 1
        ? `${details[0].field}: ${details[0].message}`
        : `Validation failed for: ${details.map(d => d.field).join(', ')}`;
    return res.status(400).json({ error: 'VALIDATION_ERROR', message, details });
  }

  // Sequelize foreign-key violations
  if (err.name === 'SequelizeForeignKeyConstraintError') {
    return res.status(400).json({
      error: 'FOREIGN_KEY_VIOLATION',
      message: 'Referenced record does not exist or is in use',
      table: err.table,
      fields: err.fields,
    });
  }

  // Sequelize database errors (e.g. raw NOT NULL violation when defaults missing)
  if (err.name === 'SequelizeDatabaseError') {
    const sqlMsg = err.parent?.sqlMessage || err.message;
    return res.status(400).json({ error: 'DATABASE_ERROR', message: sqlMsg });
  }

  const status = err.status || err.statusCode || 500;
  const payload = {
    error: err.code || (status === 500 ? 'INTERNAL_ERROR' : 'ERROR'),
    message: err.message || 'Something went wrong',
  };
  if (err.details) payload.details = err.details;
  if (process.env.NODE_ENV !== 'production' && status === 500) {
    payload.stack = err.stack;
  }
  res.status(status).json(payload);
};
