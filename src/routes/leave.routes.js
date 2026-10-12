const router = require('express').Router();
const { Op } = require('sequelize');
const { LeaveRequest, Employee, LeaveType } = require('../models');
const { authRequired, requirePerm } = require('../middleware/auth');
const HttpError = require('../utils/HttpError');

router.use(authRequired);

// LIST — joins Employee + LeaveType so the UI gets names not IDs
router.get('/', requirePerm('hr.leave.manage'), async (req, res, next) => {
  try {
    const { q, status, leave_type_id, employee_id, from, to, page = 1, page_size = 50 } = req.query;
    const where = {};
    if (status)        where.status = status;
    if (leave_type_id) where.leave_type_id = Number(leave_type_id);
    if (employee_id)   where.employee_id = Number(employee_id);
    if (from || to) {
      where.start_date = {};
      if (from) where.start_date[Op.gte] = from;
      if (to)   where.start_date[Op.lte] = to;
    }
    const limit = Math.min(Number(page_size) || 50, 200);
    const offset = (Number(page) - 1) * limit;

    const include = [
      { model: Employee,  attributes: ['id', 'employee_no', 'full_name', 'full_name_ar', 'image_url'] },
      { model: LeaveType, attributes: ['id', 'code', 'name', 'name_ar', 'is_paid'] },
    ];

    // Free-text search across employee name / number / leave type
    if (q) {
      include[0].where = { [Op.or]: [
        { full_name:    { [Op.like]: `%${q}%` } },
        { full_name_ar: { [Op.like]: `%${q}%` } },
        { employee_no:  { [Op.like]: `%${q}%` } },
      ] };
      include[0].required = true;
    }

    const { rows, count } = await LeaveRequest.findAndCountAll({
      where, order: [['created_at', 'DESC'], ['id', 'DESC']],
      limit, offset, include, distinct: true,
    });

    // Stats for header badges
    const pendingCount = await LeaveRequest.count({ where: { status: 'pending' } });

    res.json({ data: rows, total: count, page: Number(page), page_size: limit, pending_count: pendingCount });
  } catch (e) { next(e); }
});

router.get('/:id', requirePerm('hr.leave.manage'), async (req, res, next) => {
  try {
    const r = await LeaveRequest.findByPk(req.params.id, {
      include: [
        { model: Employee, attributes: ['employee_no', 'full_name', 'full_name_ar', 'image_url'] },
        { model: LeaveType, attributes: ['code', 'name', 'name_ar'] },
      ],
    });
    if (!r) throw HttpError.notFound('Leave request not found');
    res.json(r);
  } catch (e) { next(e); }
});

router.post('/', requirePerm('hr.leave.manage'), async (req, res, next) => {
  try {
    const { employee_id, leave_type_id, start_date, end_date, days, reason } = req.body || {};
    if (!employee_id || !leave_type_id || !start_date || !end_date) {
      throw HttpError.badRequest('employee_id, leave_type_id, start_date, end_date are required');
    }
    // Auto-calculate days if not provided
    let d = Number(days);
    if (!d || d <= 0) {
      const start = new Date(start_date);
      const end   = new Date(end_date);
      d = Math.max(1, Math.floor((end - start) / 86400000) + 1);
    }
    const r = await LeaveRequest.create({
      employee_id, leave_type_id, start_date, end_date,
      days: d, reason: reason || null, status: 'pending',
    });
    res.status(201).json(r);
  } catch (e) { next(e); }
});

router.put('/:id', requirePerm('hr.leave.manage'), async (req, res, next) => {
  try {
    const r = await LeaveRequest.findByPk(req.params.id);
    if (!r) throw HttpError.notFound('Leave request not found');
    await r.update(req.body);
    res.json(r);
  } catch (e) { next(e); }
});

router.delete('/:id', requirePerm('hr.leave.manage'), async (req, res, next) => {
  try {
    const r = await LeaveRequest.findByPk(req.params.id);
    if (!r) throw HttpError.notFound('Leave request not found');
    await r.destroy();
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/:id/approve', requirePerm('hr.leave.manage'), async (req, res, next) => {
  try {
    const r = await LeaveRequest.findByPk(req.params.id);
    if (!r) throw HttpError.notFound('Leave request not found');
    r.status = 'approved'; r.approved_by = req.user.sub; r.approved_at = new Date();
    await r.save();
    res.json(r);
  } catch (e) { next(e); }
});

router.post('/:id/reject', requirePerm('hr.leave.manage'), async (req, res, next) => {
  try {
    const r = await LeaveRequest.findByPk(req.params.id);
    if (!r) throw HttpError.notFound('Leave request not found');
    r.status = 'rejected'; r.approved_by = req.user.sub; r.approved_at = new Date();
    await r.save();
    res.json(r);
  } catch (e) { next(e); }
});

module.exports = router;
