const router = require('express').Router();
const { Op } = require('sequelize');
const {
  Register, Shift, POSSale, POSSaleLine, POSPayment,
  Branch, Warehouse, User, Customer, Item, StockBalance,
} = require('../models');
const { authRequired, requirePerm } = require('../middleware/auth');
const pos = require('../services/pos.service');
const HttpError = require('../utils/HttpError');

router.use(authRequired);

// ---------- REGISTERS ----------
router.get('/registers', async (req, res, next) => {
  try {
    const { branch_id } = req.query;
    const where = {};
    if (branch_id) where.branch_id = branch_id;
    const rows = await Register.findAll({
      where, order: [['code', 'ASC']],
      include: [{ model: Branch, attributes: ['code', 'name', 'name_ar'] }, { model: Warehouse, attributes: ['code', 'name'] }],
    });
    res.json(rows);
  } catch (e) { next(e); }
});

router.post('/registers', requirePerm('pos.register.manage'), async (req, res, next) => {
  try { res.status(201).json(await Register.create(req.body)); }
  catch (e) { next(e); }
});

router.put('/registers/:id', requirePerm('pos.register.manage'), async (req, res, next) => {
  try {
    const r = await Register.findByPk(req.params.id);
    if (!r) throw HttpError.notFound('Register not found');
    await r.update(req.body);
    res.json(r);
  } catch (e) { next(e); }
});

// ---------- SHIFTS ----------
router.get('/shifts/current', async (req, res, next) => {
  try {
    const { register_id } = req.query;
    if (!register_id) return res.status(400).json({ error: 'BAD_REQUEST', message: 'register_id required' });
    const s = await Shift.findOne({ where: { register_id, status: 'open' } });
    res.json(s || null);
  } catch (e) { next(e); }
});

router.get('/shifts', async (req, res, next) => {
  try {
    const { branch_id, status, from, to, page = 1, page_size = 50 } = req.query;
    const where = {};
    if (branch_id) where.branch_id = branch_id;
    if (status) where.status = status;
    if (from || to) {
      where.opened_at = {};
      if (from) where.opened_at[Op.gte] = new Date(from);
      if (to)   where.opened_at[Op.lte] = new Date(to + 'T23:59:59');
    }
    const limit = Math.min(Number(page_size) || 50, 200);
    const offset = (Number(page) - 1) * limit;
    const { rows, count } = await Shift.findAndCountAll({
      where, order: [['opened_at', 'DESC']],
      limit, offset,
      include: [
        { model: Register, attributes: ['code', 'name'] },
        { model: User, as: 'cashier', attributes: ['full_name', 'email'] },
      ],
    });
    res.json({ data: rows, total: count, page: Number(page), page_size: limit });
  } catch (e) { next(e); }
});

router.get('/shifts/:id', async (req, res, next) => {
  try {
    const s = await Shift.findByPk(req.params.id, {
      include: [
        { model: Register },
        { model: User, as: 'cashier', attributes: ['full_name'] },
        { model: POSSale, as: 'sales', include: [{ model: POSPayment, as: 'payments' }] },
      ],
    });
    if (!s) throw HttpError.notFound('Shift not found');
    res.json(s);
  } catch (e) { next(e); }
});

router.post('/shifts/open', requirePerm('pos.shift.open'), async (req, res, next) => {
  try {
    const { register_id, opening_cash } = req.body;
    const s = await pos.openShift({ registerId: register_id, openingCash: opening_cash, userId: req.user.sub });
    res.status(201).json(s);
  } catch (e) { next(e); }
});

router.post('/shifts/:id/close', requirePerm('pos.shift.close'), async (req, res, next) => {
  try {
    const { counted_cash, notes } = req.body;
    const s = await pos.closeShift({ shiftId: req.params.id, countedCash: counted_cash, notes, userId: req.user.sub });
    res.json(s);
  } catch (e) { next(e); }
});

