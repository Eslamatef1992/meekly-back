module.exports = function notFound(req, res) {
  res.status(404).json({ error: 'NOT_FOUND', message: `Route ${req.method} ${req.originalUrl} not found` });
};
