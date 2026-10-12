const router = require('express').Router();
const { sequelize, Order, OrderItem, Product } = require('../models');
const { authRequired, requirePerm } = require('../middleware/auth');

// Public checkout — accepts an order from the e-commerce front-end.
router.post('/public', async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const { customer_email, customer_name, customer_phone, shipping_address, shipping_city, shipping_area, items = [], notes } = req.body;
    if (!customer_email || !customer_name || !shipping_address || !items.length) {
      await t.rollback();
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'Missing customer/items/address' });
    }
    let subtotal = 0;
    const enriched = [];
    for (const it of items) {
      const p = await Product.findByPk(it.product_id, { transaction: t });
      if (!p) throw new Error('Product not found: ' + it.product_id);
      const line = Number(p.price) * Number(it.quantity);
      subtotal += line;
      enriched.push({ p, qty: Number(it.quantity), line });
    }
    const order_no = 'MK' + Date.now().toString().slice(-9);
    const order = await Order.create({
      order_no, customer_email, customer_name, customer_phone,
      shipping_address, shipping_city, shipping_area,
      subtotal, shipping_fee: 0, tax: 0, discount: 0, total: subtotal,
      currency_code: 'KWD', status: 'pending', payment_status: 'unpaid',
      notes, placed_at: new Date(),
    }, { transaction: t });
    for (const e of enriched) {
      await OrderItem.create({
        order_id: order.id, product_id: e.p.id, product_name: e.p.name, sku: e.p.sku,
        unit_price: e.p.price, quantity: e.qty, line_total: e.line,
      }, { transaction: t });
    }
    await t.commit();
    res.status(201).json({ order_no, total: subtotal });
  } catch (err) { await t.rollback(); next(err); }
});

// Admin endpoints
router.use(authRequired);
router.get('/', requirePerm('ecom.order.manage'), async (req, res, next) => {
  try {
    const { status, q, page = 1, page_size = 50 } = req.query;
    const { Op } = require('sequelize');
    const where = {};
    if (status) where.status = status;
    if (q) where[Op.or] = [{ order_no: { [Op.like]: `%${q}%` } }, { customer_name: { [Op.like]: `%${q}%` } }, { customer_email: { [Op.like]: `%${q}%` } }];
    const limit = Math.min(Number(page_size) || 50, 200);
    const offset = (Number(page) - 1) * limit;
    const { rows, count } = await Order.findAndCountAll({ where, order: [['placed_at', 'DESC']], limit, offset });
    res.json({ data: rows, total: count, page: Number(page), page_size: limit });
  } catch (e) { next(e); }
});

router.get('/:id', requirePerm('ecom.order.manage'), async (req, res, next) => {
  try {
    const o = await Order.findByPk(req.params.id, { include: [{ model: OrderItem, as: 'items' }] });
    if (!o) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json(o);
  } catch (e) { next(e); }
});

router.put('/:id/status', requirePerm('ecom.order.manage'), async (req, res, next) => {
  try {
    const o = await Order.findByPk(req.params.id);
    if (!o) return res.status(404).json({ error: 'NOT_FOUND' });
    if (req.body.status) o.status = req.body.status;
    if (req.body.payment_status) o.payment_status = req.body.payment_status;
    await o.save();
    res.json(o);
  } catch (e) { next(e); }
});

module.exports = router;
