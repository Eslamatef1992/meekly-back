const router = require('express').Router();
const { Product, ProductCategory, ProductImage } = require('../models');
const { buildCrud } = require('../utils/crud');
const { authRequired, requirePerm } = require('../middleware/auth');

// Public catalog endpoints for the e-commerce site:
router.get('/public', async (req, res, next) => {
  try {
    const { q, category, featured } = req.query;
    const { Op } = require('sequelize');
    const where = { is_published: 1 };
    if (q) where[Op.or] = [{ name: { [Op.like]: `%${q}%` } }, { name_ar: { [Op.like]: `%${q}%` } }];
    if (category) {
      const cat = await ProductCategory.findOne({ where: { slug: category } });
      if (cat) where.category_id = cat.id;
    }
    if (featured) where.is_featured = 1;
    const rows = await Product.findAll({
      where, include: [{ model: ProductImage, as: 'images' }, { model: ProductCategory }],
      order: [['is_featured', 'DESC'], ['id', 'DESC']],
      limit: 200,
    });
    res.json(rows);
  } catch (e) { next(e); }
});

router.get('/public/:slug', async (req, res, next) => {
  try {
    const p = await Product.findOne({
      where: { slug: req.params.slug, is_published: 1 },
      include: [{ model: ProductImage, as: 'images' }, { model: ProductCategory }],
    });
    if (!p) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json(p);
  } catch (e) { next(e); }
});

// Admin-only CRUD below
router.use(authRequired);
const crud = buildCrud(Product, { searchFields: ['name', 'name_ar', 'sku', 'slug'], orderBy: 'id' });
router.get('/',         requirePerm('ecom.product.manage'), crud.list);
router.get('/:id',      requirePerm('ecom.product.manage'), crud.get);
router.post('/',        requirePerm('ecom.product.manage'), crud.create);
router.put('/:id',      requirePerm('ecom.product.manage'), crud.update);
router.delete('/:id',   requirePerm('ecom.product.manage'), crud.remove);

module.exports = router;
