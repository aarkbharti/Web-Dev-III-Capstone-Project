const router = require('express').Router();
const c = require('../controllers/lotController');
const { protect, authorize } = require('../middleware/auth');

router.delete('/:id', protect, authorize('manager', 'admin'), c.deleteSlot);

module.exports = router;
