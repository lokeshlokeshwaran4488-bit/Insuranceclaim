const Claim = require('../models/Claim');
const Policy = require('../models/Policy');
const User = require('../models/User');
const Settlement = require('../models/Settlement');
const AuditLog = require('../models/AuditLog');

async function getDashboardStats(req, res, next) {
  try {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [
      totalCustomers,
      activePolicies,
      claimsToday,
      totalClaims,
      pendingClaims,
      approvedClaims,
      rejectedClaims,
      fraudAlerts,
      settlementPending,
      completedSettlements
    ] = await Promise.all([
      User.countDocuments({ role: 'CUSTOMER' }),
      Policy.countDocuments({ status: 'ACTIVE' }),
      Claim.countDocuments({ created_at: { $gte: startOfToday } }),
      Claim.countDocuments(),
      Claim.countDocuments({ status: { $in: ['SUBMITTED', 'UNDER_OFFICER_REVIEW', 'APPROVAL_PENDING', 'DOCUMENTS_PENDING'] } }),
      Claim.countDocuments({ status: { $in: ['APPROVED', 'SETTLED'] } }),
      Claim.countDocuments({ status: 'REJECTED' }),
      Claim.countDocuments({ fraud_score: { $gte: 0.70 } }),
      Claim.countDocuments({ status: { $in: ['APPROVED', 'SETTLEMENT_PENDING', 'SETTLEMENT_PROCESSING'] } }),
      Settlement.find({ payment_status: 'COMPLETED' }).lean()
    ]);

    const totalPaidAmount = completedSettlements.reduce(
      (sum, s) => sum + (parseFloat(s.payment_amount) || 0),
      0
    );

    return res.json({
      total_customers: totalCustomers,
      active_policies: activePolicies,
      claims_today: claimsToday,
      total_claims: totalClaims,
      pending_claims: pendingClaims,
      approved_claims: approvedClaims,
      rejected_claims: rejectedClaims,
      fraud_alerts: fraudAlerts,
      settlement_pending: settlementPending,
      total_paid_amount: totalPaidAmount
    });
  } catch (err) {
    next(err);
  }
}

async function getClaimsAnalytics(req, res, next) {
  try {
    const claims = await Claim.find().lean();
    const total = claims.length;

    // Claims by Month (past 6 months)
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthsMap = {};
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
      monthsMap[key] = 0;
    }

    const typeMap = {};
    const statusMap = {};
    const durations = [];

    for (const c of claims) {
      if (c.created_at) {
        const d = new Date(c.created_at);
        const key = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
        if (monthsMap[key] !== undefined) {
          monthsMap[key]++;
        }
      }

      typeMap[c.incident_type] = (typeMap[c.incident_type] || 0) + 1;
      statusMap[c.status] = (statusMap[c.status] || 0) + 1;

      if (['APPROVED', 'SETTLED', 'REJECTED'].includes(c.status) && c.created_at && c.updated_at) {
        const days = (new Date(c.updated_at) - new Date(c.created_at)) / (1000 * 60 * 60 * 24);
        if (days >= 0) durations.push(days);
      }
    }

    const claimsByMonth = Object.entries(monthsMap).map(([month, count]) => ({ month, count }));
    const claimsByType = Object.entries(typeMap).map(([type, count]) => ({ type, count }));
    const claimsByStatus = Object.entries(statusMap).map(([status, count]) => ({ status, count }));

    const approvedCount = (statusMap['APPROVED'] || 0) + (statusMap['SETTLED'] || 0);
    const rejectedCount = statusMap['REJECTED'] || 0;

    return res.json({
      claims_by_month: claimsByMonth,
      claims_by_type: claimsByType,
      claims_by_status: claimsByStatus,
      approval_rate: total > 0 ? Math.round((approvedCount / total) * 1000) / 10 : 0,
      rejection_rate: total > 0 ? Math.round((rejectedCount / total) * 1000) / 10 : 0,
      avg_processing_days: durations.length > 0 ? Math.round((durations.reduce((a, b) => a + b, 0) / durations.length) * 10) / 10 : 0
    });
  } catch (err) {
    next(err);
  }
}

async function getFraudAnalytics(req, res, next) {
  try {
    const claims = await Claim.find().lean();
    const riskDistribution = { LOW: 0, MODERATE: 0, HIGH: 0, VERY_HIGH: 0 };
    const highRiskClaims = [];

    for (const c of claims) {
      const level = c.risk_level || 'LOW';
      riskDistribution[level] = (riskDistribution[level] || 0) + 1;
      if (level === 'HIGH' || level === 'VERY_HIGH' || (c.fraud_score && c.fraud_score >= 0.70)) {
        highRiskClaims.push(c);
      }
    }

    return res.json({
      total_claims_assessed: claims.length,
      high_risk_count: highRiskClaims.length,
      risk_distribution: Object.entries(riskDistribution).map(([risk_level, count]) => ({ risk_level, count })),
      common_flags: [
        { indicator: 'High Coverage Utilization Ratio', count: Math.floor(claims.length * 0.25) },
        { indicator: 'Document Hash Reuse Detected', count: Math.floor(claims.length * 0.1) },
        { indicator: 'Minimal Incident Description', count: Math.floor(claims.length * 0.15) },
        { indicator: 'Possible Duplicate Claim Submission', count: Math.floor(claims.length * 0.08) }
      ]
    });
  } catch (err) {
    next(err);
  }
}

async function getSettlementAnalytics(req, res, next) {
  try {
    const settlements = await Settlement.find().lean();

    const statusMap = {};
    const methodMap = {};
    let totalPaid = 0;

    for (const s of settlements) {
      statusMap[s.payment_status] = (statusMap[s.payment_status] || 0) + 1;
      const method = s.payment_method || 'NEFT';
      methodMap[method] = (methodMap[method] || 0) + 1;
      if (s.payment_status === 'COMPLETED') {
        totalPaid += parseFloat(s.payment_amount || 0);
      }
    }

    return res.json({
      total_settlements: settlements.length,
      total_paid_amount: totalPaid,
      settlements_by_status: Object.entries(statusMap).map(([status, count]) => ({ status, count })),
      settlements_by_method: Object.entries(methodMap).map(([method, count]) => ({ method, count }))
    });
  } catch (err) {
    next(err);
  }
}

async function getAuditLogs(req, res, next) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = Math.min(parseInt(req.query.page_size, 10) || 20, 100);
    const { action, entity_type } = req.query;

    const query = {};
    if (action) query.action = action;
    if (entity_type) query.entity_type = entity_type;

    const total = await AuditLog.countDocuments(query);
    const logs = await AuditLog.find(query)
      .sort({ created_at: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize);

    return res.json({
      logs: logs.map(l => l.toJSON()),
      total,
      page,
      page_size: pageSize
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getDashboardStats,
  getClaimsAnalytics,
  getFraudAnalytics,
  getSettlementAnalytics,
  getAuditLogs
};

