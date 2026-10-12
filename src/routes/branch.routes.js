const router = require('express').Router();
const ctrl = require('../controllers/branch.controller');
const { authRequired, requirePerm } = require('../middleware/auth');

router.use(authRequired);

router.get('/',               ctrl.list);
router.get('/:id',            ctrl.get);
router.post('/',              requirePerm('system.branch.manage'), ctrl.create);
router.put('/:id',            requirePerm('system.branch.manage'), ctrl.update);
router.post('/:id/default',   requirePerm('system.branch.manage'), ctrl.setDefault);
router.delete('/:id',         requirePerm('system.branch.manage'), ctrl.remove);

module.exports = router;
