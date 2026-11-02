const Claim = require('../models/Claim');
const Policy = require('../models/Policy');
const User = require('../models/User');
const ClaimTimeline = require('../models/ClaimTimeline');
const ClaimReview = require('../models/ClaimReview');
const DocumentRequest = require('../models/DocumentRequest');
const Settlement = require('../models/Settlement');
const AdminClarification = require('../models/AdminClarification');
const { AiVerificationResult } = require('../models/AiVerificationResult');
const { generateClaimNumber } = require('../utils/claimNumber');
const { createAuditLog } = require('../services/auditService');
const {
  notifyClaimSubmitted,
  notifyClaimApproved,
  notifyClaimRejected,
  notifyDocumentRequested
} = require('../services/notificationService');
const {
  runAiDocumentVerification,
  getLatestAiVerification
} = require('../services/aiVerificationService');
const { evaluateClaimRisk } = require('../services/riskService');

async function enrichClaim(claim) {
  const claimObj = typeof claim.toJSON === 'function' ? claim.toJSON() : { ...claim };

  const [customer, policy, officer, settlement, aiVerif, escalationReview] = await Promise.all([
    User.findOne({ $or: [{ id: claimObj.customer_id }, { _id: claimObj.customer_id }] }).lean(),
    Policy.findOne({ $or: [{ id: claimObj.policy_id }, { _id: claimObj.policy_id }] }).lean(),
    claimObj.assigned_officer_id ? User.findOne({ $or: [{ id: claimObj.assigned_officer_id }, { _id: claimObj.assigned_officer_id }] }).lean() : null,
    Settlement.findOne({ claim_id: claimObj.id }).lean(),
    AiVerificationResult.findOne({ claim_id: claimObj.id }).lean(),
    ClaimReview.findOne({ claim_id: claimObj.id, review_type: 'ESCALATION' }).sort({ created_at: -1 }).lean()
  ]);

  claimObj.customer_name = customer?.full_name || null;
  claimObj.policy_number = policy?.policy_number || null;
  claimObj.officer_name = officer?.full_name || null;

  if (settlement) {
    claimObj.settlement_id = settlement.id;
    claimObj.settlement_amount = parseFloat(settlement.payment_amount);
    claimObj.payment_status = settlement.payment_status;
    claimObj.payment_method = settlement.payment_method;
    claimObj.payment_reference = settlement.payment_reference;
  }

  if (aiVerif) {
    claimObj.image_verification_score = aiVerif.image_verification_score;
    claimObj.document_verification_score = aiVerif.document_verification_score;
    claimObj.overall_verification_status = aiVerif.overall_verification_status;
  } else {
    claimObj.image_verification_score = null;
    claimObj.document_verification_score = null;
    claimObj.overall_verification_status = 'PENDING';
  }

  if (escalationReview) {
    claimObj.escalation_reason = escalationReview.remarks;
    claimObj.escalated_at = escalationReview.created_at;
    const escOfficer = await User.findOne({ $or: [{ id: escalationReview.officer_id }, { _id: escalationReview.officer_id }] }).lean();
    claimObj.escalated_by_name = escOfficer?.full_name || null;
  }

  return claimObj;
}

async function createClaim(req, res, next) {
  try {
    const {
      policy_id,
      incident_type,
      incident_date,
      incident_time,
      incident_location,
      description,
      requested_amount
    } = req.body;

    const policy = await Policy.findOne({
      $or: [{ id: policy_id }, { _id: policy_id }]
    });

    if (!policy) {
      return res.status(404).json({ detail: 'Policy not found' });
    }

    if (req.user.role === 'CUSTOMER' && policy.customer_id !== req.user.id) {
      return res.status(403).json({ detail: 'Access denied: Policy does not belong to user' });
    }

    const claimNumber = await generateClaimNumber();

    const claim = new Claim({
      claim_number: claimNumber,
      policy_id: policy.id,
      customer_id: req.user.id,
      incident_type,
      incident_date: incident_date ? new Date(incident_date) : null,
      incident_time: incident_time || null,
      incident_location: incident_location || null,
      description: description || null,
      requested_amount: parseFloat(requested_amount || 0),
      status: 'DRAFT'
    });

    await claim.save();

    await ClaimTimeline.create({
      claim_id: claim.id,
      status: 'DRAFT',
      description: 'Draft initiated by customer',
      created_by: req.user.id
    });

    await createAuditLog({
      userId: req.user.id,
      action: 'CREATE_CLAIM',
      entityType: 'claim',
      entityId: claim.id,
      newValue: { claim_number: claim.claim_number },
      req
    });

    const enriched = await enrichClaim(claim);
    return res.status(201).json(enriched);
  } catch (err) {
    next(err);
  }
}

