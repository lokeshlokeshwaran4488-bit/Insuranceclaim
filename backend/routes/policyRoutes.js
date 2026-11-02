const express = require('express');
const router = express.Router();
const policyController = require('../controllers/policyController');
const { authenticate, requireAdmin } = require('../middleware/auth');

router.get('/', authenticate, policyController.listPolicies);
router.get('/my-policies', authenticate, policyController.getMyPolicies);
router.get('/:policy_id', authenticate, policyController.getPolicy);
router.post('/', authenticate, requireAdmin, policyController.createPolicy);
router.put('/:policy_id', authenticate, requireAdmin, policyController.updatePolicy);
router.delete('/:policy_id', authenticate, requireAdmin, policyController.deletePolicy);

module.exports = router;

