const Claim = require('../models/Claim');
const Policy = require('../models/Policy');
const ClaimDocument = require('../models/ClaimDocument');
const { AiAnalysis } = require('../models/AiVerificationResult');

function classifyRisk(score) {
  if (score <= 0.25) {
    return { riskLevel: 'LOW', recommendation: 'AUTO_PROCESS' };
  } else if (score <= 0.50) {
    return { riskLevel: 'MODERATE', recommendation: 'STANDARD_REVIEW' };
  } else if (score <= 0.75) {
    return { riskLevel: 'HIGH', recommendation: 'MANUAL_REVIEW' };
  } else {
    return { riskLevel: 'VERY_HIGH', recommendation: 'FRAUD_INVESTIGATION' };
  }
}

async function evaluateClaimRisk(claim, policy) {
  const today = new Date();
  const indicators = [];
  const passedChecks = [];
  const duplicateDocs = [];

  const baseScore = 0.05;

  // 1. Mandatory Fields Validation
  const description = (claim.description || '').trim();
  if (!description || description.length < 15) {
    indicators.push({
      code: 'INSUFFICIENT_DESCRIPTION',
      title: 'Minimal Incident Description',
      severity: 'WARNING',
      weight: 0.15,
      reason: 'The provided incident description is unusually brief or vague.'
    });
  } else {
    passedChecks.push('Incident description meets minimum detail requirements.');
  }

  // 2. Amount Consistency & Coverage Ratio
  const reqAmount = parseFloat(claim.requested_amount || 0);
  const coverage = parseFloat(policy?.coverage_amount || 1);

  if (reqAmount <= 0) {
    indicators.push({
      code: 'INVALID_AMOUNT',
      title: 'Invalid Claim Amount',
      severity: 'CRITICAL',
      weight: 0.40,
      reason: 'Requested claim amount is zero or negative.'
    });
  } else if (reqAmount > coverage) {
    indicators.push({
      code: 'EXCEEDS_POLICY_COVERAGE',
      title: 'Claim Exceeds Coverage Limit',
      severity: 'CRITICAL',
      weight: 0.35,
      reason: `Claim requested (₹${reqAmount.toLocaleString('en-IN')}) exceeds total policy coverage (₹${coverage.toLocaleString('en-IN')}).`
    });
  } else {
    const ratio = reqAmount / coverage;
    if (ratio > 0.85) {
      indicators.push({
        code: 'HIGH_COVERAGE_UTILIZATION',
        title: 'High Coverage Utilization Ratio',
        severity: 'WARNING',
        weight: 0.20,
        reason: `Claim requested is ${(ratio * 100).toFixed(1)}% of maximum policy limit.`
      });
    } else {
      passedChecks.push(`Requested amount is within normal coverage bounds (${(ratio * 100).toFixed(1)}% of limit).`);
    }
  }

  // 3. Incident Date Consistency
  const incDate = claim.incident_date ? new Date(claim.incident_date) : today;
  const pStart = policy?.start_date ? new Date(policy.start_date) : null;
  const pExpiry = policy?.expiry_date ? new Date(policy.expiry_date) : null;

  if (incDate > today) {
    indicators.push({
      code: 'FUTURE_INCIDENT_DATE',
      title: 'Future Incident Date',
      severity: 'CRITICAL',
      weight: 0.50,
      reason: `Reported incident date (${incDate.toISOString().split('T')[0]}) is in the future.`
    });
  } else if (pStart && incDate < pStart) {
    indicators.push({
      code: 'INCIDENT_PREDATES_POLICY',
      title: 'Incident Pre-dates Policy Start',
      severity: 'CRITICAL',
      weight: 0.45,
      reason: `Incident date is before the policy inception date (${pStart.toISOString().split('T')[0]}).`
    });
  } else if (pExpiry && incDate > pExpiry) {
    indicators.push({
      code: 'INCIDENT_AFTER_EXPIRY',
      title: 'Incident Occurred After Expiry',
      severity: 'CRITICAL',
      weight: 0.45,
      reason: `Incident date occurred after policy expiry (${pExpiry.toISOString().split('T')[0]}).`
    });
  } else {
    passedChecks.push('Incident occurred within the active policy term.');
  }

  // Reporting lag
  const daysToReport = Math.floor((today - incDate) / (1000 * 60 * 60 * 24));
  if (daysToReport > 30) {
    indicators.push({
      code: 'DELAYED_REPORTING',
      title: 'Delayed Claim Submission',
      severity: 'WARNING',
      weight: 0.15,
      reason: `Claim was submitted ${daysToReport} days after the incident.`
    });
  } else if (daysToReport === 0) {
    passedChecks.push('Claim submitted promptly on the same day as the incident.');
  } else {
    passedChecks.push(`Reporting turnaround is normal (${daysToReport} days).`);
  }

  // Policy maturity (claim filed right after purchasing)
  if (pStart) {
    const daysActive = Math.floor((incDate - pStart) / (1000 * 60 * 60 * 24));
    if (daysActive < 15 && daysActive >= 0) {
      indicators.push({
        code: 'EARLY_POLICY_CLAIM',
        title: 'Immediate Claim Post-Inception',
        severity: 'WARNING',
        weight: 0.20,
        reason: `Incident occurred only ${daysActive} day(s) after policy commencement.`
      });
    } else {
      passedChecks.push(`Policy has established tenure (${daysActive} days active before incident).`);
    }
  }

  // 4. Duplicate Submission Detection
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const potentialDuplicates = await Claim.find({
    id: { $ne: claim.id },
    customer_id: claim.customer_id,
    policy_id: claim.policy_id,
    $or: [
      { incident_date: claim.incident_date, status: { $ne: 'REJECTED' } },
      { requested_amount: claim.requested_amount, created_at: { $gte: thirtyDaysAgo } }
    ]
  }).lean();

  if (potentialDuplicates.length > 0) {
    const dupNumbers = potentialDuplicates.map(d => d.claim_number).join(', ');
    indicators.push({
      code: 'POTENTIAL_DUPLICATE_CLAIM',
      title: 'Possible Duplicate Claim Submission',
      severity: 'CRITICAL',
      weight: 0.35,
      reason: `Found matching prior claims with identical incident date or amount: ${dupNumbers}.`
    });
  } else {
    passedChecks.push('No duplicate claim submissions found for this customer and policy.');
  }

  // 5. Customer Claim History Velocity
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const recentClaimsCount = await Claim.countDocuments({
    id: { $ne: claim.id },
    customer_id: claim.customer_id,
    created_at: { $gte: ninetyDaysAgo }
  });

  if (recentClaimsCount >= 3) {
    indicators.push({
      code: 'HIGH_CLAIM_VELOCITY',
      title: 'High Recent Claim Frequency',
      severity: 'WARNING',
      weight: 0.20,
      reason: `Customer has submitted ${recentClaimsCount} other claims within the last 90 days.`
    });
  } else {
    passedChecks.push('Customer claim frequency is within standard thresholds.');
  }

  // 6. Document Content Hash Duplication
  try {
    const currentDocs = await ClaimDocument.find({
      claim_id: claim.id,
      content_hash: { $exists: true, $ne: null }
    }).lean();

    if (!currentDocs || currentDocs.length === 0) {
      indicators.push({
        code: 'NO_DOCUMENTS_ATTACHED',
        title: 'No Supporting Documents Attached',
        severity: 'INFO',
        weight: 0.05,
        reason: 'Customer has not attached supporting receipts, FIR, or repair estimates.'
      });
    } else {
      passedChecks.push(`${currentDocs.length} supporting document(s) uploaded and hash-verified.`);

      for (const doc of currentDocs) {
        if (doc.content_hash) {
          const dupDoc = await ClaimDocument.findOne({
            claim_id: { $ne: claim.id },
            content_hash: doc.content_hash
          }).lean();

          if (dupDoc) {
            duplicateDocs.push({
              current_document: doc.original_filename,
              matched_claim_id: dupDoc.claim_id,
              matched_document: dupDoc.original_filename,
              content_hash: doc.content_hash.substring(0, 12) + '...'
            });
          }
        }
      }

      if (duplicateDocs.length > 0) {
        indicators.push({
          code: 'REPEATED_DOCUMENT_CONTENT',
          title: 'Document Hash Reuse Detected',
          severity: 'CRITICAL',
          weight: 0.35,
          reason: `File '${duplicateDocs[0].current_document}' has identical binary SHA-256 hash to a file in claim ${duplicateDocs[0].matched_claim_id}.`
        });
      } else {
        passedChecks.push('All attached file hashes are unique across the repository.');
      }
    }
  } catch (docErr) {
    console.warn(`[RiskService] Document check error: ${docErr.message}`);
  }

  // Aggregate Score & Classification
  const totalWeight = baseScore + indicators.reduce((acc, ind) => acc + (ind.weight || 0), 0);
  const normalizedScore = Math.min(Math.round(totalWeight * 10000) / 10000, 0.99);
  const { riskLevel, recommendation } = classifyRisk(normalizedScore);

  const assessment = {
    claim_id: claim.id,
    claim_number: claim.claim_number,
    fraud_probability: normalizedScore,
    risk_level: riskLevel,
    recommendation,
    assessment_method: 'RULE_BASED_HEURISTIC_V2',
    label: 'Transparent Multi-Point Risk Indicator Assessment (Rule-Based Decision Support)',
    indicators_triggered: indicators,
    passed_checks: passedChecks,
    duplicate_documents: duplicateDocs,
    evaluated_at: new Date().toISOString(),
    disclaimer: 'This risk assessment is strictly advisory and rule-based decision support for authorized claim officers. Claims must never be rejected automatically solely based on risk indicators.'
  };

  // Persist to MongoDB ai_analysis
  try {
    await AiAnalysis.create({
      claim_id: claim.id,
      analysis_type: 'RISK_INDICATOR_AUDIT',
      model_version: 'rules-heuristic-v2.0',
      output_data: assessment,
      created_at: new Date()
    });
  } catch (saveErr) {
    console.warn(`[RiskService] Could not save assessment to ai_analysis: ${saveErr.message}`);
  }

  return assessment;
}

module.exports = {
  evaluateClaimRisk,
  classifyRisk
};