async function listClaims(req, res, next) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = Math.min(parseInt(req.query.page_size, 10) || 20, 100);
    const { status, incident_type, risk_level, search, escalated_only, high_fraud_risk } = req.query;

    const query = {};

    if (req.user.role === 'CUSTOMER') {
      query.customer_id = req.user.id;
    } else if (req.user.role === 'CLAIM_OFFICER') {
      // If officer, optionally show assigned or unassigned
      if (req.query.assigned_only === 'true') {
        query.assigned_officer_id = req.user.id;
      }
    }

    if (status) query.status = status;
    if (incident_type) query.incident_type = incident_type;
    if (risk_level) query.risk_level = risk_level;

    if (search) {
      const reg = new RegExp(search, 'i');
      query.$or = [{ claim_number: reg }, { description: reg }, { incident_location: reg }];
    }

    if (escalated_only === 'true' || escalated_only === true) {
      query.status = { $in: ['ADMIN_REVIEW_REQUIRED', 'NEEDS_ADMIN_CLARIFICATION'] };
    }

    if (high_fraud_risk === 'true' || high_fraud_risk === true) {
      query.fraud_score = { $gte: 0.70 };
    }

    const total = await Claim.countDocuments(query);
    const claims = await Claim.find(query)
      .sort({ created_at: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize);

    const enrichedClaims = await Promise.all(claims.map(c => enrichClaim(c)));

    return res.json({
      claims: enrichedClaims,
      total,
      page,
      page_size: pageSize
    });
  } catch (err) {
    next(err);
  }
}

async function getClaim(req, res, next) {
  try {
    const claim = await Claim.findOne({
      $or: [{ id: req.params.claim_id }, { _id: req.params.claim_id }]
    });

    if (!claim) {
      return res.status(404).json({ detail: 'Claim not found' });
    }

    if (req.user.role === 'CUSTOMER' && claim.customer_id !== req.user.id) {
      return res.status(403).json({ detail: 'Access denied' });
    }

    const enriched = await enrichClaim(claim);
    return res.json(enriched);
  } catch (err) {
    next(err);
  }
}

async function updateClaim(req, res, next) {
  try {
    const claim = await Claim.findOne({
      $or: [{ id: req.params.claim_id }, { _id: req.params.claim_id }]
    });

    if (!claim) {
      return res.status(404).json({ detail: 'Claim not found' });
    }

    if (req.user.role === 'CUSTOMER' && claim.customer_id !== req.user.id) {
      return res.status(403).json({ detail: 'Access denied' });
    }

    const allowedFields = [
      'incident_type', 'incident_date', 'incident_time',
      'incident_location', 'description', 'requested_amount'
    ];

    for (const key of allowedFields) {
      if (req.body[key] !== undefined) {
        claim[key] = req.body[key];
      }
    }

    await claim.save();
    const enriched = await enrichClaim(claim);
    return res.json(enriched);
  } catch (err) {
    next(err);
  }
}

async function submitClaim(req, res, next) {
  try {
    const claim = await Claim.findOne({
      $or: [{ id: req.params.claim_id }, { _id: req.params.claim_id }]
    });

    if (!claim) {
      return res.status(404).json({ detail: 'Claim not found' });
    }

    if (req.user.role === 'CUSTOMER' && claim.customer_id !== req.user.id) {
      return res.status(403).json({ detail: 'Access denied' });
    }

    claim.status = 'SUBMITTED';
    await claim.save();

    await ClaimTimeline.create({
      claim_id: claim.id,
      status: 'SUBMITTED',
      description: 'Claim submitted with initial details and evidence',
      created_by: req.user.id
    });

    await notifyClaimSubmitted(claim, claim.customer_id);

    await createAuditLog({
      userId: req.user.id,
      action: 'SUBMIT_CLAIM',
      entityType: 'claim',
      entityId: claim.id,
      req
    });

    // Run initial background AI verification
    try {
      await runAiDocumentVerification(claim.id, req.user.id);
    } catch (e) {
      console.warn(`[AI Verification] Initial run note: ${e.message}`);
    }

    const enriched = await enrichClaim(claim);
    return res.json(enriched);
  } catch (err) {
    next(err);
  }
}

