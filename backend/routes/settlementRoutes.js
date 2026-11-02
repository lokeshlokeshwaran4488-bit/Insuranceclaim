const express = require('express');
const router = express.Router();
const settlementController = require('../controllers/settlementController');
const { authenticate, requireAdmin } = require('../middleware/auth');

router.post('/', authenticate, requireAdmin, settlementController.createSettlement);
router.get('/eligible-claims', authenticate, requireAdmin, settlementController.listEligibleClaims);
router.get('/', authenticate, requireAdmin, settlementController.listSettlements);
router.get('/:settlement_id', authenticate, settlementController.getSettlement);
router.put('/:settlement_id', authenticate, requireAdmin, settlementController.updateSettlement);
router.post('/:settlement_id/complete', authenticate, requireAdmin, settlementController.completeSettlement);

module.exports = router;

