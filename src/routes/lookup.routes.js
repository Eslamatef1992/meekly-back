const router = require('express').Router();
const { Currency, FiscalPeriod, LeaveType, Warehouse, Uom, ItemCategory, ProductCategory, Department } = require('../models');
const { authRequired } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

router.use(authRequired);

router.get('/currencies', asyncHandler(async (req, res) => res.json(await Currency.findAll({ order: [['code', 'ASC']] }))));
router.get('/fiscal-periods', asyncHandler(async (req, res) => res.json(await FiscalPeriod.findAll({ order: [['start_date', 'DESC']] }))));
router.get('/leave-types', asyncHandler(async (req, res) => res.json(await LeaveType.findAll({ order: [['name', 'ASC']] }))));
router.get('/warehouses', asyncHandler(async (req, res) => res.json(await Warehouse.findAll({ order: [['name', 'ASC']] }))));
router.get('/uoms', asyncHandler(async (req, res) => res.json(await Uom.findAll({ order: [['code', 'ASC']] }))));
router.get('/item-categories', asyncHandler(async (req, res) => res.json(await ItemCategory.findAll({ order: [['name', 'ASC']] }))));
router.get('/product-categories', asyncHandler(async (req, res) => res.json(await ProductCategory.findAll({ order: [['sort_order', 'ASC']] }))));
router.get('/departments', asyncHandler(async (req, res) => res.json(await Department.findAll({ order: [['name', 'ASC']] }))));

module.exports = router;
