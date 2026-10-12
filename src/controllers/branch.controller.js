const { Branch, sequelize } = require('../models');
const HttpError = require('../utils/HttpError');
const { Op } = require('sequelize');

exports.list = async (req, res, next) => {
  try {
    const { q, active, with_stats } = req.query;
    const where = {};
    if (q) where[Op.or] = [
      { code: { [Op.like]: `%${q}%` } },
      { name: { [Op.like]: `%${q}%` } },
      { name_ar: { [Op.like]: `%${q}%` } },
    ];
    if (active !== undefined) where.is_active = active === '1' || active === 'true' ? 1 : 0;

    if (with_stats === '1' || with_stats === 'true') {
      // Single SQL with employee counts + monthly gross + company name
      const [rows] = await sequelize.query(`
        SELECT b.id, b.company_id, b.code, b.name, b.name_ar, b.address, b.address_ar,
               b.phone, b.email, b.manager_name, b.cr_number, b.tax_number,
               b.is_active, b.is_default, b.created_at, b.updated_at,
               d.name AS company_name, d.name_ar AS company_name_ar,
               COUNT(e.id) AS employee_count,
               SUM(CASE WHEN e.status = 'active' THEN 1 ELSE 0 END) AS active_count,
               COALESCE(SUM(e.basic_salary + e.manual_salary + e.housing_allowance + e.transport_allowance + e.other_allowance), 0) AS total_monthly_gross
        FROM branches b
        LEFT JOIN departments d ON d.id = b.company_id
        LEFT JOIN employees e ON e.branch_id = b.id
        GROUP BY b.id
        ORDER BY b.is_default DESC, b.code ASC
      `);
      return res.json(rows);
    }

    const rows = await Branch.findAll({ where, order: [['is_default', 'DESC'], ['code', 'ASC']] });
    res.json(rows);
  } catch (e) { next(e); }
};

exports.get = async (req, res, next) => {
  try {
    const b = await Branch.findByPk(req.params.id);
    if (!b) throw HttpError.notFound('Branch not found');
    res.json(b);
  } catch (e) { next(e); }
};

exports.create = async (req, res, next) => {
  try {
    const b = await Branch.create(req.body);
    res.status(201).json(b);
  } catch (e) { next(e); }
};

exports.update = async (req, res, next) => {
  try {
    const b = await Branch.findByPk(req.params.id);
    if (!b) throw HttpError.notFound('Branch not found');
    await b.update(req.body);
    res.json(b);
  } catch (e) { next(e); }
};

exports.setDefault = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const b = await Branch.findByPk(req.params.id, { transaction: t });
    if (!b) throw HttpError.notFound('Branch not found');
    await Branch.update({ is_default: 0 }, { where: {}, transaction: t });
    b.is_default = 1;
    await b.save({ transaction: t });
    await t.commit();
    res.json(b);
  } catch (e) { await t.rollback(); next(e); }
};

exports.remove = async (req, res, next) => {
  try {
    const b = await Branch.findByPk(req.params.id);
    if (!b) throw HttpError.notFound('Branch not found');
    if (b.is_default) throw HttpError.badRequest('Cannot delete the default branch');
    // soft-delete: just deactivate to preserve referential integrity
    b.is_active = 0;
    await b.save();
    res.json({ ok: true, soft_deleted: true });
  } catch (e) { next(e); }
};