router.get('/shifts/:id/x-report', async (req, res, next) => {
  try { res.json(await pos.xReport({ shiftId: req.params.id })); }
  catch (e) { next(e); }
});

// ---------- POS PRODUCT SEARCH (items + stock) ----------
router.get('/items', async (req, res, next) => {
  try {
    const { q, warehouse_id, category_id, page = 1, page_size = 60 } = req.query;
    if (!warehouse_id) return res.status(400).json({ error: 'BAD_REQUEST', message: 'warehouse_id required' });
    const where = { is_active: 1 };
    if (q) where[Op.or] = [{ name: { [Op.like]: `%${q}%` } }, { name_ar: { [Op.like]: `%${q}%` } }, { sku: { [Op.like]: `%${q}%` } }, { barcode: { [Op.like]: `%${q}%` } }];
    if (category_id) where.category_id = category_id;
    const limit = Math.min(Number(page_size) || 60, 200);
    const offset = (Number(page) - 1) * limit;
    const items = await Item.findAll({ where, order: [['name', 'ASC']], limit, offset });
    const ids = items.map(i => i.id);
    const balances = ids.length
      ? await StockBalance.findAll({ where: { item_id: { [Op.in]: ids }, warehouse_id } })
      : [];
    const balMap = new Map(balances.map(b => [b.item_id, b]));
    res.json(items.map(i => {
      const b = balMap.get(i.id);
      return {
        id: i.id, sku: i.sku, name: i.name, name_ar: i.name_ar,
        sale_price: i.sale_price, image_url: i.image_url,
        on_hand: b ? Number(b.quantity) : 0,
        avg_cost: b ? Number(b.avg_cost) : 0,
      };
    }));
  } catch (e) { next(e); }
});

// ---------- SALES ----------
router.get('/sales', async (req, res, next) => {
  try {
    const { branch_id, shift_id, from, to, page = 1, page_size = 50 } = req.query;
    const where = {};
    if (branch_id) where.branch_id = branch_id;
    if (shift_id) where.shift_id = shift_id;
    if (from || to) {
      where.sale_date = {};
      if (from) where.sale_date[Op.gte] = new Date(from);
      if (to)   where.sale_date[Op.lte] = new Date(to + 'T23:59:59');
    }
    const limit = Math.min(Number(page_size) || 50, 200);
    const offset = (Number(page) - 1) * limit;
    const { rows, count } = await POSSale.findAndCountAll({
      where, order: [['sale_date', 'DESC']], limit, offset,
      include: [{ model: POSPayment, as: 'payments' }, { model: User, as: 'cashier', attributes: ['full_name'] }],
    });
    res.json({ data: rows, total: count, page: Number(page), page_size: limit });
  } catch (e) { next(e); }
});

router.get('/sales/:id', async (req, res, next) => {
  try {
    const s = await POSSale.findByPk(req.params.id, {
      include: [
        { model: POSSaleLine, as: 'lines' },
        { model: POSPayment, as: 'payments' },
        { model: User, as: 'cashier', attributes: ['full_name', 'email'] },
        { model: Customer, attributes: ['full_name', 'phone', 'email'] },
      ],
    });
    if (!s) throw HttpError.notFound('Sale not found');
    res.json(s);
  } catch (e) { next(e); }
});

router.post('/sales', requirePerm('pos.sale.create'), async (req, res, next) => {
  try {
    const { shift_id, customer_id, lines, payments, discount, notes } = req.body;
    const result = await pos.placeSale({
      shiftId: shift_id, customerId: customer_id, lines, payments,
      discount, notes, userId: req.user.sub,
    });
    res.status(201).json(result);
  } catch (e) { next(e); }
});

router.post('/sales/:id/void', requirePerm('pos.sale.void'), async (req, res, next) => {
  try { res.json(await pos.voidSale({ saleId: req.params.id, userId: req.user.sub })); }
  catch (e) { next(e); }
});

module.exports = router;
