const router = require('express').Router();
const { Employee, Department, LeaveRequest, LeaveType, Payslip, EmployeeRequest, sequelize } = require('../models');
const { Op } = require('sequelize');
const { buildCrud } = require('../utils/crud');
const { authRequired, requirePerm } = require('../middleware/auth');
const { calculateEndOfService, calculateAnnualLeaveBalance, calculateSickLeaveBalance } = require('../services/kuwaitLabor');
const HttpError = require('../utils/HttpError');

router.use(authRequired);

const crud = buildCrud(Employee, { searchFields: ['employee_no', 'full_name', 'full_name_ar', 'email', 'civil_id_no'], orderBy: 'id' });

// Custom list handler — supports q + status + branch_id + company_id (department_id) filters
router.get('/', requirePerm('hr.employee.manage'), async (req, res, next) => {
  try {
    const { q, status, branch_id, company_id, department_id, nationality, page = 1, page_size = 50 } = req.query;
    const where = {};
    if (q) where[Op.or] = [
      { employee_no: { [Op.like]: `%${q}%` } },
      { full_name:   { [Op.like]: `%${q}%` } },
      { full_name_ar:{ [Op.like]: `%${q}%` } },
      { email:       { [Op.like]: `%${q}%` } },
      { civil_id_no: { [Op.like]: `%${q}%` } },
    ];
    if (status) where.status = status;
    if (branch_id) where.branch_id = Number(branch_id);
    // company_id and department_id both map to the same FK
    const deptFilter = company_id || department_id;
    if (deptFilter) where.department_id = Number(deptFilter);
    if (nationality) where.nationality = nationality;

    const limit = Math.min(Number(page_size) || 50, 500);
    const offset = (Number(page) - 1) * limit;
    const { rows, count } = await Employee.findAndCountAll({
      where, order: [['id', 'DESC']], limit, offset,
    });
    res.json({ data: rows, total: count, page: Number(page), page_size: limit });
  } catch (e) { next(e); }
});

router.get('/:id',      requirePerm('hr.employee.manage'), crud.get);
router.post('/',        requirePerm('hr.employee.manage'), crud.create);
router.put('/:id',      requirePerm('hr.employee.manage'), crud.update);
router.delete('/:id',   requirePerm('hr.employee.manage'), crud.remove);

// Kuwait Labor Law: End-of-Service calculator
router.get('/:id/eos', requirePerm('hr.employee.manage'), async (req, res, next) => {
  try {
    const e = await Employee.findByPk(req.params.id);
    if (!e) throw HttpError.notFound('Employee not found');
    const endDate = req.query.end_date || new Date().toISOString().slice(0, 10);
    const reason = req.query.reason || 'termination';
    const eos = calculateEndOfService({
      basicSalary: Number(e.basic_salary),
      hireDate: e.hire_date,
      endDate,
      reason,
      contractType: e.contract_type,
    });
    res.json({ employee_id: e.id, end_date: endDate, reason, ...eos });
  } catch (err) { next(err); }
});

// Annual-leave balance helper
router.get('/:id/leave-balance', requirePerm('hr.employee.manage'), async (req, res, next) => {
  try {
    const e = await Employee.findByPk(req.params.id);
    if (!e) throw HttpError.notFound('Employee not found');
    const balance = calculateAnnualLeaveBalance({
      hireDate: e.hire_date,
      asOf: req.query.as_of ? new Date(req.query.as_of) : new Date(),
      usedDays: Number(req.query.used || 0),
    });
    res.json(balance);
  } catch (err) { next(err); }
});

// Sick leave balance (Article 69 tiered)
router.get('/:id/sick-leave', requirePerm('hr.employee.manage'), async (req, res, next) => {
  try {
    const e = await Employee.findByPk(req.params.id);
    if (!e) throw HttpError.notFound('Employee not found');
    // Sum approved sick leave days for the calendar year
    const year = req.query.year ? Number(req.query.year) : new Date().getFullYear();
    const sickTypes = await LeaveType.findAll({ where: { code: { [Op.like]: 'sick_%' } } });
    const sickTypeIds = sickTypes.map(t => t.id);
    let used = 0;
    if (sickTypeIds.length) {
      const result = await LeaveRequest.findAll({
        where: {
          employee_id: e.id,
          leave_type_id: { [Op.in]: sickTypeIds },
          status: 'approved',
          start_date: { [Op.between]: [`${year}-01-01`, `${year}-12-31`] },
        },
        attributes: [[sequelize.fn('SUM', sequelize.col('days')), 'total']],
        raw: true,
      });
      used = Number(result[0]?.total || 0);
    }
    const balance = calculateSickLeaveBalance({ usedDays: used });
    res.json({ employee_id: e.id, year, ...balance });
  } catch (err) { next(err); }
});

// Employee dashboard summary: leaves, payslips, requests, EOS estimate
router.get('/:id/summary', requirePerm('hr.employee.manage'), async (req, res, next) => {
  try {
    const e = await Employee.findByPk(req.params.id);
    if (!e) throw HttpError.notFound('Employee not found');

    const today = new Date().toISOString().slice(0, 10);
    // EOS estimate as of today
    let eos = null;
    if (e.basic_salary && e.hire_date) {
      try {
        eos = calculateEndOfService({
          basicSalary: Number(e.basic_salary),
          hireDate: e.hire_date,
          endDate: today,
          reason: 'termination',
          contractType: e.contract_type,
        });
      } catch {}
    }

    // Annual leave used this year
    const year = new Date().getFullYear();
    const annualType = await LeaveType.findOne({ where: { code: 'annual' } });
    let annualUsed = 0;
    if (annualType) {
      const r = await LeaveRequest.findAll({
        where: {
          employee_id: e.id,
          leave_type_id: annualType.id,
          status: 'approved',
          start_date: { [Op.between]: [`${year}-01-01`, `${year}-12-31`] },
        },
        attributes: [[sequelize.fn('SUM', sequelize.col('days')), 'total']],
        raw: true,
      });
      annualUsed = Number(r[0]?.total || 0);
    }
    const annual = calculateAnnualLeaveBalance({ hireDate: e.hire_date, asOf: new Date(), usedDays: annualUsed });

    // Last payslip
    const lastPayslip = await Payslip.findOne({ where: { employee_id: e.id }, order: [['period_year', 'DESC'], ['period_month', 'DESC']] });

    // Pending requests count
    const pendingReq = await EmployeeRequest.count({ where: { employee_id: e.id, status: 'pending' } });

    res.json({
      employee_id: e.id,
      eos,
      annual_leave: annual,
      last_payslip: lastPayslip,
      pending_requests: pendingReq,
    });
  } catch (err) { next(err); }
});

