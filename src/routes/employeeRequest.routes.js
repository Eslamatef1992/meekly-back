const router = require('express').Router();
const { EmployeeRequest, Employee } = require('../models');
const { Op } = require('sequelize');
const { authRequired, requirePerm } = require('../middleware/auth');
const HttpError = require('../utils/HttpError');

router.use(authRequired);

async function nextRequestNo() {
  const year = new Date().getFullYear();
  const prefix = `REQ-${year}`;
  const last = await EmployeeRequest.findOne({ where: { request_no: { [Op.like]: `${prefix}-%` } }, order: [['id', 'DESC']] });
  if (!last) return `${prefix}-0001`;
  const parts = last.request_no.split('-');
  const seq = parseInt(parts[parts.length - 1], 10) + 1;
  return `${prefix}-${String(seq).padStart(4, '0')}`;
}

router.get('/', requirePerm('hr.employee.manage'), async (req, res, next) => {
  try {
    const { branch_id, type, status, employee_id, q, page = 1, page_size = 50 } = req.query;
    const where = {};
    if (branch_id) where.branch_id = branch_id;
    if (type) where.request_type = type;
    if (status) where.status = status;
    if (employee_id) where.employee_id = employee_id;
    if (q) where[Op.or] = [{ request_no: { [Op.like]: `%${q}%` } }, { subject: { [Op.like]: `%${q}%` } }];
    const limit = Math.min(Number(page_size) || 50, 200);
    const offset = (Number(page) - 1) * limit;
    const { rows, count } = await EmployeeRequest.findAndCountAll({
      where, order: [['created_at', 'DESC'], ['id', 'DESC']],
      limit, offset,
      include: [{ model: Employee, attributes: ['employee_no', 'full_name', 'full_name_ar'] }],
    });
    res.json({ data: rows, total: count, page: Number(page), page_size: limit });
  } catch (e) { next(e); }
});

router.get('/:id', requirePerm('hr.employee.manage'), async (req, res, next) => {
  try {
    const r = await EmployeeRequest.findByPk(req.params.id, {
      include: [{ model: Employee, attributes: ['employee_no', 'full_name', 'full_name_ar', 'department_id'] }],
    });
    if (!r) throw HttpError.notFound('Request not found');
    res.json(r);
  } catch (e) { next(e); }
});

router.post('/', requirePerm('hr.employee.manage'), async (req, res, next) => {
  try {
    const emp = await Employee.findByPk(req.body.employee_id);
    if (!emp) throw HttpError.badRequest('Employee not found');
    const r = await EmployeeRequest.create({
      ...req.body,
      branch_id: req.body.branch_id || emp.branch_id,
      request_no: await nextRequestNo(),
      status: 'pending',
      created_by: req.user.sub,
    });
    res.status(201).json(r);
  } catch (e) { next(e); }
});

router.put('/:id', requirePerm('hr.employee.manage'), async (req, res, next) => {
  try {
    const r = await EmployeeRequest.findByPk(req.params.id);
    if (!r) throw HttpError.notFound('Not found');
    await r.update(req.body);
    res.json(r);
  } catch (e) { next(e); }
});

router.post('/:id/approve', requirePerm('hr.employee.manage'), async (req, res, next) => {
  try {
    const r = await EmployeeRequest.findByPk(req.params.id);
    if (!r) throw HttpError.notFound('Not found');
    r.status = 'approved';
    r.approved_by = req.user.sub;
    r.approved_at = new Date();
    await r.save();
    res.json(r);
  } catch (e) { next(e); }
});

router.post('/:id/reject', requirePerm('hr.employee.manage'), async (req, res, next) => {
  try {
    const r = await EmployeeRequest.findByPk(req.params.id);
    if (!r) throw HttpError.notFound('Not found');
    r.status = 'rejected';
    r.rejection_reason = req.body.reason || null;
    r.approved_by = req.user.sub;
    r.approved_at = new Date();
    await r.save();
    res.json(r);
  } catch (e) { next(e); }
});

router.post('/:id/complete', requirePerm('hr.employee.manage'), async (req, res, next) => {
  try {
    const r = await EmployeeRequest.findByPk(req.params.id);
    if (!r) throw HttpError.notFound('Not found');
    r.status = 'completed';
    await r.save();
    res.json(r);
  } catch (e) { next(e); }
});

module.exports = router;
