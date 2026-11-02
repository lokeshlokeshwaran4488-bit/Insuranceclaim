const User = require('../models/User');
const Customer = require('../models/Customer');
const { generateTokens, verifyToken } = require('../middleware/auth');
const { createAuditLog } = require('../services/auditService');

async function register(req, res, next) {
  try {
    const { full_name, email, password, phone } = req.body;

    if (!full_name || !email || !password) {
      return res.status(400).json({ detail: 'Full name, email, and password are required' });
    }

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(400).json({ detail: 'Email already registered' });
    }

    const passwordHash = await User.hashPassword(password);
    const user = new User({
      full_name,
      email: email.toLowerCase().trim(),
      password_hash: passwordHash,
      phone: phone || null,
      role: 'CUSTOMER',
      is_active: true
    });

    await user.save();

    // Also sync to customers collection
    await Customer.findOneAndUpdate(
      { email: user.email },
      {
        $set: {
          id: user.id,
          full_name: user.full_name,
          email: user.email,
          phone: user.phone,
          address: user.address,
          role: user.role,
          is_active: user.is_active,
          password_hash: user.password_hash,
          total_claims: 0
        }
      },
      { upsert: true }
    );

    await createAuditLog({
      userId: user.id,
      action: 'USER_REGISTERED',
      entityType: 'user',
      entityId: user.id,
      req
    });

    return res.status(201).json(user.toJSON());
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ detail: 'Email and password are required' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user || !(await user.verifyPassword(password))) {
      await createAuditLog({
        action: 'LOGIN_FAILED',
        entityType: 'user',
        entityId: email,
        req
      });
      return res.status(401).json({ detail: 'Invalid email or password' });
    }

    if (!user.is_active) {
      return res.status(403).json({ detail: 'Account is deactivated' });
    }

    const tokens = generateTokens(user);

    await createAuditLog({
      userId: user.id,
      action: 'USER_LOGIN',
      entityType: 'user',
      entityId: user.id,
      req
    });

    return res.json(tokens);
  } catch (err) {
    next(err);
  }
}

async function refresh(req, res, next) {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token) {
      return res.status(401).json({ detail: 'Refresh token is required' });
    }

    const decoded = verifyToken(refresh_token);
    if (!decoded || decoded.type !== 'refresh') {
      return res.status(401).json({ detail: 'Invalid or expired refresh token' });
    }

    const user = await User.findOne({
      $or: [{ id: decoded.sub }, { _id: decoded.sub }]
    });

    if (!user || !user.is_active) {
      return res.status(401).json({ detail: 'User not found or deactivated' });
    }

    const tokens = generateTokens(user);
    return res.json(tokens);
  } catch (err) {
    next(err);
  }
}

async function logout(req, res, next) {
  try {
    if (req.user) {
      await createAuditLog({
        userId: req.user.id,
        action: 'USER_LOGOUT',
        entityType: 'user',
        entityId: req.user.id,
        req
      });
    }
    return res.status(200).json({ message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
}

async function getMe(req, res, next) {
  try {
    return res.json(req.user.toJSON());
  } catch (err) {
    next(err);
  }
}

module.exports = {
  register,
  login,
  refresh,
  logout,
  getMe
};