// Terminate employee — sets status, computes final settlement
router.post('/:id/terminate', requirePerm('hr.employee.manage'), async (req, res, next) => {
  try {
    const e = await Employee.findByPk(req.params.id);
    if (!e) throw HttpError.notFound('Employee not found');
    const { end_date, reason = 'termination', notes } = req.body || {};
    if (!end_date) throw HttpError.badRequest('end_date is required');

    const eos = calculateEndOfService({
      basicSalary: Number(e.basic_salary || 0),
      hireDate: e.hire_date,
      endDate: end_date,
      reason,
      contractType: e.contract_type,
    });

    // Leave encashment for any unused annual balance
    const year = new Date().getFullYear();
    const annualType = await LeaveType.findOne({ where: { code: 'annual' } });
    let annualUsed = 0;
    if (annualType) {
      const r = await LeaveRequest.findAll({
        where: {
          employee_id: e.id,
          leave_type_id: annualType.id,
          status: 'approved',
          start_date: { [Op.between]: [`${year}-01-01`, `${year}-12-31`] },
        },
        attributes: [[sequelize.fn('SUM', sequelize.col('days')), 'total']],
        raw: true,
      });
      annualUsed = Number(r[0]?.total || 0);
    }
    const leaveBal = calculateAnnualLeaveBalance({ hireDate: e.hire_date, asOf: new Date(end_date), usedDays: annualUsed });
    const dailyWage = Number(e.basic_salary || 0) / 26;
    const leaveEncashment = Math.max(0, leaveBal.balance) * dailyWage;

    e.status = reason === 'resignation' ? 'resigned' : 'terminated';
    e.end_date = end_date;
    await e.save();

    res.json({
      employee_id: e.id,
      end_date,
      reason,
      notes: notes || null,
      eos,
      leave_balance: leaveBal,
      leave_encashment: Math.round(leaveEncashment * 1000) / 1000,
      final_settlement: Math.round((eos.eos + leaveEncashment) * 1000) / 1000,
    });
  } catch (err) { next(err); }
});

// Expiring documents (Iqama, passport, driving license, car registration, health card)
// Returns rows ordered by soonest expiry, with the type and days remaining
router.get('/_/expiring-docs', requirePerm('hr.employee.manage'), async (req, res, next) => {
  try {
    const days = Math.min(Math.max(Number(req.query.days) || 60, 1), 365);
    const [rows] = await sequelize.query(`
      SELECT * FROM (
        SELECT id AS employee_id, employee_no, full_name, full_name_ar, image_url, branch_id,
               'iqama' AS doc_type, residency_expiry AS expiry_date,
               DATEDIFF(residency_expiry, CURDATE()) AS days_left
          FROM employees WHERE status = 'active' AND residency_expiry IS NOT NULL
        UNION ALL
        SELECT id, employee_no, full_name, full_name_ar, image_url, branch_id,
               'passport', passport_expiry, DATEDIFF(passport_expiry, CURDATE())
          FROM employees WHERE status = 'active' AND passport_expiry IS NOT NULL
        UNION ALL
        SELECT id, employee_no, full_name, full_name_ar, image_url, branch_id,
               'civil_id', civil_id_expiry, DATEDIFF(civil_id_expiry, CURDATE())
          FROM employees WHERE status = 'active' AND civil_id_expiry IS NOT NULL
        UNION ALL
        SELECT id, employee_no, full_name, full_name_ar, image_url, branch_id,
               'driving_license', driving_license_expiry, DATEDIFF(driving_license_expiry, CURDATE())
          FROM employees WHERE status = 'active' AND driving_license_expiry IS NOT NULL
        UNION ALL
        SELECT id, employee_no, full_name, full_name_ar, image_url, branch_id,
               'car_registration', car_registration_expiry, DATEDIFF(car_registration_expiry, CURDATE())
          FROM employees WHERE status = 'active' AND car_registration_expiry IS NOT NULL
        UNION ALL
        SELECT id, employee_no, full_name, full_name_ar, image_url, branch_id,
               'health_card', health_card_expiry, DATEDIFF(health_card_expiry, CURDATE())
          FROM employees WHERE status = 'active' AND health_card_expiry IS NOT NULL
      ) x
      WHERE days_left <= :days
      ORDER BY days_left ASC
      LIMIT 200
    `, { replacements: { days } });
    res.json({ days_horizon: days, rows });
  } catch (e) { next(e); }
});

// Departments list (small helper kept here)
router.get('/_/departments', async (req, res, next) => {
  try { res.json(await Department.findAll({ order: [['name', 'ASC']] })); }
  catch (e) { next(e); }
});

router.post('/_/departments', requirePerm('hr.employee.manage'), async (req, res, next) => {
  try { res.status(201).json(await Department.create(req.body)); }
  catch (e) { next(e); }
});

module.exports = router;
