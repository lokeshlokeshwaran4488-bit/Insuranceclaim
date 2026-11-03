const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/login', (req, res) => {
  res.status(405).json({
    detail: 'Method Not Allowed. Please send an HTTP POST request with email and password in JSON body to log in.',
    method: 'POST',
    endpoint: '/api/auth/login',
    example_body: {
      email: 'user@example.com',
      password: 'yourpassword'
    }
  });
});
router.post('/refresh', authController.refresh);
router.post('/logout', authenticate, authController.logout);
router.get('/me', authenticate, authController.getMe);

module.exports = router;

