const User = require('../models/User');
const Customer = require('../models/Customer');
const Policy = require('../models/Policy');
const Claim = require('../models/Claim');
const ClaimTimeline = require('../models/ClaimTimeline');
const DocumentRequest = require('../models/DocumentRequest');
const OfficerReview = require('../models/OfficerReview');
const Settlement = require('../models/Settlement');
const { createAuditLog } = require('../services/auditService');

async function listCustomers(req, res, next) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = Math.min(parseInt(req.query.page_size, 10) || 50, 100);
    const search = req.query.search;

    const query = { role: 'CUSTOMER' };
    if (search) {
      const reg = new RegExp(search, 'i');
      query.$or = [{ full_name: reg }, { email: reg }];
    }

    const total = await User.countDocuments(query);
    const customers = await User.find(query)
      .sort({ created_at: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize);

    // Calculate claim counts for each customer
    const customerIds = customers.map(c => c.id);
    const claimCounts = await Claim.aggregate([
      { $match: { customer_id: { $in: customerIds } } },
      { $group: { _id: '$customer_id', count: { $sum: 1 } } }
    ]);
    const countsMap = Object.fromEntries(claimCounts.map(item => [item._id, item.count]));

    const customersWithCounts = customers.map(c => ({
      ...c.toJSON(),
      total_claims: countsMap[c.id] || 0
    }));

    return res.json({
      customers: customersWithCounts,
      total,
      page,
      page_size: pageSize
    });
  } catch (err) {
    next(err);
  }
}

async function createCustomer(req, res, next) {
  try {
    const { full_name, email, password, phone, address } = req.body;

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
      role: 'CUSTOMER',
      is_active: true
    });
    await user.save();

    await Customer.findOneAndUpdate(
      { email: user.email },
      {
        $set: {
          id: user.id,
          full_name: user.full_name,
          email: user.email,
          phone: user.phone,
          address: user.address,
          role: 'CUSTOMER',
          is_active: true,
          password_hash: user.password_hash,
          total_claims: 0
        }
      },
      { upsert: true }
    );

    await createAuditLog({
      userId: req.user.id,
      action: 'CREATE_CUSTOMER',
      entityType: 'customer',
      entityId: user.id,
      newValue: { email: user.email, full_name: user.full_name },
      req
    });

    return res.status(201).json(user.toJSON());
  } catch (err) {
    next(err);
  }
}

async function getCustomer(req, res, next) {
  try {
    const customer = await User.findOne({
      $and: [
        { $or: [{ id: req.params.customer_id }, { _id: req.params.customer_id }] },
        { role: 'CUSTOMER' }
      ]
    });

    if (!customer) {
      return res.status(404).json({ detail: 'Customer not found' });
    }

    return res.json(customer.toJSON());
  } catch (err) {
    next(err);
  }
}

