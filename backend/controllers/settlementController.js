const Settlement = require('../models/Settlement');
const Claim = require('../models/Claim');
const User = require('../models/User');
const { encryptSensitiveData } = require('../utils/encryption');
const { createAuditLog } = require('../services/auditService');
const { notifySettlementCompleted } = require('../services/notificationService');
const { enrichClaim } = require('./claimController');

async function enrichSettlement(settlement) {
  const sObj = typeof settlement.toJSON === 'function' ? settlement.toJSON() : { ...settlement };
  const claim = await Claim.findOne({ $or: [{ id: sObj.claim_id }, { _id: sObj.claim_id }] }).lean();

  if (claim) {
    sObj.claim_number = claim.claim_number;
    const customer = await User.findOne({ $or: [{ id: claim.customer_id }, { _id: claim.customer_id }] }).lean();
    sObj.customer_name = customer?.full_name || null;
  }
  return sObj;
}

async function createSettlement(req, res, next) {
  try {
    const { claim_id, payment_amount, payment_method, bank_account } = req.body;

    const claim = await Claim.findOne({ $or: [{ id: claim_id }, { _id: claim_id }] });
    if (!claim) return res.status(404).json({ detail: 'Claim not found' });

    if (claim.status !== 'APPROVED') {
      return res.status(400).json({
        detail: `Only approved claims can be settled. Current status: ${claim.status}`
      });
    }

    const existing = await Settlement.findOne({ claim_id: claim.id });
    if (existing) {
      return res.status(400).json({ detail: 'Settlement already exists for this claim' });
    }

    const encryptedAccount = bank_account ? encryptSensitiveData(bank_account) : null;

    const settlement = new Settlement({
      claim_id: claim.id,
      approved_amount: parseFloat(claim.approved_amount || claim.requested_amount),
      payment_amount: parseFloat(payment_amount),
      payment_method: payment_method || 'NEFT',
      bank_account_encrypted: encryptedAccount,
      payment_status: 'PENDING',
      processed_by: req.user.id,
      processed_at: new Date()
    });

    await settlement.save();

    claim.status = 'SETTLEMENT_PENDING';
    await claim.save();

    await createAuditLog({
      userId: req.user.id,
      action: 'CREATE_SETTLEMENT',
      entityType: 'settlement',
      entityId: settlement.id,
      newValue: { claim_id: claim.id, payment_amount: settlement.payment_amount },
      req
    });

    const enriched = await enrichSettlement(settlement);
    return res.status(201).json(enriched);
  } catch (err) {
    next(err);
  }
}

async function listEligibleClaims(req, res, next) {
  try {
    const claims = await Claim.find({ status: { $in: ['APPROVED', 'SETTLEMENT_PENDING'] } }).lean();
    const claimIds = claims.map(c => c.id);
    const settlements = await Settlement.find({ claim_id: { $in: claimIds } }).lean();
    const setMap = Object.fromEntries(settlements.map(s => [s.claim_id, s]));

    const eligible = await Promise.all(claims.map(async c => {
      const enriched = await enrichClaim(c);
      const stl = setMap[c.id];
      return {
        ...enriched,
        has_settlement: Boolean(stl),
        settlement_id: stl?.id || null,
        settlement_status: stl?.payment_status || null
      };
    }));

    return res.json(eligible);
  } catch (err) {
    next(err);
  }
}

async function listSettlements(req, res, next) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = Math.min(parseInt(req.query.page_size, 10) || 20, 100);
    const { payment_status } = req.query;

    const query = {};
    if (payment_status) query.payment_status = payment_status;

    const total = await Settlement.countDocuments(query);
    const settlements = await Settlement.find(query)
      .sort({ created_at: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize);

    const enriched = await Promise.all(settlements.map(s => enrichSettlement(s)));

    return res.json({
      settlements: enriched,
      total,
      page,
      page_size: pageSize
    });
  } catch (err) {
    next(err);
  }
}

async function getSettlement(req, res, next) {
  try {
    const settlement = await Settlement.findOne({
      $or: [{ id: req.params.settlement_id }, { _id: req.params.settlement_id }]
    });

    if (!settlement) {
      return res.status(404).json({ detail: 'Settlement not found' });
    }

    if (req.user.role === 'CUSTOMER') {
      const claim = await Claim.findOne({ id: settlement.claim_id });
      if (claim && claim.customer_id !== req.user.id) {
        return res.status(403).json({ detail: 'Access denied' });
      }
    }

    const enriched = await enrichSettlement(settlement);
    return res.json(enriched);
  } catch (err) {
    next(err);
  }
}

async function updateSettlement(req, res, next) {
  try {
    const settlement = await Settlement.findOne({
      $or: [{ id: req.params.settlement_id }, { _id: req.params.settlement_id }]
    });

    if (!settlement) {
      return res.status(404).json({ detail: 'Settlement not found' });
    }

    if (settlement.payment_status === 'COMPLETED') {
      return res.status(400).json({ detail: 'Settlement already completed' });
    }

    const updateFields = req.body;
    for (const key of Object.keys(updateFields)) {
      if (key !== 'id' && key !== '_id' && key !== 'claim_id') {
        settlement[key] = updateFields[key];
      }
    }

    if (req.body.payment_status === 'PROCESSING') {
      await Claim.updateOne(
        { $or: [{ id: settlement.claim_id }, { _id: settlement.claim_id }] },
        { $set: { status: 'SETTLEMENT_PROCESSING' } }
      );
    }

    await settlement.save();
    const enriched = await enrichSettlement(settlement);
    return res.json(enriched);
  } catch (err) {
    next(err);
  }
}

async function completeSettlement(req, res, next) {
  try {
    const settlement = await Settlement.findOne({
      $or: [{ id: req.params.settlement_id }, { _id: req.params.settlement_id }]
    });

    if (!settlement) {
      return res.status(404).json({ detail: 'Settlement not found' });
    }

    if (settlement.payment_status === 'COMPLETED') {
      return res.status(400).json({ detail: 'Settlement already completed' });
    }

    settlement.payment_status = 'COMPLETED';
    settlement.completed_at = new Date();
    await settlement.save();

    const claim = await Claim.findOne({ $or: [{ id: settlement.claim_id }, { _id: settlement.claim_id }] });
    if (claim) {
      claim.status = 'SETTLED';
      await claim.save();
      await notifySettlementCompleted(claim, claim.customer_id);
    }

    await createAuditLog({
      userId: req.user.id,
      action: 'COMPLETE_SETTLEMENT',
      entityType: 'settlement',
      entityId: settlement.id,
      req
    });

    const enriched = await enrichSettlement(settlement);
    return res.json(enriched);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createSettlement,
  listEligibleClaims,
  listSettlements,
  getSettlement,
  updateSettlement,
  completeSettlement
};

