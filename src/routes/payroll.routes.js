const router = require('express').Router();
const { PayrollRun, Payslip, PayslipLine, Employee, Branch } = require('../models');
const { Op } = require('sequelize');
const { authRequired, requirePerm } = require('../middleware/auth');
const payrollService = require('../services/payroll.service');
const HttpError = require('../utils/HttpError');

router.use(authRequired);

// List payroll runs
router.get('/runs', requirePerm('hr.payroll.run'), async (req, res, next) => {
  try {
    const { branch_id, year, status, page = 1, page_size = 50 } = req.query;
    const where = {};
    if (branch_id) where.branch_id = branch_id;
    if (year) where.period_year = year;
    if (status) where.status = status;
    const limit = Math.min(Number(page_size) || 50, 200);
    const offset = (Number(page) - 1) * limit;
    const { rows, count } = await PayrollRun.findAndCountAll({
      where, order: [['period_year', 'DESC'], ['period_month', 'DESC'], ['id', 'DESC']],
      limit, offset,
      include: [{ model: Branch, attributes: ['code', 'name', 'name_ar'] }],
    });
    res.json({ data: rows, total: count, page: Number(page), page_size: limit });
  } catch (e) { next(e); }
});

// Get one run with all payslips
router.get('/runs/:id', requirePerm('hr.payroll.run'), async (req, res, next) => {
  try {
    const run = await PayrollRun.findByPk(req.params.id, {
      include: [
        { model: Branch, attributes: ['code', 'name', 'name_ar'] },
        { model: Payslip, as: 'payslips', include: [{ model: Employee, attributes: ['employee_no', 'full_name', 'full_name_ar', 'department_id'] }] },
      ],
    });
    if (!run) throw HttpError.notFound('Run not found');
    res.json(run);
  } catch (e) { next(e); }
});

// Create a new run (calculates payslips for all active employees in the branch)
router.post('/runs', requirePerm('hr.payroll.run'), async (req, res, next) => {
  try {
    const { branch_id, period_year, period_month, pay_date, notes } = req.body;
    const run = await payrollService.createRun({ branchId: branch_id, periodYear: Number(period_year), periodMonth: Number(period_month), payDate: pay_date, notes, userId: req.user.sub });
    res.status(201).json(run);
  } catch (e) { next(e); }
});

// Post a run (creates JV in Finance)
router.post('/runs/:id/post', requirePerm('hr.payroll.run'), async (req, res, next) => {
  try {
    const result = await payrollService.postRun({ runId: req.params.id, userId: req.user.sub });
    res.json(result);
  } catch (e) { next(e); }
});

// Cancel
router.post('/runs/:id/cancel', requirePerm('hr.payroll.run'), async (req, res, next) => {
  try {
    const run = await payrollService.cancelRun({ runId: req.params.id });
    res.json(run);
  } catch (e) { next(e); }
});

// Individual payslip detail
router.get('/payslips/:id', requirePerm('hr.payroll.run'), async (req, res, next) => {
  try {
    const ps = await Payslip.findByPk(req.params.id, {
      include: [
        { model: PayslipLine, as: 'lines' },
        { model: Employee, attributes: ['employee_no', 'full_name', 'full_name_ar', 'civil_id_no', 'department_id', 'job_title', 'job_title_ar', 'bank_name', 'bank_iban', 'nationality'] },
      ],
    });
    if (!ps) throw HttpError.notFound('Payslip not found');
    res.json(ps);
  } catch (e) { next(e); }
});

module.exports = router;
