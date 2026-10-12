const router = require('express').Router();
const { Op } = require('sequelize');
const { sequelize, Role, Permission } = require('../models');
const { authRequired, requirePerm } = require('../middleware/auth');
const HttpError = require('../utils/HttpError');

router.use(authRequired);

// All permissions, grouped by module — used by the role permission matrix UI
router.get('/_/permissions', requirePerm('system.roles.manage'), async (req, res, next) => {
  try {
    const all = await Permission.findAll({ order: [['module', 'ASC'], ['code', 'ASC']] });
    const grouped = {};
    for (const p of all) {
      if (!grouped[p.module]) grouped[p.module] = [];
      grouped[p.module].push({ id: p.id, code: p.code, name: p.name });
    }
    res.json(grouped);
  } catch (e) { next(e); }
});

// LIST
router.get('/', requirePerm('system.roles.manage'), async (req, res, next) => {
  try {
    const roles = await Role.findAll({
      order: [['id', 'ASC']],
      include: [{ model: Permission, through: { attributes: [] } }],
    });
    res.json(roles);
  } catch (e) { next(e); }
});

// GET one with permissions
router.get('/:id', requirePerm('system.roles.manage'), async (req, res, next) => {
  try {
    const role = await Role.findByPk(req.params.id, {
      include: [{ model: Permission, through: { attributes: [] } }],
    });
    if (!role) throw HttpError.notFound('Role not found');
    res.json(role);
  } catch (e) { next(e); }
});

// CREATE
router.post('/', requirePerm('system.roles.manage'), async (req, res, next) => {
  try {
    const { code, name, name_ar, description, permission_ids = [] } = req.body || {};
    if (!code || !name) throw HttpError.badRequest('code and name are required');
    const dup = await Role.findOne({ where: { code } });
    if (dup) throw HttpError.conflict('Role code already exists');
    const t = await sequelize.transaction();
    try {
      const role = await Role.create({ code, name, name_ar, description }, { transaction: t });
      if (permission_ids.length) await role.setPermissions(permission_ids, { transaction: t });
      await t.commit();
      res.status(201).json({ id: role.id });
    } catch (e) { await t.rollback(); throw e; }
  } catch (e) { next(e); }
});

// UPDATE (name, description, permissions). Code is immutable.
router.put('/:id', requirePerm('system.roles.manage'), async (req, res, next) => {
  try {
    const role = await Role.findByPk(req.params.id);
    if (!role) throw HttpError.notFound('Role not found');
    const { name, name_ar, description, permission_ids } = req.body || {};
    const t = await sequelize.transaction();
    try {
      if (name !== undefined) role.name = name;
      if (name_ar !== undefined) role.name_ar = name_ar;
      if (description !== undefined) role.description = description;
      await role.save({ transaction: t });
      if (Array.isArray(permission_ids)) await role.setPermissions(permission_ids, { transaction: t });
      await t.commit();
      res.json({ ok: true });
    } catch (e) { await t.rollback(); throw e; }
  } catch (e) { next(e); }
});

// DELETE — but protect the seeded baseline roles
const PROTECTED_ROLES = ['super_admin', 'finance_manager', 'accountant', 'hr_manager', 'inventory_manager', 'sales', 'viewer'];
router.delete('/:id', requirePerm('system.roles.manage'), async (req, res, next) => {
  try {
    const role = await Role.findByPk(req.params.id);
    if (!role) throw HttpError.notFound('Role not found');
    if (PROTECTED_ROLES.includes(role.code)) throw HttpError.badRequest('Built-in roles cannot be deleted');
    const [users] = await sequelize.query('SELECT COUNT(*) AS c FROM user_roles WHERE role_id = :id', { replacements: { id: role.id } });
    if (Number(users[0].c) > 0) throw HttpError.conflict(`Role is assigned to ${users[0].c} user(s) — unassign first`);
    await role.destroy();
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
