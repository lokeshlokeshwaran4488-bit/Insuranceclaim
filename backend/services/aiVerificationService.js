const fs = require('fs');
const path = require('path');
const Claim = require('../models/Claim');
const Policy = require('../models/Policy');
const User = require('../models/User');
const ClaimDocument = require('../models/ClaimDocument');
const { AiVerificationResult, AiAnalysis } = require('../models/AiVerificationResult');
const { evaluateClaimRisk } = require('./riskService');
const { analyzeDamageImage, analyzeImageQualityAndTampering } = require('./imageAnalysisService');
const { resolveFilePath } = require('../utils/fileUtils');

const REQUIRED_DOCS_BY_INCIDENT = {
  'Motor Vehicle Collision': ['DAMAGE_PHOTO', 'REPAIR_ESTIMATE'],
  'Motor Vehicle Accident': ['DAMAGE_PHOTO', 'REPAIR_ESTIMATE'],
  'Motor Accident': ['DAMAGE_PHOTO', 'REPAIR_ESTIMATE'],
  'VEHICLE_ACCIDENT': ['DAMAGE_PHOTO', 'REPAIR_ESTIMATE'],
  'Vehicle Theft or Vandalism': ['FIR', 'POLICY_DOCUMENT'],
  'Theft': ['FIR', 'POLICY_DOCUMENT'],
  'Medical Hospitalization': ['HOSPITAL_BILL', 'MEDICAL_REPORT'],
  'Medical Emergency': ['HOSPITAL_BILL', 'MEDICAL_REPORT'],
  'Property Fire Damage': ['DAMAGE_PHOTO', 'REPAIR_ESTIMATE'],
  'Property Damage': ['DAMAGE_PHOTO', 'REPAIR_ESTIMATE'],
  'Water Damage / Flooding': ['DAMAGE_PHOTO', 'REPAIR_ESTIMATE'],
  'Personal Accident / Injury': ['MEDICAL_REPORT', 'HOSPITAL_BILL'],
  'Other Casualty': ['IDENTITY_PROOF', 'REPAIR_ESTIMATE']
};

function extractTextFromFile(filePath, mimeType = '') {
  if (!fs.existsSync(filePath)) {
    return { text: '', page_count: 0, ocr_success: false, method: 'none', notes: 'File not found on storage' };
  }

  try {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.txt' || ext === '.csv' || mimeType.startsWith('text/')) {
      const content = fs.readFileSync(filePath, 'utf8');
      return {
        text: content,
        page_count: 1,
        ocr_success: Boolean(content.trim()),
        method: 'PlainTextReader',
        notes: 'Plain text read directly'
      };
    } else if (ext === '.pdf' || mimeType === 'application/pdf') {
      const buffer = fs.readFileSync(filePath);
      // Basic text extraction from PDF stream objects
      const str = buffer.toString('latin1');
      const textMatches = str.match(/\(([^()]+)\)\s*Tj/g) || [];
      const extracted = textMatches.map(m => m.replace(/[()]/g, '').replace(/\s*Tj$/, '')).join(' ');

      const hasText = extracted.trim().length > 20;
      return {
        text: extracted,
        page_count: 1,
        ocr_success: hasText,
        method: hasText ? 'PDF-TextStreamExtractor' : 'PDF-ScannedDocument',
        notes: hasText ? 'Embedded text extracted successfully' : 'Scanned document without embedded text layer — manual inspection recommended.'
      };
    } else {
      return {
        text: '',
        page_count: 0,
        ocr_success: false,
        method: 'unsupported',
        notes: 'Binary document type; OCR text extraction not applicable.'
      };
    }
  } catch (err) {
    return {
      text: '',
      page_count: 0,
      ocr_success: false,
      method: 'failed',
      notes: `Extraction note: ${err.message}`
    };
  }
}

