/**
 * Companies (legal entities / business divisions).
 * Implemented on top of the existing `departments` table — the seed data treats
 * them as "companies" (MEKKY FURNITURE, MEKKY ELECTRIC, etc.).
 *
 * Endpoints:
 *   GET    /api/companies            list with employee count
 *   GET    /api/companies/:id        single
 *   POST   /api/companies            create
 *   PUT    /api/companies/:id        update
 *   DELETE /api/companies/:id        delete (blocked if any employee is attached)
 */
const router = require('express').Router();
const { sequelize, Department, Employee } = require('../models');
const { authRequired, requirePerm } = require('../middleware/auth');
const HttpError = require('../utils/HttpError');

router.use(authRequired);

router.get('/', async (req, res, next) => {
  try {
    const [rows] = await sequelize.query(`
      SELECT d.id, d.code, d.name, d.name_ar, d.parent_id, d.manager_id,
             COUNT(e.id) AS employee_count,
             SUM(CASE WHEN e.status = 'active' THEN 1 ELSE 0 END) AS active_count,
             COALESCE(SUM(e.basic_salary + e.manual_salary + e.housing_allowance + e.transport_allowance + e.other_allowance), 0) AS total_monthly_gross
      FROM departments d
      LEFT JOIN employees e ON e.department_id = d.id
      GROUP BY d.id, d.code, d.name, d.name_ar, d.parent_id, d.manager_id
      ORDER BY d.name
    `);
    res.json(rows);
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const d = await Department.findByPk(req.params.id);
    if (!d) throw HttpError.notFound('Company not found');
    res.json(d);
  } catch (e) { next(e); }
});

router.post('/', requirePerm('hr.employee.manage'), async (req, res, next) => {
  try {
    const { name, name_ar, code, parent_id, manager_id } = req.body || {};
    if (!name) throw HttpError.badRequest('Company name is required');
    // Derive a code if not provided
    const finalCode = (code && code.trim()) || name.replace(/[^A-Za-z0-9]/g, '').slice(0, 30).toUpperCase();
    const dup = await Department.findOne({ where: { code: finalCode } });
    if (dup) throw HttpError.conflict(`Code "${finalCode}" already exists`);
    const d = await Department.create({ code: finalCode, name, name_ar, parent_id, manager_id });
    res.status(201).json(d);
  } catch (e) { next(e); }
});

router.put('/:id', requirePerm('hr.employee.manage'), async (req, res, next) => {
  try {
    const d = await Department.findByPk(req.params.id);
    if (!d) throw HttpError.notFound('Company not found');
    const { code, ...rest } = req.body || {};   // code is immutable
    await d.update(rest);
    res.json(d);
  } catch (e) { next(e); }
});

router.delete('/:id', requirePerm('hr.employee.manage'), async (req, res, next) => {
  try {
    const d = await Department.findByPk(req.params.id);
    if (!d) throw HttpError.notFound('Company not found');
    const inUse = await Employee.count({ where: { department_id: d.id } });
    if (inUse > 0) throw HttpError.conflict(`Cannot delete — ${inUse} employee(s) are assigned to this company`);
    await d.destroy();
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
