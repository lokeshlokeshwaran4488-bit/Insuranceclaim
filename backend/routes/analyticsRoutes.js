const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const { authenticate, requireAdmin } = require('../middleware/auth');

router.get('/analytics/dashboard', authenticate, requireAdmin, analyticsController.getDashboardStats);
router.get('/analytics/claims', authenticate, requireAdmin, analyticsController.getClaimsAnalytics);
router.get('/analytics/fraud', authenticate, requireAdmin, analyticsController.getFraudAnalytics);
router.get('/analytics/settlements', authenticate, requireAdmin, analyticsController.getSettlementAnalytics);
router.get('/audit-logs', authenticate, requireAdmin, analyticsController.getAuditLogs);

// Also alias directly at /dashboard, /claims, /fraud, /settlements
router.get('/dashboard', authenticate, requireAdmin, analyticsController.getDashboardStats);
router.get('/claims', authenticate, requireAdmin, analyticsController.getClaimsAnalytics);
router.get('/fraud', authenticate, requireAdmin, analyticsController.getFraudAnalytics);
router.get('/settlements', authenticate, requireAdmin, analyticsController.getSettlementAnalytics);

module.exports = router;

