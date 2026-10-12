const router = require('express').Router();
const { Op } = require('sequelize');
const { sequelize, StockBalance, StockMovement, Item, Warehouse, ItemCategory } = require('../models');
const { authRequired, requirePerm } = require('../middleware/auth');
const HttpError = require('../utils/HttpError');

router.use(authRequired);

function r3(n) { return Math.round(Number(n || 0) * 1000) / 1000; }

// Current balances with filters
router.get('/balances', requirePerm('inventory.stock.view'), async (req, res, next) => {
  try {
    const { warehouse_id, item_id, low_stock, q } = req.query;
    const where = {};
    if (warehouse_id) where.warehouse_id = warehouse_id;
    if (item_id) where.item_id = item_id;
    const rows = await StockBalance.findAll({
      where,
      include: [
        { model: Item,      attributes: ['sku', 'name', 'name_ar', 'barcode', 'reorder_level', 'min_stock', 'category_id'] },
        { model: Warehouse, attributes: ['code', 'name', 'name_ar', 'branch_id'] },
      ],
      order: [['id', 'ASC']],
    });
    let result = rows;
    if (q) {
      const qq = q.toLowerCase();
      result = result.filter(s => (s.Item?.name || '').toLowerCase().includes(qq) || (s.Item?.sku || '').toLowerCase().includes(qq));
    }
    if (low_stock === '1' || low_stock === 'true') {
      result = result.filter(s => Number(s.quantity) <= Number(s.Item?.reorder_level || 0) && Number(s.Item?.reorder_level) > 0);
    }
    res.json(result);
  } catch (e) { next(e); }
});

// Movements list with filters
router.get('/movements', requirePerm('inventory.stock.view'), async (req, res, next) => {
  try {
    const { warehouse_id, item_id, type, from, to, page = 1, page_size = 100 } = req.query;
    const where = {};
    if (warehouse_id) where.warehouse_id = warehouse_id;
    if (item_id) where.item_id = item_id;
    if (type) where.movement_type = type;
    if (from || to) {
      where.movement_date = {};
      if (from) where.movement_date[Op.gte] = from;
      if (to)   where.movement_date[Op.lte] = to;
    }
    const limit = Math.min(Number(page_size) || 100, 500);
    const offset = (Number(page) - 1) * limit;
    const { rows, count } = await StockMovement.findAndCountAll({
      where, order: [['movement_date', 'DESC'], ['id', 'DESC']],
      limit, offset,
      include: [
        { model: Item,      attributes: ['sku', 'name', 'name_ar'] },
        { model: Warehouse, attributes: ['code', 'name'] },
      ],
    });
    res.json({ data: rows, total: count, page: Number(page), page_size: limit });
  } catch (e) { next(e); }
});

// Record a movement (in/out/adjustment)
router.post('/movements', requirePerm('inventory.stock.move'), async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const { movement_date, movement_type, item_id, warehouse_id, quantity, unit_cost, reference, notes } = req.body;
    if (!movement_type || !item_id || !warehouse_id || !quantity) {
      await t.rollback();
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'movement_type, item_id, warehouse_id, quantity required' });
    }
    if (!['in', 'out', 'adjustment'].includes(movement_type)) {
      await t.rollback();
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'movement_type must be in/out/adjustment' });
    }

    const wh = await Warehouse.findByPk(warehouse_id, { transaction: t });
    if (!wh) { await t.rollback(); return res.status(400).json({ error: 'BAD_REQUEST', message: 'warehouse not found' }); }

    let delta;
    if (movement_type === 'in')         delta = Number(quantity);
    else if (movement_type === 'out')   delta = -Number(quantity);
    else                                 delta = Number(quantity);   // adjustment is signed

    const mv = await StockMovement.create({
      movement_date: movement_date || new Date().toISOString().slice(0, 10),
      movement_type, item_id, warehouse_id, branch_id: wh.branch_id,
      quantity: Math.abs(quantity), unit_cost: unit_cost || 0, reference, notes,
      created_by: req.user.sub,
    }, { transaction: t });

    const [bal] = await StockBalance.findOrCreate({
      where: { item_id, warehouse_id },
      defaults: { item_id, warehouse_id, quantity: 0, avg_cost: 0 },
      transaction: t,
    });

    // Block out/adjustment if it would go negative
    if (Number(bal.quantity) + delta < 0) {
      await t.rollback();
      throw HttpError.conflict(`Insufficient stock: on hand ${bal.quantity}, requested ${Math.abs(delta)}`);
    }

    // Moving-average cost on receipt
    if (movement_type === 'in' && unit_cost && delta > 0) {
      const newQty = Number(bal.quantity) + delta;
      const newCost = ((Number(bal.quantity) * Number(bal.avg_cost)) + (delta * Number(unit_cost))) / (newQty || 1);
      bal.avg_cost = r3(newCost);
    }
    bal.quantity = r3(Number(bal.quantity) + delta);
    await bal.save({ transaction: t });

    await t.commit();
    res.status(201).json({ movement: mv, balance: bal });
  } catch (e) { try { await t.rollback(); } catch {} next(e); }
});