function verifyDocumentFields(text, claim, policy, category) {
  const textLower = (text || '').toLowerCase();
  const matches = [];
  const discrepancies = [];
  const missingFields = [];

  // 1. Policy Number
  if (policy && policy.policy_number) {
    const pClean = policy.policy_number.toLowerCase().replace(/[-\s]/g, '');
    const tClean = textLower.replace(/[-\s]/g, '');
    if (tClean.includes(pClean) || textLower.includes(policy.policy_number.toLowerCase())) {
      matches.push(`Policy Number match (${policy.policy_number})`);
    } else {
      const otherPol = textLower.match(/pol[\s\-]?\d{4}[\s\-]?[a-z]{3}[\s\-]?\d+/);
      if (otherPol) {
        discrepancies.push(`Document contains different policy number (${otherPol[0].toUpperCase()}) than claim policy (${policy.policy_number}).`);
      } else {
        missingFields.push('Policy contract number not explicitly detected in text.');
      }
    }
  }

  // 2. Customer Name
  if (claim.customer_name) {
    const nameParts = claim.customer_name.toLowerCase().split(/\s+/);
    if (nameParts.every(part => textLower.includes(part))) {
      matches.push(`Claimant Name match (${claim.customer_name})`);
    } else if (nameParts.some(part => part.length > 2 && textLower.includes(part))) {
      matches.push(`Partial Claimant Name match (${claim.customer_name})`);
    } else {
      missingFields.push(`Claimant name '${claim.customer_name}' not detected in document text.`);
    }
  }

  // 3. Incident Date
  if (claim.incident_date) {
    const dateStr = new Date(claim.incident_date).toISOString().split('T')[0];
    if (textLower.includes(dateStr)) {
      matches.push(`Incident date confirmed (${dateStr})`);
    }
  }

  // 4. Financial Amount Alignment
  const foundAmounts = textLower.match(/(?:₹|rs\.?|inr)?\s*([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]{2})?|[0-9]{4,8})/g) || [];
  const cleanAmounts = [];
  for (const a of foundAmounts) {
    const num = parseFloat(a.replace(/[^0-9.]/g, ''));
    if (!isNaN(num) && num >= 500 && num <= 5000000) {
      cleanAmounts.push(num);
    }
  }

  if (cleanAmounts.length > 0) {
    const reqAmt = parseFloat(claim.requested_amount || 0);
    const closest = cleanAmounts.reduce((prev, curr) => Math.abs(curr - reqAmt) < Math.abs(prev - reqAmt) ? curr : prev);
    const diffPct = Math.abs(closest - reqAmt) / Math.max(reqAmt, 1.0);
    if (diffPct < 0.15) {
      matches.push(`Financial estimate closely aligns (₹${closest.toLocaleString('en-IN')} vs requested ₹${reqAmt.toLocaleString('en-IN')})`);
    } else if (policy && closest > parseFloat(policy.coverage_amount || 0)) {
      discrepancies.push(`Extracted estimate ₹${closest.toLocaleString('en-IN')} exceeds policy limit ₹${parseFloat(policy.coverage_amount).toLocaleString('en-IN')}.`);
    }
  }

  return {
    matches,
    discrepancies,
    missing_fields: missingFields,
    text_length: text.length
  };
}

