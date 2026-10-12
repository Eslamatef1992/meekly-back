const router = require('express').Router();
const { Op } = require('sequelize');
const { Item, ItemCategory, Uom, StockBalance } = require('../models');
const { authRequired, requirePerm } = require('../middleware/auth');
const HttpError = require('../utils/HttpError');

router.use(authRequired);

// LIST with optional filters
router.get('/', requirePerm('inventory.item.manage'), async (req, res, next) => {
  try {
    const { q, category_id, active, sellable, low_stock, warehouse_id, page = 1, page_size = 50 } = req.query;
    const where = {};
    if (q) where[Op.or] = [
      { sku:     { [Op.like]: `%${q}%` } },
      { barcode: { [Op.like]: `%${q}%` } },
      { name:    { [Op.like]: `%${q}%` } },
      { name_ar: { [Op.like]: `%${q}%` } },
    ];
    if (category_id) where.category_id = category_id;
    if (active !== undefined && active !== '') where.is_active = active === '1' || active === 'true' ? 1 : 0;
    if (sellable !== undefined && sellable !== '') where.is_sellable = sellable === '1' || sellable === 'true' ? 1 : 0;

    const limit = Math.min(Number(page_size) || 50, 200);
    const offset = (Number(page) - 1) * limit;
    const { rows, count } = await Item.findAndCountAll({
      where, order: [['id', 'DESC']], limit, offset,
      include: [
        { model: ItemCategory, attributes: ['id', 'name', 'name_ar'] },
        { model: Uom, attributes: ['id', 'code', 'name'] },
      ],
    });

    // Optionally enrich with stock-on-hand for a given warehouse
    let withStock = rows;
    if (warehouse_id) {
      const balances = await StockBalance.findAll({
        where: { item_id: { [Op.in]: rows.map(r => r.id) }, warehouse_id },
      });
      const byItem = new Map(balances.map(b => [b.item_id, b]));
      withStock = rows.map(r => {
        const b = byItem.get(r.id);
        return { ...r.toJSON(), on_hand: b ? Number(b.quantity) : 0, avg_cost: b ? Number(b.avg_cost) : 0 };
      });
    }

    // Low-stock filter post-query
    let filtered = withStock;
    if (low_stock === '1' || low_stock === 'true') {
      filtered = filtered.filter(it => {
        const oh = it.on_hand !== undefined ? Number(it.on_hand) : null;
        const reorder = Number(it.reorder_level || 0);
        return oh !== null && oh <= reorder && reorder > 0;
      });
    }

    res.json({ data: filtered, total: count, page: Number(page), page_size: limit });
  } catch (e) { next(e); }
});

router.get('/:id', requirePerm('inventory.item.manage'), async (req, res, next) => {
  try {
    const row = await Item.findByPk(req.params.id, {
      include: [
        { model: ItemCategory, attributes: ['id', 'name', 'name_ar'] },
        { model: Uom, attributes: ['id', 'code', 'name'] },
      ],
    });
    if (!row) throw HttpError.notFound('Item not found');
    res.json(row);
  } catch (e) { next(e); }
});

router.post('/', requirePerm('inventory.item.manage'), async (req, res, next) => {
  try {
    const dup = await Item.findOne({ where: { sku: req.body.sku } });
    if (dup) throw HttpError.conflict(`SKU "${req.body.sku}" already exists`);
    const row = await Item.create(req.body);
    res.status(201).json(row);
  } catch (e) { next(e); }
});

router.put('/:id', requirePerm('inventory.item.manage'), async (req, res, next) => {
  try {
    const row = await Item.findByPk(req.params.id);
    if (!row) throw HttpError.notFound('Item not found');
    // SKU stays immutable
    const { sku, ...rest } = req.body;
    Object.assign(row, rest);
    await row.save();
    res.json(row);
  } catch (e) { next(e); }
});

router.delete('/:id', requirePerm('inventory.item.manage'), async (req, res, next) => {
  try {
    const row = await Item.findByPk(req.params.id);
    if (!row) throw HttpError.notFound('Item not found');
    // Soft-delete: just deactivate (preserves history)
    row.is_active = 0;
    await row.save();
    res.json({ ok: true, soft_deleted: true });
  } catch (e) { next(e); }
});

// CATEGORIES (nested under items for convenience)
router.get('/_/categories', async (req, res, next) => {
  try { res.json(await ItemCategory.findAll({ order: [['name', 'ASC']] })); }
  catch (e) { next(e); }
});

router.post('/_/categories', requirePerm('inventory.category.manage'), async (req, res, next) => {
  try { res.status(201).json(await ItemCategory.create(req.body)); }
  catch (e) { next(e); }
});

router.put('/_/categories/:id', requirePerm('inventory.category.manage'), async (req, res, next) => {
  try {
    const c = await ItemCategory.findByPk(req.params.id);
    if (!c) throw HttpError.notFound('Category not found');
    await c.update(req.body);
    res.json(c);
  } catch (e) { next(e); }
});

router.get('/_/uoms', async (req, res, next) => {
  try { res.json(await Uom.findAll({ order: [['code', 'ASC']] })); }
  catch (e) { next(e); }
});

module.exports = router;