async function getTimeline(req, res, next) {
  try {
    const claimId = req.params.claim_id;
    const timelines = await ClaimTimeline.find({ claim_id: claimId }).sort({ created_at: 1 });
    return res.json(timelines.map(t => t.toJSON()));
  } catch (err) {
    next(err);
  }
}

async function assignOfficer(req, res, next) {
  try {
    const claimId = req.params.claim_id;
    const { officer_id } = req.body;

    const claim = await Claim.findOne({ $or: [{ id: claimId }, { _id: claimId }] });
    if (!claim) return res.status(404).json({ detail: 'Claim not found' });

    const officer = await User.findOne({
      $and: [
        { $or: [{ id: officer_id }, { _id: officer_id }] },
        { role: { $in: ['CLAIM_OFFICER', 'ADMIN'] } }
      ]
    });
    if (!officer) return res.status(404).json({ detail: 'Officer not found' });

    claim.assigned_officer_id = officer.id;
    if (['SUBMITTED', 'DRAFT'].includes(claim.status)) {
      claim.status = 'UNDER_OFFICER_REVIEW';
    }
    await claim.save();

    await ClaimTimeline.create({
      claim_id: claim.id,
      status: claim.status,
      description: `Assigned to ${officer.full_name} for document and claim scrutiny`,
      created_by: req.user.id
    });

    await createAuditLog({
      userId: req.user.id,
      action: 'ASSIGN_OFFICER',
      entityType: 'claim',
      entityId: claim.id,
      newValue: { officer_id: officer.id, officer_name: officer.full_name },
      req
    });

    const enriched = await enrichClaim(claim);
    return res.json(enriched);
  } catch (err) {
    next(err);
  }
}

async function startReview(req, res, next) {
  try {
    const claim = await Claim.findOne({ $or: [{ id: req.params.claim_id }, { _id: req.params.claim_id }] });
    if (!claim) return res.status(404).json({ detail: 'Claim not found' });

    claim.status = 'UNDER_OFFICER_REVIEW';
    await claim.save();

    await ClaimTimeline.create({
      claim_id: claim.id,
      status: 'UNDER_OFFICER_REVIEW',
      description: `Review started by officer ${req.user.full_name}`,
      created_by: req.user.id
    });

    const enriched = await enrichClaim(claim);
    return res.json(enriched);
  } catch (err) {
    next(err);
  }
}

async function requestDocuments(req, res, next) {
  try {
    const claim = await Claim.findOne({ $or: [{ id: req.params.claim_id }, { _id: req.params.claim_id }] });
    if (!claim) return res.status(404).json({ detail: 'Claim not found' });

    const { document_types, message, deadline_days } = req.body;

    const docReq = new DocumentRequest({
      claim_id: claim.id,
      requested_by: req.user.id,
      document_types: document_types || [],
      message,
      deadline_days: deadline_days || 7
    });
    await docReq.save();

    claim.status = 'ADDITIONAL_DOCUMENTS_REQUIRED';
    await claim.save();

    await ClaimTimeline.create({
      claim_id: claim.id,
      status: 'ADDITIONAL_DOCUMENTS_REQUIRED',
      description: `Additional documents requested: ${message}`,
      created_by: req.user.id
    });

    await notifyDocumentRequested(claim, claim.customer_id, message);

    const enriched = await enrichClaim(claim);
    return res.json(enriched);
  } catch (err) {
    next(err);
  }
}

async function getDocumentRequests(req, res, next) {
  try {
    const requests = await DocumentRequest.find({ claim_id: req.params.claim_id }).sort({ created_at: -1 });
    return res.json(requests.map(r => r.toJSON()));
  } catch (err) {
    next(err);
  }
}

