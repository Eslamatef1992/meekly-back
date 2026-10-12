const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const { sequelize, User, Role, Permission, Branch } = require('../models');
const { authRequired, requirePerm } = require('../middleware/auth');
const HttpError = require('../utils/HttpError');

router.use(authRequired);

// LIST users (with roles + accessible branches)
router.get('/', requirePerm('system.users.manage'), async (req, res, next) => {
  try {
    const { q, active, page = 1, page_size = 50 } = req.query;
    const where = {};
    if (q) where[Op.or] = [
      { email:     { [Op.like]: `%${q}%` } },
      { username:  { [Op.like]: `%${q}%` } },
      { full_name: { [Op.like]: `%${q}%` } },
    ];
    if (active !== undefined && active !== '') where.is_active = active === '1' || active === 'true' ? 1 : 0;
    const limit = Math.min(Number(page_size) || 50, 200);
    const offset = (Number(page) - 1) * limit;
    const { rows, count } = await User.findAndCountAll({
      where, attributes: { exclude: ['password_hash'] }, order: [['id', 'ASC']],
      limit, offset,
      include: [{ model: Role, through: { attributes: [] } }],
    });
    res.json({ data: rows, total: count, page: Number(page), page_size: limit });
  } catch (e) { next(e); }
});

// GET ONE — with roles + branch ACL
router.get('/:id', requirePerm('system.users.manage'), async (req, res, next) => {
  try {
    const user = await User.findByPk(req.params.id, {
      attributes: { exclude: ['password_hash'] },
      include: [{ model: Role, through: { attributes: [] } }],
    });
    if (!user) throw HttpError.notFound('User not found');
    // accessible branches via user_branches join table
    const [branchRows] = await sequelize.query(
      'SELECT branch_id FROM user_branches WHERE user_id = :id',
      { replacements: { id: user.id } }
    );
    const branchIds = branchRows.map(r => r.branch_id);
    res.json({ ...user.toJSON(), branch_ids: branchIds });
  } catch (e) { next(e); }
});

// CREATE
router.post('/', requirePerm('system.users.manage'), async (req, res, next) => {
  try {
    const { email, username, full_name, full_name_ar, phone, password, default_branch_id, role_ids = [], branch_ids = [] } = req.body || {};
    if (!email || !full_name) throw HttpError.badRequest('email and full_name required');
    const existing = await User.findOne({ where: { email } });
    if (existing) throw HttpError.conflict('Email already in use');
    const password_hash = await bcrypt.hash(password || 'Welcome@123', 10);
    const t = await sequelize.transaction();
    try {
      const user = await User.create({
        email, username: username || null, full_name, full_name_ar,
        phone, password_hash, default_branch_id: default_branch_id || null, is_active: 1,
      }, { transaction: t });
      if (role_ids.length) await user.setRoles(role_ids, { transaction: t });
      if (branch_ids.length) {
        for (const bid of branch_ids) {
          await sequelize.query('INSERT IGNORE INTO user_branches (user_id, branch_id) VALUES (:u, :b)', {
            replacements: { u: user.id, b: bid }, transaction: t,
          });
        }
      }
      await t.commit();
      res.status(201).json({ id: user.id });
    } catch (e) { await t.rollback(); throw e; }
  } catch (e) { next(e); }
});

// UPDATE
router.put('/:id', requirePerm('system.users.manage'), async (req, res, next) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) throw HttpError.notFound('User not found');
    const { full_name, full_name_ar, phone, username, default_branch_id, is_active, role_ids, branch_ids } = req.body || {};
    const t = await sequelize.transaction();
    try {
      if (full_name !== undefined) user.full_name = full_name;
      if (full_name_ar !== undefined) user.full_name_ar = full_name_ar;
      if (phone !== undefined) user.phone = phone;
      if (username !== undefined) user.username = username;
      if (default_branch_id !== undefined) user.default_branch_id = default_branch_id;
      if (is_active !== undefined) user.is_active = is_active ? 1 : 0;
      await user.save({ transaction: t });
      if (Array.isArray(role_ids)) await user.setRoles(role_ids, { transaction: t });
      if (Array.isArray(branch_ids)) {
        await sequelize.query('DELETE FROM user_branches WHERE user_id = :u', { replacements: { u: user.id }, transaction: t });
        for (const bid of branch_ids) {
          await sequelize.query('INSERT IGNORE INTO user_branches (user_id, branch_id) VALUES (:u, :b)', {
            replacements: { u: user.id, b: bid }, transaction: t,
          });
        }
      }
      await t.commit();
      res.json({ ok: true });
    } catch (e) { await t.rollback(); throw e; }
  } catch (e) { next(e); }
});

// Reset password
router.post('/:id/reset-password', requirePerm('system.users.manage'), async (req, res, next) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) throw HttpError.notFound('User not found');
    const newPwd = req.body?.password || ('Welcome@' + Math.floor(1000 + Math.random() * 9000));
    user.password_hash = await bcrypt.hash(newPwd, 10);
    await user.save();
    res.json({ ok: true, password: newPwd });    // returned once so admin can share with user
  } catch (e) { next(e); }
});

// Self password change
router.post('/me/change-password', async (req, res, next) => {
  try {
    const { current_password, new_password } = req.body || {};
    if (!current_password || !new_password) throw HttpError.badRequest('current_password and new_password required');
    const user = await User.findByPk(req.user.sub);
    if (!user) throw HttpError.notFound('User not found');
    const ok = await bcrypt.compare(current_password, user.password_hash);
    if (!ok) throw HttpError.unauthorized('Current password incorrect');
    user.password_hash = await bcrypt.hash(new_password, 10);
    await user.save();
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Deactivate (soft)
router.delete('/:id', requirePerm('system.users.manage'), async (req, res, next) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) throw HttpError.notFound('User not found');
    if (req.user.sub == user.id) throw HttpError.badRequest('You cannot deactivate yourself');
    user.is_active = 0;
    await user.save();
    res.json({ ok: true, soft_deleted: true });
  } catch (e) { next(e); }
});

// helpers used by user-edit dropdowns
router.get('/_/roles', async (req, res, next) => {
  try {
    const roles = await Role.findAll({ order: [['name', 'ASC']] });
    res.json(roles);
  } catch (e) { next(e); }
});

router.get('/_/branches', async (req, res, next) => {
  try {
    const branches = await Branch.findAll({ where: { is_active: 1 }, order: [['code', 'ASC']] });
    res.json(branches);
  } catch (e) { next(e); }
});

module.exports = router;
