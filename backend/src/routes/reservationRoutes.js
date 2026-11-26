const router = require('express').Router();
const c = require('../controllers/reservationController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.post('/', authorize('driver', 'admin'), c.createReservation);
router.get('/mine', c.myReservations);
router.get('/', authorize('manager', 'admin'), c.lotReservations);
router.get('/:id', c.getReservation);
router.patch('/:id/cancel', c.cancelReservation);
router.patch('/:id/checkin', c.checkIn);
router.patch('/:id/checkout', c.checkOut);

module.exports = router;