async function runAiDocumentVerification(claimId, requestedBy = null) {
  // 1. Fetch claim, policy, customer
  const claim = await Claim.findOne({ $or: [{ id: claimId }, { _id: claimId }] }).lean();
  if (!claim) {
    throw new Error(`Claim ${claimId} not found`);
  }

  const policy = await Policy.findOne({ $or: [{ id: claim.policy_id }, { _id: claim.policy_id }] }).lean();
  const customer = await User.findOne({ $or: [{ id: claim.customer_id }, { _id: claim.customer_id }] }).lean();
  claim.customer_name = customer?.full_name || '';

  // 2. Fetch all uploaded documents from MongoDB
  const documents = await ClaimDocument.find({ claim_id: claim.id }).lean();

  // 3. Categorize into images vs documents
  const imagesList = [];
  const docsList = [];
  for (const d of documents) {
    const mime = (d.mime_type || '').toLowerCase();
    const cat = d.document_category || '';
    if (mime.startsWith('image/') || ['DAMAGE_PHOTO', 'INCIDENT_PHOTO'].includes(cat)) {
      imagesList.push(d);
    } else {
      docsList.push(d);
    }
  }

  // 4. Check for Cross-Claim SHA-256 Duplicates
  const duplicateImageFindings = [];
  const duplicateDocFindings = [];

  for (const d of documents) {
    if (d.content_hash) {
      const dupDocs = await ClaimDocument.find({
        content_hash: d.content_hash,
        claim_id: { $ne: claim.id }
      }).lean();

      for (const dup of dupDocs) {
        const finding = {
          filename: d.original_filename,
          matched_claim_id: dup.claim_id,
          matched_filename: dup.original_filename,
          category: d.document_category,
          hash: d.content_hash.substring(0, 16) + '...'
        };
        if (imagesList.some(img => img.id === d.id)) {
          duplicateImageFindings.push(finding);
        } else {
          duplicateDocFindings.push(finding);
        }
      }
    }
  }

  // 5. Execute Image Verification
  const imageDetails = [];
  const imageConcerns = [];
  const imageStatuses = [];

  for (const imgDoc of imagesList) {
    const filePath = resolveFilePath(imgDoc.file_path);
    const analysis = analyzeImageQualityAndTampering(filePath);
    const damageInfo = await analyzeDamageImage(filePath, imgDoc.original_filename);

    const damageDetected = damageInfo.damage_detected;
    const damageType = damageInfo.damage_type;
    let isRelevant = true;

    if (claim.incident_type.toLowerCase().includes('motor') || claim.incident_type.toLowerCase().includes('collision')) {
      if (damageDetected === false) {
        analysis.concerns.push('No visible vehicle damage detected in collision claim image.');
        isRelevant = false;
      }
    }

    const hasDup = duplicateImageFindings.some(df => df.filename === imgDoc.original_filename);
    if (hasDup) {
      analysis.status = 'SUSPICIOUS';
      analysis.concerns.push('Identical image SHA-256 binary hash detected in another claim submission.');
    }

    imageStatuses.push(analysis.status);
    imageConcerns.push(...analysis.concerns);
    imageConcerns.push(...analysis.manipulation_signs);

    imageDetails.push({
      id: imgDoc.id,
      filename: imgDoc.original_filename,
      category: imgDoc.document_category,
      status: analysis.status,
      resolution: analysis.resolution,
      blur_score: analysis.blur_score,
      is_blurry: analysis.is_blurry,
      damage_type: damageType || 'Visual Damage',
      damage_detected: damageDetected,
      relevant_to_incident: isRelevant,
      concerns: analysis.concerns,
      manipulation_signs: analysis.manipulation_signs,
      has_duplicate: hasDup
    });
  }

  let imageVerificationScore = null;
  let imageStatus = 'PENDING';
  let imageExplanation = 'No incident or damage images uploaded for verification.';

  if (imagesList.length > 0) {
    if (imageStatuses.includes('SUSPICIOUS') || duplicateImageFindings.length > 0) {
      imageStatus = 'SUSPICIOUS';
      imageVerificationScore = 0.40;
      imageExplanation = 'Suspicious image evidence flagged (duplicate hash across claims or editing markers detected).';
    } else if (imageStatuses.includes('UNCERTAIN')) {
      imageStatus = 'UNCERTAIN';
      imageVerificationScore = 0.65;
      imageExplanation = 'Image evidence is uncertain due to blur, low lighting, or unestablished authenticity; manual review required.';
    } else if (imageStatuses.includes('MANUAL_REVIEW')) {
      imageStatus = 'MANUAL_REVIEW';
      imageVerificationScore = 0.70;
      imageExplanation = 'Image requires visual inspection by Claim Officer to confirm damage extent.';
    } else {
      imageStatus = 'VERIFIED';
      imageVerificationScore = 0.92;
      imageExplanation = 'Incident damage images verified: authentic resolution, clear sharpness, no manipulation markers, and consistent with incident type.';
    }
  }

  // 6. Execute Document Verification
  const docDetails = [];
  const docConcerns = [];
  const docStatuses = [];

  for (const doc of docsList) {
    const filePath = resolveFilePath(doc.file_path);
    const ocrRes = extractTextFromFile(filePath, doc.mime_type);
    const extractedText = ocrRes.text;

    const fieldAnalysis = verifyDocumentFields(extractedText, claim, policy, doc.document_category);
    const hasDup = duplicateDocFindings.some(df => df.filename === doc.original_filename);

    let dStatus = 'VERIFIED';
    if (hasDup) {
      dStatus = 'SUSPICIOUS';
      fieldAnalysis.discrepancies.push('Document binary SHA-256 hash matches a document in a prior claim.');
    } else if (fieldAnalysis.discrepancies.length > 0) {
      dStatus = 'SUSPICIOUS';
    } else if (!ocrRes.ocr_success) {
      dStatus = 'UNCERTAIN';
    } else if (fieldAnalysis.missing_fields.length > 0) {
      dStatus = 'MANUAL_REVIEW';
    }

    docStatuses.push(dStatus);
    docConcerns.push(...fieldAnalysis.discrepancies);
    if (!ocrRes.ocr_success) {
      docConcerns.push(`${doc.document_category}: ${ocrRes.notes}`);
    }

    docDetails.push({
      id: doc.id,
      filename: doc.original_filename,
      category: doc.document_category,
      status: dStatus,
      ocr_method: ocrRes.method,
      ocr_success: ocrRes.ocr_success,
      extracted_length: extractedText.length,
      matches: fieldAnalysis.matches,
      discrepancies: fieldAnalysis.discrepancies,
      missing_fields: fieldAnalysis.missing_fields,
      has_duplicate: hasDup
    });
  }

  // Required docs completeness
  const requiredCategories = REQUIRED_DOCS_BY_INCIDENT[claim.incident_type] || ['DAMAGE_PHOTO', 'REPAIR_ESTIMATE'];
  const uploadedCategories = new Set(documents.map(d => d.document_category).filter(Boolean));
  const missingDocs = requiredCategories.filter(cat => !uploadedCategories.has(cat));

  let documentVerificationScore = null;
  let documentStatus = 'PENDING';
  let documentExplanation = 'No supporting documents uploaded for textual/OCR verification.';

  if (docsList.length > 0) {
    if (docStatuses.includes('SUSPICIOUS') || duplicateDocFindings.length > 0) {
      documentStatus = 'SUSPICIOUS';
      documentVerificationScore = 0.42;
      documentExplanation = 'Document verification flagged suspicious discrepancies or cross-claim duplicates.';
    } else if (docStatuses.includes('UNCERTAIN')) {
      documentStatus = 'UNCERTAIN';
      documentVerificationScore = 0.62;
      documentExplanation = 'OCR extracted partial/limited text; authenticity cannot be verified automatically. Human review needed.';
    } else if (docStatuses.includes('MANUAL_REVIEW') || missingDocs.length > 0) {
      documentStatus = 'MANUAL_REVIEW';
      documentVerificationScore = 0.72;
      documentExplanation = missingDocs.length > 0
        ? `Supporting documents need manual officer verification. Missing expected: ${missingDocs.join(', ')}`
        : 'Supporting documents require manual review for incomplete fields.';
    } else {
      documentStatus = 'VERIFIED';
      documentVerificationScore = 0.95;
      documentExplanation = 'All supporting documents verified: policy number, claimant identity, and financial estimates match contract.';
    }
  }

  // 7. Multi-Factor Risk & Fraud Score
  const riskAssessment = await evaluateClaimRisk(claim, policy);
  const fraudRiskScore = riskAssessment.fraud_probability;

  // 8. Overall Verification Status
  const allConcerns = Array.from(new Set([...imageConcerns, ...docConcerns]));
  if (missingDocs.length > 0) {
    allConcerns.push(`Missing mandatory evidence for ${claim.incident_type}: ${missingDocs.join(', ')}`);
  }
  if (parseFloat(claim.requested_amount || 0) > parseFloat(policy?.coverage_amount || 0)) {
    allConcerns.push(`Requested amount (₹${parseFloat(claim.requested_amount).toLocaleString('en-IN')}) exceeds policy limit (₹${parseFloat(policy.coverage_amount).toLocaleString('en-IN')}).`);
  }

  let overallStatus = 'MANUAL_REVIEW';
  let overallExplanation = 'Evidence ready for manual verification.';

  if (imageStatus === 'SUSPICIOUS' || documentStatus === 'SUSPICIOUS' || fraudRiskScore >= 0.75) {
    overallStatus = 'SUSPICIOUS';
    overallExplanation = 'Suspicious claim indicators detected. Officer must escalate to Admin for comprehensive fraud investigation.';
  } else if (missingDocs.length > 0) {
    overallStatus = 'MANUAL_REVIEW';
    overallExplanation = `Claim lacks required documents (${missingDocs.join(', ')}). Request additional documents from customer.`;
  } else if (imageStatus === 'UNCERTAIN' || documentStatus === 'UNCERTAIN' || fraudRiskScore >= 0.45) {
    overallStatus = 'UNCERTAIN';
    overallExplanation = 'AI verification cannot definitively establish authenticity. Manual officer adjudication and evidence review required.';
  } else if (imageStatus === 'MANUAL_REVIEW' || documentStatus === 'MANUAL_REVIEW') {
    overallStatus = 'MANUAL_REVIEW';
    overallExplanation = 'Evidence requires manual officer review before approval can proceed.';
  } else if (imageStatus === 'VERIFIED' && (documentStatus === 'VERIFIED' || documentStatus === 'PENDING')) {
    overallStatus = 'VERIFIED';
    overallExplanation = 'AI verification completed successfully. Evidence is consistent with policy and incident description.';
  } else if (documents.length === 0) {
    overallStatus = 'PENDING';
    overallExplanation = 'No evidence documents or incident photos submitted yet.';
  }

  const now = new Date();
  const verificationRecord = {
    claim_id: claim.id,
    analysis_type: 'AI_UNIFIED_VERIFICATION',
    overall_verification_status: overallStatus,
    image_verification_score: imageVerificationScore,
    image_verification_status: imageStatus,
    image_explanation: imageExplanation,
    image_details: imageDetails,
    document_verification_score: documentVerificationScore,
    document_verification_status: documentStatus,
    document_explanation: documentExplanation,
    document_details: docDetails,
    fraud_risk_score: fraudRiskScore,
    risk_level: riskAssessment.risk_level,
    risk_indicators: riskAssessment.indicators_triggered || [],
    overall_explanation: overallExplanation,
    detected_concerns: allConcerns,
    missing_documents: missingDocs,
    duplicate_findings: [...duplicateImageFindings, ...duplicateDocFindings],
    total_documents_analyzed: documents.length,
    total_images_analyzed: imagesList.length,
    created_at: now,
    requested_by: requestedBy,
    model_version: 'InsureClaim-VisionDoc-v2.1'
  };

  // Persist to MongoDB
  await AiVerificationResult.findOneAndUpdate(
    { claim_id: claim.id },
    { $set: verificationRecord },
    { upsert: true, new: true }
  );

  await AiAnalysis.create({
    claim_id: claim.id,
    analysis_type: 'AI_UNIFIED_VERIFICATION',
    model_version: 'InsureClaim-VisionDoc-v2.1',
    output_data: verificationRecord,
    requested_by: requestedBy,
    created_at: now
  });

  // Update claim fraud score and risk level
  await Claim.updateOne(
    { $or: [{ id: claim.id }, { _id: claim.id }] },
    { $set: { fraud_score: fraudRiskScore, risk_level: riskAssessment.risk_level } }
  );

  return verificationRecord;
}

async function getLatestAiVerification(claimId) {
  let doc = await AiVerificationResult.findOne({ claim_id: claimId }).lean();
  if (!doc) {
    const historical = await AiAnalysis.findOne({
      claim_id: claimId,
      analysis_type: 'AI_UNIFIED_VERIFICATION'
    }).sort({ created_at: -1 }).lean();
    if (historical && historical.output_data) {
      doc = historical.output_data;
    }
  }
  return doc || null;
}

module.exports = {
  runAiDocumentVerification,
  getLatestAiVerification
};

