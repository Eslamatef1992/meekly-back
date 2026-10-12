const router = require('express').Router();
const { login, me, refresh } = require('../controllers/auth.controller');
const { authRequired } = require('../middleware/auth');

router.post('/login', login);
router.post('/refresh', refresh);
router.get('/me', authRequired, me);

module.exports = router;
