const router = require('express').Router();
const ctrl = require('../controllers/financialUpload.controller');
const { authRequired, requirePerm } = require('../middleware/auth');
const upload = require('../middleware/upload');

router.use(authRequired);

router.get('/',             requirePerm('finance.uploads.view'),     ctrl.list);
router.get('/:id',          requirePerm('finance.uploads.view'),     ctrl.get);
router.post('/',            requirePerm('finance.uploads.create'),   upload.single('file'), ctrl.create);
router.post('/:id/rollback',requirePerm('finance.uploads.rollback'), ctrl.rollback);
router.delete('/:id',       requirePerm('finance.uploads.rollback'), ctrl.destroy);

module.exports = router;