// ---- TRANSFER between warehouses ----
router.post('/transfer', requirePerm('inventory.transfer'), async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const { transfer_date, item_id, from_warehouse_id, to_warehouse_id, quantity, notes, reference } = req.body;
    if (!item_id || !from_warehouse_id || !to_warehouse_id || !quantity) {
      await t.rollback();
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'item_id, from_warehouse_id, to_warehouse_id, quantity required' });
    }
    if (from_warehouse_id == to_warehouse_id) {
      await t.rollback();
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'Source and destination cannot be the same' });
    }
    const qty = Number(quantity);
    if (qty <= 0) {
      await t.rollback();
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'Quantity must be > 0' });
    }

    const fromWh = await Warehouse.findByPk(from_warehouse_id, { transaction: t });
    const toWh   = await Warehouse.findByPk(to_warehouse_id,   { transaction: t });
    if (!fromWh || !toWh) {
      await t.rollback();
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'Warehouse not found' });
    }

    const item = await Item.findByPk(item_id, { transaction: t });
    if (!item) { await t.rollback(); return res.status(400).json({ error: 'BAD_REQUEST', message: 'Item not found' }); }

    const fromBal = await StockBalance.findOne({ where: { item_id, warehouse_id: from_warehouse_id }, transaction: t });
    if (!fromBal || Number(fromBal.quantity) < qty) {
      await t.rollback();
      throw HttpError.conflict(`Insufficient stock at source: on hand ${fromBal ? fromBal.quantity : 0}, requested ${qty}`);
    }

    const unitCost = Number(fromBal.avg_cost);
    const today = transfer_date || new Date().toISOString().slice(0, 10);
    const refCode = reference || `TXF-${Date.now().toString().slice(-8)}`;

    // 1) OUT movement from source
    await StockMovement.create({
      movement_date: today, movement_type: 'out',
      branch_id: fromWh.branch_id, item_id,
      warehouse_id: from_warehouse_id,
      quantity: qty, unit_cost: unitCost, reference: refCode,
      notes: `Transfer to ${toWh.name}${notes ? ' — ' + notes : ''}`,
      created_by: req.user.sub,
    }, { transaction: t });
    fromBal.quantity = r3(Number(fromBal.quantity) - qty);
    await fromBal.save({ transaction: t });

    // 2) IN movement at destination — moving-average cost on the destination side
    const [toBal] = await StockBalance.findOrCreate({
      where: { item_id, warehouse_id: to_warehouse_id },
      defaults: { item_id, warehouse_id: to_warehouse_id, quantity: 0, avg_cost: 0 },
      transaction: t,
    });
    const newQty = Number(toBal.quantity) + qty;
    if (newQty > 0) {
      toBal.avg_cost = r3(((Number(toBal.quantity) * Number(toBal.avg_cost)) + (qty * unitCost)) / newQty);
    }
    toBal.quantity = r3(newQty);
    await toBal.save({ transaction: t });

    await StockMovement.create({
      movement_date: today, movement_type: 'in',
      branch_id: toWh.branch_id, item_id,
      warehouse_id: to_warehouse_id,
      quantity: qty, unit_cost: unitCost, reference: refCode,
      notes: `Transfer from ${fromWh.name}${notes ? ' — ' + notes : ''}`,
      created_by: req.user.sub,
    }, { transaction: t });

    await t.commit();
    res.status(201).json({
      ok: true,
      reference: refCode,
      item: { id: item.id, sku: item.sku, name: item.name },
      from: { warehouse: fromWh.name, on_hand_after: Number(fromBal.quantity) },
      to:   { warehouse: toWh.name,   on_hand_after: Number(toBal.quantity) },
      quantity: qty, unit_cost: unitCost,
    });
  } catch (e) { try { await t.rollback(); } catch {} next(e); }
});

// ---- COUNT / ADJUSTMENT ----
router.post('/adjust', requirePerm('inventory.adjust'), async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const { item_id, warehouse_id, new_quantity, notes } = req.body;
    if (!item_id || !warehouse_id || new_quantity === undefined) {
      await t.rollback();
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'item_id, warehouse_id, new_quantity required' });
    }
    const wh = await Warehouse.findByPk(warehouse_id, { transaction: t });
    if (!wh) { await t.rollback(); return res.status(400).json({ error: 'BAD_REQUEST', message: 'Warehouse not found' }); }
    const [bal] = await StockBalance.findOrCreate({
      where: { item_id, warehouse_id },
      defaults: { item_id, warehouse_id, quantity: 0, avg_cost: 0 },
      transaction: t,
    });
    const delta = r3(Number(new_quantity) - Number(bal.quantity));
    if (delta === 0) { await t.rollback(); return res.json({ ok: true, message: 'No change', balance: bal }); }

    await StockMovement.create({
      movement_date: new Date().toISOString().slice(0, 10),
      movement_type: 'adjustment', branch_id: wh.branch_id,
      item_id, warehouse_id, quantity: Math.abs(delta),
      unit_cost: bal.avg_cost,
      reference: `ADJ-${Date.now().toString().slice(-8)}`,
      notes: notes || `Stock count adjustment: ${bal.quantity} → ${new_quantity}`,
      created_by: req.user.sub,
    }, { transaction: t });
    bal.quantity = r3(Number(new_quantity));
    await bal.save({ transaction: t });
    await t.commit();
    res.status(201).json({ ok: true, delta, balance: bal });
  } catch (e) { try { await t.rollback(); } catch {} next(e); }
});

// ---- Warehouses CRUD (kept here for inventory grouping) ----
router.get('/warehouses', async (req, res, next) => {
  try {
    const { branch_id } = req.query;
    const where = {};
    if (branch_id) where.branch_id = branch_id;
    const rows = await Warehouse.findAll({ where, order: [['code', 'ASC']] });
    res.json(rows);
  } catch (e) { next(e); }
});

router.post('/warehouses', requirePerm('inventory.warehouse.manage'), async (req, res, next) => {
  try { res.status(201).json(await Warehouse.create(req.body)); }
  catch (e) { next(e); }
});

router.put('/warehouses/:id', requirePerm('inventory.warehouse.manage'), async (req, res, next) => {
  try {
    const w = await Warehouse.findByPk(req.params.id);
    if (!w) throw HttpError.notFound('Warehouse not found');
    await w.update(req.body);
    res.json(w);
  } catch (e) { next(e); }
});

module.exports = router;
