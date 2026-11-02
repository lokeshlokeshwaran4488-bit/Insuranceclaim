const mongoose = require('mongoose');

async function generateClaimNumber() {
  const year = new Date().getFullYear();
  const Claim = mongoose.models.Claim || require('../models/Claim');
  
  // Find highest claim number for this year
  const prefix = `CLM${year}`;
  const latestClaim = await Claim.findOne({
    claim_number: new RegExp(`^${prefix}`)
  }).sort({ claim_number: -1 }).select('claim_number').lean();

  let nextSequence = 1;
  if (latestClaim && latestClaim.claim_number) {
    const seqStr = latestClaim.claim_number.replace(prefix, '');
    const currentSeq = parseInt(seqStr, 10);
    if (!isNaN(currentSeq)) {
      nextSequence = currentSeq + 1;
    }
  }

  return `${prefix}${String(nextSequence).padStart(4, '0')}`;
}

async function generatePolicyNumber(policyType = 'Motor') {
  const year = new Date().getFullYear();
  const typeCode = (policyType || 'GEN').substring(0, 3).toUpperCase();
  const Policy = mongoose.models.Policy || require('../models/Policy');

  const prefix = `POL-${year}-${typeCode}-`;
  const latestPolicy = await Policy.findOne({
    policy_number: new RegExp(`^${prefix}`)
  }).sort({ policy_number: -1 }).select('policy_number').lean();

  let nextSeq = 1;
  if (latestPolicy && latestPolicy.policy_number) {
    const seqStr = latestPolicy.policy_number.replace(prefix, '');
    const currentSeq = parseInt(seqStr, 10);
    if (!isNaN(currentSeq)) {
      nextSeq = currentSeq + 1;
    }
  }

  return `${prefix}${String(nextSeq).padStart(3, '0')}`;
}

module.exports = {
  generateClaimNumber,
  generatePolicyNumber
};

