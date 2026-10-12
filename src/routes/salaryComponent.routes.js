const router = require('express').Router();
const { SalaryComponent, EmployeeSalaryComponent, Employee } = require('../models');
const { buildCrud } = require('../utils/crud');
const { authRequired, requirePerm } = require('../middleware/auth');
const HttpError = require('../utils/HttpError');

router.use(authRequired);

const crud = buildCrud(SalaryComponent, { searchFields: ['code', 'name', 'name_ar'], orderBy: 'code' });

router.get('/',         requirePerm('hr.payroll.run'), crud.list);
router.get('/:id',      requirePerm('hr.payroll.run'), crud.get);
router.post('/',        requirePerm('hr.payroll.run'), crud.create);
router.put('/:id',      requirePerm('hr.payroll.run'), crud.update);
router.delete('/:id',   requirePerm('hr.payroll.run'), crud.remove);

// Employee assignment endpoints
router.get('/employee/:employee_id', requirePerm('hr.employee.manage'), async (req, res, next) => {
  try {
    const rows = await EmployeeSalaryComponent.findAll({
      where: { employee_id: req.params.employee_id },
      include: [{ model: SalaryComponent }],
      order: [['effective_from', 'DESC']],
    });
    res.json(rows);
  } catch (e) { next(e); }
});

router.post('/employee/:employee_id', requirePerm('hr.employee.manage'), async (req, res, next) => {
  try {
    const emp = await Employee.findByPk(req.params.employee_id);
    if (!emp) throw HttpError.notFound('Employee not found');
    const row = await EmployeeSalaryComponent.create({ ...req.body, employee_id: emp.id });
    res.status(201).json(row);
  } catch (e) { next(e); }
});

router.put('/employee/:employee_id/:id', requirePerm('hr.employee.manage'), async (req, res, next) => {
  try {
    const row = await EmployeeSalaryComponent.findByPk(req.params.id);
    if (!row) throw HttpError.notFound('Not found');
    await row.update(req.body);
    res.json(row);
  } catch (e) { next(e); }
});

router.delete('/employee/:employee_id/:id', requirePerm('hr.employee.manage'), async (req, res, next) => {
  try {
    const row = await EmployeeSalaryComponent.findByPk(req.params.id);
    if (!row) throw HttpError.notFound('Not found');
    await row.destroy();
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
