const Claim = require('../models/Claim');
const Policy = require('../models/Policy');
const ClaimDocument = require('../models/ClaimDocument');
const { AiAnalysis } = require('../models/AiVerificationResult');
const { summarizeClaim, extractDocumentInfo } = require('../services/gptService');
const { evaluateClaimRisk } = require('../services/riskService');
const { analyzeDamageImage } = require('../services/imageAnalysisService');
const { resolveFilePath } = require('../utils/fileUtils');

async function getClaimSummary(req, res, next) {
  try {
    const { claim_id } = req.body;
    const claim = await Claim.findOne({ $or: [{ id: claim_id }, { _id: claim_id }] });
    if (!claim) return res.status(404).json({ detail: 'Claim not found' });

    const summary = await summarizeClaim(
      claim.description || '',
      claim.incident_type,
      parseFloat(claim.requested_amount || 0)
    );

    // Save in ai_analysis
    await AiAnalysis.create({
      claim_id: claim.id,
      analysis_type: 'GPT_SUMMARY',
      model_version: summary.model || 'gpt-4o',
      input_data: {
        description: claim.description,
        incident_type: claim.incident_type,
        requested_amount: parseFloat(claim.requested_amount || 0)
      },
      output_data: summary,
      requested_by: req.user.id,
      created_at: new Date()
    });

    summary.claim_id = claim.id;
    summary.summary = summary.data?.incident_summary || '';
    return res.json(summary);
  } catch (err) {
    next(err);
  }
}

async function getFraudScore(req, res, next) {
  try {
    const claimId = req.body.claim_id || req.params.claim_id;
    const claim = await Claim.findOne({ $or: [{ id: claimId }, { _id: claimId }] });
    if (!claim) return res.status(404).json({ detail: 'Claim not found' });

    const policy = await Policy.findOne({ $or: [{ id: claim.policy_id }, { _id: claim.policy_id }] });
    const riskAssessment = await evaluateClaimRisk(claim, policy);

    claim.fraud_score = riskAssessment.fraud_probability;
    claim.risk_level = riskAssessment.risk_level;
    await claim.save();

    riskAssessment.fraud_score = riskAssessment.fraud_probability;
    riskAssessment.indicators = riskAssessment.indicators_triggered;
    riskAssessment.model = riskAssessment.label;

    return res.json(riskAssessment);
  } catch (err) {
    next(err);
  }
}

async function analyzeDocument(req, res, next) {
  try {
    const { document_text, document_type } = req.body;
    const result = await extractDocumentInfo(document_text, document_type);
    return res.json(result);
  } catch (err) {
    next(err);
  }
}

async function analyzeImage(req, res, next) {
  try {
    const { document_id } = req.body;
    const doc = await ClaimDocument.findOne({ $or: [{ id: document_id }, { _id: document_id }] });
    if (!doc) return res.status(404).json({ detail: 'Document not found' });

    if (!doc.mime_type?.startsWith('image/')) {
      return res.status(400).json({ detail: 'Document is not an image file' });
    }

    const realPath = resolveFilePath(doc.file_path);
    const analysis = await analyzeDamageImage(realPath, doc.filename);

    await AiAnalysis.create({
      claim_id: doc.claim_id,
      document_id: doc.id,
      analysis_type: 'IMAGE_ANALYSIS',
      output_data: analysis,
      requested_by: req.user.id,
      created_at: new Date()
    });

    return res.json(analysis);
  } catch (err) {
    next(err);
  }
}

async function getClaimAiResults(req, res, next) {
  try {
    const claimId = req.params.claim_id;
    const analyses = await AiAnalysis.find({ claim_id: claimId }).sort({ created_at: -1 });

    return res.json({
      claim_id: claimId,
      analyses: analyses.map(a => a.toJSON())
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getClaimSummary,
  getFraudScore,
  analyzeDocument,
  analyzeImage,
  getClaimAiResults
};

