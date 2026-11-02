const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');
const { authenticate, requireOfficer } = require('../middleware/auth');

router.post('/claim-summary', authenticate, requireOfficer, aiController.getClaimSummary);
router.post('/fraud-score', authenticate, requireOfficer, aiController.getFraudScore);
router.get('/fraud-score/:claim_id', authenticate, requireOfficer, aiController.getFraudScore);
router.post('/document-analysis', authenticate, requireOfficer, aiController.analyzeDocument);
router.post('/image-analysis', authenticate, requireOfficer, aiController.analyzeImage);
router.get('/claim-analysis/:claim_id', authenticate, requireOfficer, aiController.getClaimAiResults);

module.exports = router;

