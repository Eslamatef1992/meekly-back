const router = require('express').Router();
const ctrl = require('../controllers/report.controller');
const { authRequired, requirePerm } = require('../middleware/auth');

router.use(authRequired, requirePerm('finance.reports.view'));

router.get('/trial-balance',   ctrl.trialBalance);
router.get('/general-ledger',  ctrl.generalLedger);
router.get('/income-statement',ctrl.incomeStatement);
router.get('/balance-sheet',   ctrl.balanceSheet);

module.exports = router;
