const router = require('express').Router();
const ctrl = require('../controllers/voucher.controller');
const { authRequired, requirePerm } = require('../middleware/auth');

router.use(authRequired);

router.get('/',           requirePerm('finance.voucher.view'),   ctrl.list);
router.get('/:id',        requirePerm('finance.voucher.view'),   ctrl.get);
router.post('/',          requirePerm('finance.voucher.create'), ctrl.create);
router.post('/:id/post',  requirePerm('finance.voucher.post'),   ctrl.post);
router.post('/:id/cancel',requirePerm('finance.voucher.cancel'), ctrl.cancel);

module.exports = router;