async function addClaimNote(req, res, next) {
  try {
    const { remarks, is_internal } = req.body;
    const review = new ClaimReview({
      claim_id: req.params.claim_id,
      officer_id: req.user.id,
      review_type: 'NOTE',
      remarks,
      is_internal: is_internal !== undefined ? is_internal : true
    });
    await review.save();
    return res.json(review.toJSON());
  } catch (err) {
    next(err);
  }
}

async function getClaimReviews(req, res, next) {
  try {
    const reviews = await ClaimReview.find({ claim_id: req.params.claim_id }).sort({ created_at: -1 });
    return res.json(reviews.map(r => r.toJSON()));
  } catch (err) {
    next(err);
  }
}

async function recommendApproval(req, res, next) {
  try {
    const claim = await Claim.findOne({ $or: [{ id: req.params.claim_id }, { _id: req.params.claim_id }] });
    if (!claim) return res.status(404).json({ detail: 'Claim not found' });

    const { remarks, recommended_amount } = req.body;

    await ClaimReview.create({
      claim_id: claim.id,
      officer_id: req.user.id,
      review_type: 'RECOMMENDATION',
      recommendation: 'APPROVE',
      remarks
    });

    claim.status = 'APPROVAL_PENDING';
    if (recommended_amount !== undefined) {
      claim.approved_amount = parseFloat(recommended_amount);
    }
    claim.approval_notes = remarks;
    await claim.save();

    await ClaimTimeline.create({
      claim_id: claim.id,
      status: 'APPROVAL_PENDING',
      description: `Officer recommended approval: ${remarks}`,
      created_by: req.user.id
    });

    const enriched = await enrichClaim(claim);
    return res.json(enriched);
  } catch (err) {
    next(err);
  }
}

async function recommendRejection(req, res, next) {
  try {
    const claim = await Claim.findOne({ $or: [{ id: req.params.claim_id }, { _id: req.params.claim_id }] });
    if (!claim) return res.status(404).json({ detail: 'Claim not found' });

    const { remarks, rejection_reason } = req.body;

    await ClaimReview.create({
      claim_id: claim.id,
      officer_id: req.user.id,
      review_type: 'RECOMMENDATION',
      recommendation: 'REJECT',
      remarks
    });

    claim.status = 'APPROVAL_PENDING';
    claim.rejection_reason = rejection_reason || remarks;
    await claim.save();

    await ClaimTimeline.create({
      claim_id: claim.id,
      status: 'APPROVAL_PENDING',
      description: `Officer recommended rejection: ${rejection_reason || remarks}`,
      created_by: req.user.id
    });

    const enriched = await enrichClaim(claim);
    return res.json(enriched);
  } catch (err) {
    next(err);
  }
}

async function escalateClaim(req, res, next) {
  try {
    const claim = await Claim.findOne({ $or: [{ id: req.params.claim_id }, { _id: req.params.claim_id }] });
    if (!claim) return res.status(404).json({ detail: 'Claim not found' });

    const reason = typeof req.body === 'string' ? req.body : (req.body.reason || req.body.remarks);

    await ClaimReview.create({
      claim_id: claim.id,
      officer_id: req.user.id,
      review_type: 'ESCALATION',
      recommendation: 'ESCALATE',
      remarks: reason
    });

    claim.status = 'ADMIN_REVIEW_REQUIRED';
    claim.escalation_reason = reason;
    claim.escalated_by = req.user.id;
    claim.escalated_at = new Date();
    await claim.save();

    await ClaimTimeline.create({
      claim_id: claim.id,
      status: 'ADMIN_REVIEW_REQUIRED',
      description: `Escalated to Admin for review: ${reason}`,
      created_by: req.user.id
    });

    const enriched = await enrichClaim(claim);
    return res.json(enriched);
  } catch (err) {
    next(err);
  }
}

async function markManualReview(req, res, next) {
  try {
    const claim = await Claim.findOne({ $or: [{ id: req.params.claim_id }, { _id: req.params.claim_id }] });
    if (!claim) return res.status(404).json({ detail: 'Claim not found' });

    const reason = req.body.reason || 'Flagged for comprehensive manual officer review';
    claim.status = 'UNDER_OFFICER_REVIEW';
    await claim.save();

    await ClaimTimeline.create({
      claim_id: claim.id,
      status: 'UNDER_OFFICER_REVIEW',
      description: `Manual review flagged: ${reason}`,
      created_by: req.user.id
    });

    const enriched = await enrichClaim(claim);
    return res.json(enriched);
  } catch (err) {
    next(err);
  }
}

