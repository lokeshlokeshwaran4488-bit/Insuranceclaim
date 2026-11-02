const User = require('../models/User');
const Customer = require('../models/Customer');
const { createAuditLog } = require('../services/auditService');

async function listUsers(req, res, next) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = Math.min(parseInt(req.query.page_size, 10) || 20, 100);
    const role = req.query.role;
    const search = req.query.search;

    const query = {};
    if (role) {
      query.role = role;
    }
    if (search) {
      const reg = new RegExp(search, 'i');
      query.$or = [{ full_name: reg }, { email: reg }];
    }

    const total = await User.countDocuments(query);
    const users = await User.find(query)
      .sort({ created_at: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize);

    return res.json({
      users: users.map(u => u.toJSON()),
      total,
      page,
      page_size: pageSize
    });
  } catch (err) {
    next(err);
  }
}

async function createUser(req, res, next) {
  try {
    const { full_name, email, password, phone, role, address } = req.body;

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(400).json({ detail: 'User with this email already exists' });
    }

    const passwordHash = await User.hashPassword(password);
    const user = new User({
      full_name,
      email: email.toLowerCase().trim(),
      password_hash: passwordHash,
      phone: phone || null,
      address: address || null,
      role: role || 'CUSTOMER',
      is_active: true
    });

    await user.save();

    if (user.role === 'CUSTOMER') {
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
    }

    await createAuditLog({
      userId: req.user.id,
      action: 'CREATE_USER',
      entityType: 'user',
      entityId: user.id,
      newValue: { email: user.email, role: user.role },
      req
    });

    return res.status(201).json(user.toJSON());
  } catch (err) {
    next(err);
  }
}

async function getMyProfile(req, res, next) {
  try {
    return res.json(req.user.toJSON());
  } catch (err) {
    next(err);
  }
}

async function updateMyProfile(req, res, next) {
  try {
    const user = req.user;
    const { full_name, phone, address, profile_picture_url } = req.body;

    if (full_name !== undefined) user.full_name = full_name;
    if (phone !== undefined) user.phone = phone;
    if (address !== undefined) user.address = address;
    if (profile_picture_url !== undefined) user.profile_picture_url = profile_picture_url;

    await user.save();

    if (user.role === 'CUSTOMER') {
      await Customer.updateOne(
        { email: user.email },
        { $set: { full_name: user.full_name, phone: user.phone, address: user.address } }
      );
    }

    return res.json(user.toJSON());
  } catch (err) {
    next(err);
  }
}

async function getUser(req, res, next) {
  try {
    const user = await User.findOne({
      $or: [{ id: req.params.user_id }, { _id: req.params.user_id }]
    });

    if (!user) {
      return res.status(404).json({ detail: 'User not found' });
    }

    return res.json(user.toJSON());
  } catch (err) {
    next(err);
  }
}

async function updateUser(req, res, next) {
  try {
    const user = await User.findOne({
      $or: [{ id: req.params.user_id }, { _id: req.params.user_id }]
    });

    if (!user) {
      return res.status(404).json({ detail: 'User not found' });
    }

    const { full_name, phone, address, role, is_active } = req.body;
    if (full_name !== undefined) user.full_name = full_name;
    if (phone !== undefined) user.phone = phone;
    if (address !== undefined) user.address = address;
    if (role !== undefined) user.role = role;
    if (is_active !== undefined) user.is_active = is_active;

    await user.save();

    await createAuditLog({
      userId: req.user.id,
      action: 'UPDATE_USER',
      entityType: 'user',
      entityId: user.id,
      newValue: req.body,
      req
    });

    return res.json(user.toJSON());
  } catch (err) {
    next(err);
  }
}

async function toggleUserStatus(req, res, next) {
  try {
    const user = await User.findOne({
      $or: [{ id: req.params.user_id }, { _id: req.params.user_id }]
    });

    if (!user) {
      return res.status(404).json({ detail: 'User not found' });
    }

    const isActive = req.body.is_active !== undefined ? req.body.is_active : req.query.is_active === 'true';
    user.is_active = isActive;
    await user.save();

    await createAuditLog({
      userId: req.user.id,
      action: isActive ? 'ACTIVATE_USER' : 'DEACTIVATE_USER',
      entityType: 'user',
      entityId: user.id,
      req
    });

    return res.json(user.toJSON());
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listUsers,
  createUser,
  getMyProfile,
  updateMyProfile,
  getUser,
  updateUser,
  toggleUserStatus
};

