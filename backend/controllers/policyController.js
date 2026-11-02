const Policy = require('../models/Policy');
const Claim = require('../models/Claim');
const User = require('../models/User');
const { generatePolicyNumber } = require('../utils/claimNumber');
const { createAuditLog } = require('../services/auditService');

async function listPolicies(req, res, next) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = Math.min(parseInt(req.query.page_size, 10) || 20, 100);
    const { status, policy_type } = req.query;

    const query = {};
    if (req.user.role === 'CUSTOMER') {
      query.customer_id = req.user.id;
    }
    if (status) query.status = status;
    if (policy_type) query.policy_type = policy_type;

    const total = await Policy.countDocuments(query);
    const policies = await Policy.find(query)
      .sort({ created_at: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize);

    return res.json({
      policies: policies.map(p => p.toJSON()),
      total,
      page,
      page_size: pageSize
    });
  } catch (err) {
    next(err);
  }
}

async function getMyPolicies(req, res, next) {
  try {
    const policies = await Policy.find({ customer_id: req.user.id }).sort({ created_at: -1 });
    return res.json(policies.map(p => p.toJSON()));
  } catch (err) {
    next(err);
  }
}

async function getPolicy(req, res, next) {
  try {
    const policy = await Policy.findOne({
      $or: [{ id: req.params.policy_id }, { _id: req.params.policy_id }]
    });

    if (!policy) {
      return res.status(404).json({ detail: 'Policy not found' });
    }

    if (req.user.role === 'CUSTOMER' && policy.customer_id !== req.user.id) {
      return res.status(403).json({ detail: 'Access denied' });
    }

    return res.json(policy.toJSON());
  } catch (err) {
    next(err);
  }
}

async function createPolicy(req, res, next) {
  try {
    const {
      customer_id,
      policy_type,
      coverage_amount,
      premium_amount,
      deductible_amount,
      start_date,
      expiry_date,
      status,
      policy_details
    } = req.body;

    const customer = await User.findOne({
      $or: [{ id: customer_id }, { _id: customer_id }]
    });
    if (!customer) {
      return res.status(404).json({ detail: 'Customer not found' });
    }

    const policyNumber = req.body.policy_number || await generatePolicyNumber(policy_type);

    const policy = new Policy({
      policy_number: policyNumber,
      customer_id: customer.id,
      policy_type,
      coverage_amount: Number(coverage_amount),
      premium_amount: Number(premium_amount),
      deductible_amount: deductible_amount !== undefined ? Number(deductible_amount) : 0,
      start_date: new Date(start_date),
      expiry_date: new Date(expiry_date),
      status: status || 'ACTIVE',
      policy_details: policy_details || {}
    });

    await policy.save();

    await createAuditLog({
      userId: req.user.id,
      action: 'CREATE_POLICY',
      entityType: 'policy',
      entityId: policy.id,
      newValue: { policy_number: policy.policy_number, customer_id: customer.id },
      req
    });

    return res.status(201).json(policy.toJSON());
  } catch (err) {
    next(err);
  }
}

async function updatePolicy(req, res, next) {
  try {
    const policy = await Policy.findOne({
      $or: [{ id: req.params.policy_id }, { _id: req.params.policy_id }]
    });

    if (!policy) {
      return res.status(404).json({ detail: 'Policy not found' });
    }

    const updateFields = req.body;
    for (const key of Object.keys(updateFields)) {
      if (key !== 'id' && key !== '_id') {
        policy[key] = updateFields[key];
      }
    }

    await policy.save();

    await createAuditLog({
      userId: req.user.id,
      action: 'UPDATE_POLICY',
      entityType: 'policy',
      entityId: policy.id,
      newValue: updateFields,
      req
    });

    return res.json(policy.toJSON());
  } catch (err) {
    next(err);
  }
}

async function deletePolicy(req, res, next) {
  try {
    const policy = await Policy.findOne({
      $or: [{ id: req.params.policy_id }, { _id: req.params.policy_id }]
    });

    if (!policy) {
      return res.status(404).json({ detail: 'Policy not found' });
    }

    const claimCount = await Claim.countDocuments({ policy_id: policy.id });
    if (claimCount > 0) {
      return res.status(400).json({
        detail: `Cannot delete policy with ${claimCount} existing claim(s)`
      });
    }

    await Policy.deleteOne({ _id: policy._id });

    await createAuditLog({
      userId: req.user.id,
      action: 'DELETE_POLICY',
      entityType: 'policy',
      entityId: policy.id,
      req
    });

    return res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listPolicies,
  getMyPolicies,
  getPolicy,
  createPolicy,
  updatePolicy,
  deletePolicy
};