async function requestClarification(req, res, next) {
  try {
    const claim = await Claim.findOne({ $or: [{ id: req.params.claim_id }, { _id: req.params.claim_id }] });
    if (!claim) return res.status(404).json({ detail: 'Claim not found' });

    const question = req.body.question || req.body.remarks || req.body.message;

    await AdminClarification.create({
      claim_id: claim.id,
      officer_id: req.user.id,
      question
    });

    claim.status = 'NEEDS_ADMIN_CLARIFICATION';
    await claim.save();

    await ClaimTimeline.create({
      claim_id: claim.id,
      status: 'NEEDS_ADMIN_CLARIFICATION',
      description: `Clarification requested from Admin: ${question}`,
      created_by: req.user.id
    });

    const enriched = await enrichClaim(claim);
    return res.json(enriched);
  } catch (err) {
    next(err);
  }
}

async function respondClarification(req, res, next) {
  try {
    const claim = await Claim.findOne({ $or: [{ id: req.params.claim_id }, { _id: req.params.claim_id }] });
    if (!claim) return res.status(404).json({ detail: 'Claim not found' });

    const answer = req.body.answer || req.body.response || req.body.instructions;

    await AdminClarification.findOneAndUpdate(
      { claim_id: claim.id, status: 'PENDING' },
      { $set: { answer, admin_id: req.user.id, status: 'ANSWERED', answered_at: new Date() } },
      { sort: { requested_at: -1 } }
    );

    claim.status = 'UNDER_OFFICER_REVIEW';
    await claim.save();

    await ClaimTimeline.create({
      claim_id: claim.id,
      status: 'UNDER_OFFICER_REVIEW',
      description: `Admin provided clarification: ${answer}`,
      created_by: req.user.id
    });

    const enriched = await enrichClaim(claim);
    return res.json(enriched);
  } catch (err) {
    next(err);
  }
}

async function adminDecision(req, res, next) {
  try {
    const claim = await Claim.findOne({ $or: [{ id: req.params.claim_id }, { _id: req.params.claim_id }] });
    if (!claim) return res.status(404).json({ detail: 'Claim not found' });

    const { decision, reason, approved_amount, instructions } = req.body;

    if (decision === 'APPROVE') {
      claim.status = 'APPROVED';
      claim.approved_amount = parseFloat(approved_amount || claim.requested_amount);
      claim.approval_notes = reason || instructions;
      await claim.save();

      await ClaimTimeline.create({
        claim_id: claim.id,
        status: 'APPROVED',
        description: `Admin approved claim for ₹${claim.approved_amount.toLocaleString('en-IN')}: ${reason || ''}`,
        created_by: req.user.id
      });
      await notifyClaimApproved(claim, claim.customer_id);
    } else if (decision === 'REJECT') {
      claim.status = 'REJECTED';
      claim.rejection_reason = reason;
      await claim.save();

      await ClaimTimeline.create({
        claim_id: claim.id,
        status: 'REJECTED',
        description: `Admin rejected claim: ${reason}`,
        created_by: req.user.id
      });
      await notifyClaimRejected(claim, claim.customer_id, reason);
    } else {
      claim.status = 'UNDER_OFFICER_REVIEW';
      await claim.save();

      await ClaimTimeline.create({
        claim_id: claim.id,
        status: 'UNDER_OFFICER_REVIEW',
        description: `Admin returned claim to officer: ${instructions || reason}`,
        created_by: req.user.id
      });
    }

    const enriched = await enrichClaim(claim);
    return res.json(enriched);
  } catch (err) {
    next(err);
  }
}

