const { validationResult } = require('express-validator');

module.exports = function validate(req, res, next) {
  const result = validationResult(req);
  if (result.isEmpty()) return next();
  return res.status(400).json({
    error: 'VALIDATION_ERROR',
    message: 'Invalid input',
    details: result.array().map(e => ({ field: e.path, msg: e.msg })),
  });
};
