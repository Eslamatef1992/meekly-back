const jwt = require('jsonwebtoken');

// Requires Authorization: Bearer <token>
function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Missing token' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret');
    req.user = payload; // { sub, email, roles: [], perms: [] }
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid or expired token' });
  }
}

// Require any of the given permission codes (or one of these roles is super_admin)
function requirePerm(...codes) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'UNAUTHORIZED' });
    const roles = req.user.roles || [];
    const perms = req.user.perms || [];
    if (roles.includes('super_admin')) return next();
    const ok = codes.some(c => perms.includes(c));
    if (!ok) return res.status(403).json({ error: 'FORBIDDEN', message: 'Missing permission: ' + codes.join(' | ') });
    return next();
  };
}

module.exports = { authRequired, requirePerm };