async function approveClaim(req, res, next) {
  try {
    const claim = await Claim.findOne({ $or: [{ id: req.params.claim_id }, { _id: req.params.claim_id }] });
    if (!claim) return res.status(404).json({ detail: 'Claim not found' });

    const { approved_amount, approval_notes } = req.body;

    claim.status = 'APPROVED';
    claim.approved_amount = parseFloat(approved_amount || claim.requested_amount);
    claim.approval_notes = approval_notes || null;
    await claim.save();

    await ClaimTimeline.create({
      claim_id: claim.id,
      status: 'APPROVED',
      description: `Claim approved for ₹${claim.approved_amount.toLocaleString('en-IN')}`,
      created_by: req.user.id
    });

    await notifyClaimApproved(claim, claim.customer_id);

    await createAuditLog({
      userId: req.user.id,
      action: 'APPROVE_CLAIM',
      entityType: 'claim',
      entityId: claim.id,
      newValue: { approved_amount: claim.approved_amount },
      req
    });

    const enriched = await enrichClaim(claim);
    return res.json(enriched);
  } catch (err) {
    next(err);
  }
}

async function rejectClaim(req, res, next) {
  try {
    const claim = await Claim.findOne({ $or: [{ id: req.params.claim_id }, { _id: req.params.claim_id }] });
    if (!claim) return res.status(404).json({ detail: 'Claim not found' });

    const { rejection_reason } = req.body;
    if (!rejection_reason) {
      return res.status(400).json({ detail: 'Rejection reason is required' });
    }

    claim.status = 'REJECTED';
    claim.rejection_reason = rejection_reason;
    await claim.save();

    await ClaimTimeline.create({
      claim_id: claim.id,
      status: 'REJECTED',
      description: `Claim rejected: ${rejection_reason}`,
      created_by: req.user.id
    });

    await notifyClaimRejected(claim, claim.customer_id, rejection_reason);

    await createAuditLog({
      userId: req.user.id,
      action: 'REJECT_CLAIM',
      entityType: 'claim',
      entityId: claim.id,
      newValue: { rejection_reason },
      req
    });

    const enriched = await enrichClaim(claim);
    return res.json(enriched);
  } catch (err) {
    next(err);
  }
}

async function deleteClaim(req, res, next) {
  try {
    const claim = await Claim.findOne({ $or: [{ id: req.params.claim_id }, { _id: req.params.claim_id }] });
    if (!claim) return res.status(404).json({ detail: 'Claim not found' });

    if (req.user.role === 'CUSTOMER' && claim.customer_id !== req.user.id) {
      return res.status(403).json({ detail: 'Access denied' });
    }

    await Claim.deleteOne({ _id: claim._id });
    await ClaimTimeline.deleteMany({ claim_id: claim.id });
    await ClaimReview.deleteMany({ claim_id: claim.id });
    await DocumentRequest.deleteMany({ claim_id: claim.id });
    await AiVerificationResult.deleteMany({ claim_id: claim.id });

    return res.status(204).send();
  } catch (err) {
    next(err);
  }
}

async function verifyAi(req, res, next) {
  try {
    const result = await runAiDocumentVerification(req.params.claim_id, req.user.id);
    return res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getAiVerification(req, res, next) {
  try {
    let result = await getLatestAiVerification(req.params.claim_id);
    if (!result) {
      result = await runAiDocumentVerification(req.params.claim_id, req.user?.id);
    }
    return res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getFraudScore(req, res, next) {
  try {
    const claimId = req.params.claim_id;
    const claim = await Claim.findOne({ $or: [{ id: claimId }, { _id: claimId }] }).lean();
    if (!claim) return res.status(404).json({ detail: 'Claim not found' });

    const policy = await Policy.findOne({ $or: [{ id: claim.policy_id }, { _id: claim.policy_id }] }).lean();
    const risk = await evaluateClaimRisk(claim, policy);

    risk.fraud_score = risk.fraud_probability;
    risk.indicators = risk.indicators_triggered;
    risk.model = risk.label;

    return res.json(risk);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createClaim,
  listClaims,
  getClaim,
  updateClaim,
  submitClaim,
  getTimeline,
  assignOfficer,
  startReview,
  requestDocuments,
  getDocumentRequests,
  addClaimNote,
  getClaimReviews,
  recommendApproval,
  recommendRejection,
  escalateClaim,
  markManualReview,
  requestClarification,
  respondClarification,
  adminDecision,
  approveClaim,
  rejectClaim,
  deleteClaim,
  verifyAi,
  getAiVerification,
  getFraudScore,
  enrichClaim
};

