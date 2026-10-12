const router = require('express').Router();
const ctrl = require('../controllers/account.controller');
const { authRequired, requirePerm } = require('../middleware/auth');

router.use(authRequired);

router.get('/',         requirePerm('finance.coa.view'),   ctrl.list);
router.get('/tree',     requirePerm('finance.coa.view'),   ctrl.tree);
router.get('/:id',      requirePerm('finance.coa.view'),   ctrl.get);
router.get('/:id/balance', requirePerm('finance.coa.view'), ctrl.balance);
router.post('/',        requirePerm('finance.coa.manage'), ctrl.create);
router.put('/:id',      requirePerm('finance.coa.manage'), ctrl.update);
router.delete('/:id',   requirePerm('finance.coa.manage'), ctrl.remove);

module.exports = router;
