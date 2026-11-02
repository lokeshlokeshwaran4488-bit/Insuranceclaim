const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticate, requireAdmin } = require('../middleware/auth');

router.get('/', authenticate, requireAdmin, userController.listUsers);
router.post('/', authenticate, requireAdmin, userController.createUser);
router.get('/me/profile', authenticate, userController.getMyProfile);
router.put('/me/profile', authenticate, userController.updateMyProfile);
router.get('/:user_id', authenticate, requireAdmin, userController.getUser);
router.put('/:user_id', authenticate, requireAdmin, userController.updateUser);
router.patch('/:user_id/status', authenticate, requireAdmin, userController.toggleUserStatus);

module.exports = router;

