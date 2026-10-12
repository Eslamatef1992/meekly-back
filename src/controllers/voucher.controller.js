const { sequelize, Voucher, VoucherLine, Account, Currency, User, Branch, FiscalPeriod } = require('../models');
const voucherService = require('../services/voucher.service');
const HttpError = require('../utils/HttpError');
const { Op } = require('sequelize');

exports.list = async (req, res, next) => {
  try {
    const { type, status, from, to, q, branch_id, fiscal_period_id, page = 1, page_size = 50 } = req.query;
    const where = {};
    if (branch_id) where.branch_id = branch_id;
    if (fiscal_period_id) where.fiscal_period_id = fiscal_period_id;
    if (type) where.voucher_type = type;
    if (status) where.status = status;
    if (from || to) {
      where.voucher_date = {};
      if (from) where.voucher_date[Op.gte] = from;
      if (to)   where.voucher_date[Op.lte] = to;
    }
    if (q) where[Op.or] = [
      { voucher_no:   { [Op.like]: `%${q}%` } },
      { reference:    { [Op.like]: `%${q}%` } },
      { narration:    { [Op.like]: `%${q}%` } },
      { narration_ar: { [Op.like]: `%${q}%` } },
    ];
    const limit = Math.min(Number(page_size) || 50, 500);
    const offset = (Number(page) - 1) * limit;
    const { rows, count } = await Voucher.findAndCountAll({
      where, order: [['voucher_date', 'DESC'], ['id', 'DESC']],
      limit, offset,
      include: [
        { model: Currency, attributes: ['code', 'symbol'] },
        { model: Branch,   attributes: ['code', 'name', 'name_ar'] },
        { model: FiscalPeriod, attributes: ['code', 'name'] },
      ],
    });

    // Aggregate totals for the current filter (across all pages)
    const totals = await Voucher.findAll({
      where,
      attributes: [
        [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('total_debit')), 0), 'sum_debit'],
        [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('total_credit')), 0), 'sum_credit'],
      ],
      raw: true,
    });

    res.json({
      data: rows, total: count, page: Number(page), page_size: limit,
      totals: {
        sum_debit:  Number(totals[0]?.sum_debit  || 0),
        sum_credit: Number(totals[0]?.sum_credit || 0),
      },
    });
  } catch (e) { next(e); }
};

exports.get = async (req, res, next) => {
  try {
    const v = await Voucher.findByPk(req.params.id, {
      include: [
        { model: VoucherLine, as: 'lines', include: [{ model: Account, attributes: ['code', 'name', 'name_ar'] }] },
        { model: Currency },
      ],
    });
    if (!v) throw HttpError.notFound('Voucher not found');
    res.json(v);
  } catch (e) { next(e); }
};

exports.create = async (req, res, next) => {
  try {
    const v = await voucherService.createVoucher(req.body, req.user.sub);
    res.status(201).json(v);
  } catch (e) { next(e); }
};

exports.post = async (req, res, next) => {
  try {
    const v = await voucherService.postVoucher(req.params.id, req.user.sub);
    res.json(v);
  } catch (e) { next(e); }
};

exports.cancel = async (req, res, next) => {
  try {
    const v = await voucherService.cancelVoucher(req.params.id);
    res.json(v);
  } catch (e) { next(e); }
};
