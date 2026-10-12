const { Account, GlEntry, sequelize } = require('../models');
const HttpError = require('../utils/HttpError');
const { Op } = require('sequelize');

exports.list = async (req, res, next) => {
  try {
    const { q, type, is_group, parent_id } = req.query;
    const where = {};
    if (q) where[Op.or] = [{ code: { [Op.like]: `%${q}%` } }, { name: { [Op.like]: `%${q}%` } }, { name_ar: { [Op.like]: `%${q}%` } }];
    if (type) where.account_type = type;
    if (is_group !== undefined) where.is_group = is_group === 'true' ? 1 : 0;
    if (parent_id !== undefined) where.parent_id = parent_id === 'null' ? null : Number(parent_id);
    const accounts = await Account.findAll({ where, order: [['code', 'ASC']] });
    res.json(accounts);
  } catch (e) { next(e); }
};

// Tree view
exports.tree = async (req, res, next) => {
  try {
    const accounts = await Account.findAll({ order: [['code', 'ASC']] });
    const byId = new Map();
    const roots = [];
    accounts.forEach(a => { a = a.toJSON(); a.children = []; byId.set(a.id, a); });
    byId.forEach(a => {
      if (a.parent_id && byId.has(a.parent_id)) byId.get(a.parent_id).children.push(a);
      else roots.push(a);
    });
    res.json(roots);
  } catch (e) { next(e); }
};

exports.get = async (req, res, next) => {
  try {
    const acc = await Account.findByPk(req.params.id);
    if (!acc) throw HttpError.notFound('Account not found');
    res.json(acc);
  } catch (e) { next(e); }
};

exports.create = async (req, res, next) => {
  try {
    const data = req.body;
    if (!data.code || !data.name || !data.account_type || !data.normal_balance) {
      throw HttpError.badRequest('code, name, account_type, normal_balance required');
    }
    const dup = await Account.findOne({ where: { code: data.code } });
    if (dup) throw HttpError.conflict('Account code already exists');
    const acc = await Account.create(data);
    res.status(201).json(acc);
  } catch (e) { next(e); }
};

exports.update = async (req, res, next) => {
  try {
    const acc = await Account.findByPk(req.params.id);
    if (!acc) throw HttpError.notFound('Account not found');
    const protectedFields = ['id', 'code']; // code stays immutable
    Object.keys(req.body).forEach(k => {
      if (!protectedFields.includes(k)) acc[k] = req.body[k];
    });
    await acc.save();
    res.json(acc);
  } catch (e) { next(e); }
};

exports.remove = async (req, res, next) => {
  try {
    const acc = await Account.findByPk(req.params.id);
    if (!acc) throw HttpError.notFound('Account not found');
    const child = await Account.findOne({ where: { parent_id: acc.id } });
    if (child) throw HttpError.conflict('Account has children');
    const used = await GlEntry.findOne({ where: { account_id: acc.id } });
    if (used) throw HttpError.conflict('Account has GL entries; deactivate instead');
    await acc.destroy();
    res.json({ ok: true });
  } catch (e) { next(e); }
};

// balance for one account in a date range
exports.balance = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { from, to } = req.query;
    const where = ['account_id = :id'];
    const repl = { id };
    if (from) { where.push('entry_date >= :from'); repl.from = from; }
    if (to)   { where.push('entry_date <= :to');   repl.to = to; }
    const [rows] = await sequelize.query(
      `SELECT COALESCE(SUM(debit),0) AS debit_sum, COALESCE(SUM(credit),0) AS credit_sum
       FROM gl_entries WHERE ${where.join(' AND ')}`,
      { replacements: repl }
    );
    const debit_sum = Number(rows[0].debit_sum);
    const credit_sum = Number(rows[0].credit_sum);
    res.json({ account_id: id, debit: debit_sum, credit: credit_sum, balance: debit_sum - credit_sum });
  } catch (e) { next(e); }
};
