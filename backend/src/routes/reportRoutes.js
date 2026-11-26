const router = require('express').Router();
const c = require('../controllers/reportController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect, authorize('manager', 'admin'));

router.get('/occupancy', c.occupancy);
router.get('/revenue', c.revenue);
router.get('/peak-hours', c.peakHours);

module.exports = router;
