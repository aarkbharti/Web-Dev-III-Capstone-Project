const router = require('express').Router();
const c = require('../controllers/lotController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.get('/', c.listLots);
router.get('/mine', authorize('manager', 'admin'), c.myLots); // must stay above "/:id"
router.post('/', authorize('manager', 'admin'), c.createLot);
router.get('/:id', c.getLot);
router.put('/:id', authorize('manager', 'admin'), c.updateLot);
router.delete('/:id', authorize('manager', 'admin'), c.deleteLot);

router.get('/:id/slots', c.listSlots);
router.post('/:id/slots', authorize('manager', 'admin'), c.addSlots);

module.exports = router;
