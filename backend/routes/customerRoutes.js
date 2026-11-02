const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customerController');
const { authenticate, requireAdmin } = require('../middleware/auth');

router.get('/', authenticate, requireAdmin, customerController.listCustomers);
router.post('/', authenticate, requireAdmin, customerController.createCustomer);
router.get('/:customer_id', authenticate, requireAdmin, customerController.getCustomer);
router.get('/:customer_id/details', authenticate, requireAdmin, customerController.getCustomerFullDetails);

module.exports = router;

