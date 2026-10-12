const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User, Role, Permission, Branch } = require('../models');
const HttpError = require('../utils/HttpError');

const ACCESS_TTL  = process.env.JWT_ACCESS_TTL  || '1d';
const REFRESH_TTL = process.env.JWT_REFRESH_TTL || '14d';
const SECRET      = process.env.JWT_SECRET || 'dev_secret';

async function buildTokenPayload(user) {
  // load roles + perms
  const fullUser = await User.findByPk(user.id, {
    include: [{
      model: Role,
      through: { attributes: [] },
      include: [{ model: Permission, through: { attributes: [] } }],
    }],
  });
  const roles = (fullUser.Roles || []).map(r => r.code);
  const permSet = new Set();
  (fullUser.Roles || []).forEach(r => (r.Permissions || []).forEach(p => permSet.add(p.code)));
  return {
    sub: user.id,
    email: user.email,
    name: user.full_name,
    roles,
    perms: [...permSet],
  };
}

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) throw HttpError.badRequest('email and password required');

    const user = await User.findOne({ where: { email } });
    if (!user || !user.is_active) throw HttpError.unauthorized('Invalid credentials');

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) throw HttpError.unauthorized('Invalid credentials');

    const payload = await buildTokenPayload(user);
    const accessToken  = jwt.sign(payload, SECRET, { expiresIn: ACCESS_TTL });
    const refreshToken = jwt.sign({ sub: payload.sub, type: 'refresh' }, SECRET, { expiresIn: REFRESH_TTL });

    user.last_login_at = new Date();
    await user.save();

    // Branches the user can see (everyone can see all active branches for now)
    const branches = await Branch.findAll({ where: { is_active: 1 }, order: [['is_default', 'DESC'], ['code', 'ASC']] });
    let defaultBranchId = user.default_branch_id;
    if (!defaultBranchId) {
      const def = branches.find(b => b.is_default) || branches[0];
      defaultBranchId = def ? def.id : null;
    }

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id, email: user.email, full_name: user.full_name, full_name_ar: user.full_name_ar,
        roles: payload.roles, perms: payload.perms,
        default_branch_id: defaultBranchId,
      },
      branches,
    });
  } catch (e) { next(e); }
};

exports.me = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.sub);
    if (!user) throw HttpError.notFound('User not found');
    const payload = await buildTokenPayload(user);
    const branches = await Branch.findAll({ where: { is_active: 1 }, order: [['is_default', 'DESC'], ['code', 'ASC']] });
    res.json({
      id: user.id, email: user.email, full_name: user.full_name,
      full_name_ar: user.full_name_ar, roles: payload.roles, perms: payload.perms,
      default_branch_id: user.default_branch_id,
      branches,
    });
  } catch (e) { next(e); }
};

exports.refresh = async (req, res, next) => {
  try {
    const { refreshToken } = req.body || {};
    if (!refreshToken) throw HttpError.badRequest('refreshToken required');
    let decoded;
    try { decoded = jwt.verify(refreshToken, SECRET); }
    catch { throw HttpError.unauthorized('Invalid refresh token'); }
    if (decoded.type !== 'refresh') throw HttpError.unauthorized('Wrong token type');
    const user = await User.findByPk(decoded.sub);
    if (!user || !user.is_active) throw HttpError.unauthorized();
    const payload = await buildTokenPayload(user);
    const accessToken = jwt.sign(payload, SECRET, { expiresIn: ACCESS_TTL });
    res.json({ accessToken });
  } catch (e) { next(e); }
};
