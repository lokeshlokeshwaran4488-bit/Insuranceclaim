const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { authenticate, requireOfficer, requireAdmin } = require('../middleware/auth');

router.get('/summary', authenticate, requireOfficer, reportController.getSummary);
router.get('/claims/export-csv', authenticate, requireOfficer, reportController.exportClaimsCsv);
router.get('/settlements/export-csv', authenticate, requireAdmin, reportController.exportSettlementsCsv);

module.exports = router;