async function getCustomerFullDetails(req, res, next) {
  try {
    const customerId = req.params.customer_id;
    const customer = await User.findOne({
      $and: [
        { $or: [{ id: customerId }, { _id: customerId }] },
        { role: 'CUSTOMER' }
      ]
    });

    if (!customer) {
      return res.status(404).json({ detail: 'Customer not found' });
    }

    const policies = await Policy.find({ customer_id: customer.id }).sort({ created_at: -1 }).lean();
    const claims = await Claim.find({ customer_id: customer.id }).sort({ created_at: -1 }).lean();

    const claimIds = claims.map(c => c.id);
    const [timelines, docRequests, reviews, settlements, officers] = await Promise.all([
      ClaimTimeline.find({ claim_id: { $in: claimIds } }).sort({ created_at: 1 }).lean(),
      DocumentRequest.find({ claim_id: { $in: claimIds } }).sort({ created_at: -1 }).lean(),
      OfficerReview.find({ claim_id: { $in: claimIds } }).sort({ created_at: -1 }).lean(),
      Settlement.find({ claim_id: { $in: claimIds } }).lean(),
      User.find({ role: { $in: ['CLAIM_OFFICER', 'ADMIN'] } }).lean()
    ]);

    const polMap = Object.fromEntries(policies.map(p => [p.id, p]));
    const offMap = Object.fromEntries(officers.map(o => [o.id, o]));
    const setMap = Object.fromEntries(settlements.map(s => [s.claim_id, s]));

    const timelinesByClaim = {};
    for (const t of timelines) {
      if (!timelinesByClaim[t.claim_id]) timelinesByClaim[t.claim_id] = [];
      timelinesByClaim[t.claim_id].push(t);
    }

    const docRequestsByClaim = {};
    for (const dr of docRequests) {
      if (!docRequestsByClaim[dr.claim_id]) docRequestsByClaim[dr.claim_id] = [];
      docRequestsByClaim[dr.claim_id].push(dr);
    }

    const reviewsByClaim = {};
    for (const r of reviews) {
      if (!reviewsByClaim[r.claim_id]) reviewsByClaim[r.claim_id] = [];
      reviewsByClaim[r.claim_id].push(r);
    }

    const formattedClaims = [];
    const newlySubmitted = [];
    const underProcessing = [];
    const awaitingDocs = [];
    const approvedClaims = [];
    const rejectedClaims = [];
    const settledClaims = [];

    let totalRequested = 0;
    let totalApproved = 0;

    for (const c of claims) {
      const pol = polMap[c.policy_id];
      const off = offMap[c.assigned_officer_id];
      const stl = setMap[c.id];

      const reqAmt = parseFloat(c.requested_amount || 0);
      const appAmt = c.approved_amount !== null && c.approved_amount !== undefined ? parseFloat(c.approved_amount) : null;
      totalRequested += reqAmt;
      if (appAmt !== null) totalApproved += appAmt;

      const cDict = {
        id: c.id,
        claim_number: c.claim_number,
        policy_id: c.policy_id,
        policy_number: pol?.policy_number || null,
        policy_type: pol?.policy_type || null,
        incident_type: c.incident_type,
        incident_date: c.incident_date ? new Date(c.incident_date).toISOString().split('T')[0] : null,
        incident_time: c.incident_time || null,
        incident_location: c.incident_location || null,
        description: c.description || null,
        requested_amount: reqAmt,
        approved_amount: appAmt,
        status: c.status,
        fraud_score: c.fraud_score !== null && c.fraud_score !== undefined ? parseFloat(c.fraud_score) : null,
        risk_level: c.risk_level || null,
        assigned_officer_id: c.assigned_officer_id || null,
        officer_name: off?.full_name || null,
        rejection_reason: c.rejection_reason || null,
        approval_notes: c.approval_notes || null,
        created_at: c.created_at ? new Date(c.created_at).toISOString() : null,
        updated_at: c.updated_at ? new Date(c.updated_at).toISOString() : null,
        settlement: stl ? {
          id: stl.id,
          payment_amount: parseFloat(stl.payment_amount),
          payment_status: stl.payment_status,
          payment_method: stl.payment_method,
          payment_reference: stl.payment_reference
        } : null,
        timeline: (timelinesByClaim[c.id] || []).map(t => ({
          id: t.id,
          status: t.status,
          description: t.description,
          created_at: t.created_at ? new Date(t.created_at).toISOString() : null
        })),
        document_requests: (docRequestsByClaim[c.id] || []).map(dr => ({
          id: dr.id,
          message: dr.message,
          document_types: dr.document_types,
          is_fulfilled: dr.is_fulfilled,
          created_at: dr.created_at ? new Date(dr.created_at).toISOString() : null
        })),
        reviews: (reviewsByClaim[c.id] || []).map(r => ({
          id: r.id,
          review_type: r.review_type,
          remarks: r.remarks,
          recommendation: r.recommendation,
          is_internal: r.is_internal,
          created_at: r.created_at ? new Date(r.created_at).toISOString() : null
        }))
      };

      formattedClaims.push(cDict);

      if (['SUBMITTED', 'DRAFT'].includes(c.status)) {
        newlySubmitted.push(cDict);
      } else if (['UNDER_OFFICER_REVIEW', 'UNDER_VERIFICATION', 'AI_ANALYSIS_COMPLETED', 'NEEDS_ADMIN_CLARIFICATION', 'APPROVAL_PENDING', 'UNDER_FRAUD_REVIEW', 'ADMIN_REVIEW_REQUIRED'].includes(c.status)) {
        underProcessing.push(cDict);
      } else if (['ADDITIONAL_DOCUMENTS_REQUIRED', 'DOCUMENTS_PENDING', 'DOCUMENTS_RECEIVED'].includes(c.status)) {
        awaitingDocs.push(cDict);
      } else if (['APPROVED', 'SETTLEMENT_PENDING', 'SETTLEMENT_PROCESSING'].includes(c.status)) {
        approvedClaims.push(cDict);
      } else if (c.status === 'REJECTED') {
        rejectedClaims.push(cDict);
      } else if (['SETTLED', 'CLOSED'].includes(c.status)) {
        settledClaims.push(cDict);
      }
    }

    return res.json({
      customer: {
        id: customer.id,
        full_name: customer.full_name,
        email: customer.email,
        phone: customer.phone,
        address: customer.address,
        role: customer.role,
        is_active: customer.is_active,
        created_at: customer.created_at ? new Date(customer.created_at).toISOString() : null,
        total_claims: claims.length
      },
      policies: policies.map(p => ({
        id: p.id,
        policy_number: p.policy_number,
        policy_type: p.policy_type,
        coverage_amount: parseFloat(p.coverage_amount),
        premium_amount: parseFloat(p.premium_amount),
        deductible_amount: parseFloat(p.deductible_amount),
        start_date: p.start_date ? new Date(p.start_date).toISOString().split('T')[0] : null,
        expiry_date: p.expiry_date ? new Date(p.expiry_date).toISOString().split('T')[0] : null,
        status: p.status
      })),
      claims: formattedClaims,
      categorized: {
        newly_submitted: newlySubmitted,
        under_processing: underProcessing,
        awaiting_documents: awaitingDocs,
        approved: approvedClaims,
        rejected: rejectedClaims,
        settled: settledClaims
      },
      summary: {
        total_claims: claims.length,
        newly_submitted_count: newlySubmitted.length,
        under_processing_count: underProcessing.length,
        awaiting_documents_count: awaitingDocs.length,
        approved_count: approvedClaims.length,
        rejected_count: rejectedClaims.length,
        settled_count: settledClaims.length,
        total_requested_amount: totalRequested,
        total_approved_amount: totalApproved
      }
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listCustomers,
  createCustomer,
  getCustomer,
  getCustomerFullDetails
};

