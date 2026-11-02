const jwt = require('jsonwebtoken');
const config = require('../config/config');
const User = require('../models/User');

function generateTokens(user) {
  const payload = {
    sub: user.id,
    email: user.email,
    role: user.role
  };

  const accessToken = jwt.sign(
    { ...payload, type: 'access' },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );

  const refreshToken = jwt.sign(
    { ...payload, type: 'refresh' },
    config.jwtSecret,
    { expiresIn: config.refreshTokenExpiresIn }
  );

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: 'bearer',
    expires_in: config.jwtExpiresInSeconds
  };
}

function verifyToken(token) {
  try {
    return jwt.verify(token, config.jwtSecret);
  } catch (err) {
    return null;
  }
}

async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ detail: 'Not authenticated' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);

    if (!decoded || decoded.type === 'refresh') {
      return res.status(401).json({ detail: 'Invalid or expired token' });
    }

    const userId = decoded.sub;
    const user = await User.findOne({
      $or: [{ _id: userId }, { id: userId }]
    });

    if (!user) {
      return res.status(401).json({ detail: 'User not found' });
    }

    if (!user.is_active) {
      return res.status(403).json({ detail: 'Account is deactivated' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ detail: 'Authentication failed', error: error.message });
  }
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ detail: 'Not authenticated' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ detail: 'Forbidden: Insufficient privileges' });
    }
    next();
  };
}

const requireAdmin = requireRole('ADMIN');
const requireOfficer = requireRole('CLAIM_OFFICER', 'ADMIN');

module.exports = {
  generateTokens,
  verifyToken,
  authenticate,
  requireRole,
  requireAdmin,
  requireOfficer
};

