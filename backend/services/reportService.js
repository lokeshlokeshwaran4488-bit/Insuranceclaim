const Claim = require('../models/Claim');
const Policy = require('../models/Policy');
const User = require('../models/User');
const Settlement = require('../models/Settlement');

function sanitizeCsvCell(value) {
  if (value === null || value === undefined) return '';
  const textVal = String(value);
  if (textVal && ['=', '+', '-', '@', '\t', '\r'].includes(textVal[0])) {
    return `'${textVal}`;
  }
  return textVal;
}

function escapeCsvField(field) {
  const sanitized = sanitizeCsvCell(field);
  if (sanitized.includes('"') || sanitized.includes(',') || sanitized.includes('\n')) {
    return `"${sanitized.replace(/"/g, '""')}"`;
  }
  return sanitized;
}

async function getReportSummary(fromDate = null, toDate = null) {
  const query = {};
  if (fromDate || toDate) {
    query.created_at = {};
    if (fromDate) query.created_at.$gte = new Date(fromDate);
    if (toDate) query.created_at.$lte = new Date(toDate);
  }

  const claims = await Claim.find(query).lean();
  const totalClaims = claims.length;

  const byStatus = {};
  const byType = {};
  const processingDurations = [];

  for (const c of claims) {
    byStatus[c.status] = (byStatus[c.status] || 0) + 1;
    byType[c.incident_type] = (byType[c.incident_type] || 0) + 1;

    if (['APPROVED', 'SETTLED', 'REJECTED'].includes(c.status) && c.created_at && c.updated_at) {
      const days = (new Date(c.updated_at) - new Date(c.created_at)) / (1000 * 60 * 60 * 24);
      if (days >= 0) processingDurations.push(days);
    }
  }

  const approvedCount = (byStatus['APPROVED'] || 0) + (byStatus['SETTLED'] || 0);
  const rejectedCount = byStatus['REJECTED'] || 0;
  const avgTurnaroundDays = processingDurations.length > 0
    ? Math.round((processingDurations.reduce((a, b) => a + b, 0) / processingDurations.length) * 100) / 100
    : 0.0;

  const completedSettlements = await Settlement.find({ payment_status: 'COMPLETED' }).lean();
  const totalSettlementPayout = completedSettlements.reduce((sum, s) => sum + (parseFloat(s.payment_amount) || 0), 0);

  return {
    period: {
      from_date: fromDate || 'all-time',
      to_date: toDate || 'present'
    },
    total_claims: totalClaims,
    by_status: byStatus,
    by_type: byType,
    approved_count: approvedCount,
    rejected_count: rejectedCount,
    approval_rate_percent: Math.round((approvedCount / Math.max(totalClaims, 1)) * 1000) / 10,
    rejection_rate_percent: Math.round((rejectedCount / Math.max(totalClaims, 1)) * 1000) / 10,
    avg_processing_days: avgTurnaroundDays,
    completed_samples: processingDurations.length,
    total_settlement_payout: totalSettlementPayout,
    total_settlements_completed: completedSettlements.length
  };
}

async function generateClaimsCsv(filters = {}) {
  const query = {};
  if (filters.status) query.status = filters.status;
  if (filters.incident_type) query.incident_type = filters.incident_type;
  if (filters.risk_level) query.risk_level = filters.risk_level;
  if (filters.from_date || filters.to_date) {
    query.created_at = {};
    if (filters.from_date) query.created_at.$gte = new Date(filters.from_date);
    if (filters.to_date) query.created_at.$lte = new Date(filters.to_date);
  }

  const claims = await Claim.find(query).sort({ created_at: -1 }).lean();

  // Populate users and policies
  const customerIds = [...new Set(claims.map(c => c.customer_id))];
  const officerIds = [...new Set(claims.map(c => c.assigned_officer_id).filter(Boolean))];
  const policyIds = [...new Set(claims.map(c => c.policy_id))];

  const customers = await User.find({ id: { $in: customerIds } }).lean();
  const officers = await User.find({ id: { $in: officerIds } }).lean();
  const policies = await Policy.find({ id: { $in: policyIds } }).lean();

  const custMap = Object.fromEntries(customers.map(c => [c.id, c]));
  const offMap = Object.fromEntries(officers.map(o => [o.id, o]));
  const polMap = Object.fromEntries(policies.map(p => [p.id, p]));

  const headers = [
    'Claim Number',
    'Customer Name',
    'Customer Email',
    'Policy Number',
    'Policy Type',
    'Incident Type',
    'Incident Date',
    'Incident Location',
    'Requested Amount (INR)',
    'Approved Amount (INR)',
    'Status',
    'Risk Level',
    'Fraud Probability',
    'Assigned Officer',
    'Created At',
    'Updated At'
  ];

  const rows = claims.map(c => {
    const cust = custMap[c.customer_id];
    const off = offMap[c.assigned_officer_id];
    const pol = polMap[c.policy_id];

    return [
      c.claim_number,
      cust?.full_name || 'N/A',
      cust?.email || 'N/A',
      pol?.policy_number || 'N/A',
      pol?.policy_type || 'N/A',
      c.incident_type,
      c.incident_date ? new Date(c.incident_date).toISOString().split('T')[0] : '',
      c.incident_location || '',
      parseFloat(c.requested_amount || 0),
      c.approved_amount !== null ? parseFloat(c.approved_amount) : 0,
      c.status,
      c.risk_level || 'LOW',
      c.fraud_score !== null && c.fraud_score !== undefined ? Number(c.fraud_score).toFixed(4) : 'N/A',
      off?.full_name || 'Unassigned',
      c.created_at ? new Date(c.created_at).toISOString() : '',
      c.updated_at ? new Date(c.updated_at).toISOString() : ''
    ].map(escapeCsvField).join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

async function generateSettlementsCsv(paymentStatus = null) {
  const query = {};
  if (paymentStatus) query.payment_status = paymentStatus;

  const settlements = await Settlement.find(query).sort({ created_at: -1 }).lean();
  const claimIds = settlements.map(s => s.claim_id);
  const claims = await Claim.find({ id: { $in: claimIds } }).lean();
  const customerIds = claims.map(c => c.customer_id);
  const customers = await User.find({ id: { $in: customerIds } }).lean();

  const claimMap = Object.fromEntries(claims.map(c => [c.id, c]));
  const custMap = Object.fromEntries(customers.map(c => [c.id, c]));

  const headers = [
    'Settlement ID',
    'Claim Number',
    'Customer Name',
    'Approved Amount (INR)',
    'Payment Amount (INR)',
    'Payment Method',
    'Payment Status',
    'Payment Reference',
    'Processed At',
    'Completed At'
  ];

  const rows = settlements.map(s => {
    const claim = claimMap[s.claim_id];
    const cust = claim ? custMap[claim.customer_id] : null;

    return [
      s.id,
      claim?.claim_number || 'N/A',
      cust?.full_name || 'N/A',
      parseFloat(s.approved_amount || 0),
      parseFloat(s.payment_amount || 0),
      s.payment_method || 'NEFT',
      s.payment_status,
      s.payment_reference || 'N/A',
      s.processed_at ? new Date(s.processed_at).toISOString() : '',
      s.completed_at ? new Date(s.completed_at).toISOString() : ''
    ].map(escapeCsvField).join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

module.exports = {
  getReportSummary,
  generateClaimsCsv,
  generateSettlementsCsv
};

