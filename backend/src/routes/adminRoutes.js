const router = require('express').Router();
const c = require('../controllers/adminController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect, authorize('admin'));

router.get('/stats', c.stats);
router.get('/users', c.listUsers);
router.patch('/users/:id/active', c.setUserActive);
router.patch('/users/:id/role', c.setUserRole);

module.exports = router;
