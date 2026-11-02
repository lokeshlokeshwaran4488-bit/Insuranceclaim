const config = require('../config/config');

function fallbackSummary(description = '', incidentType = '', requestedAmount = 0) {
  const descLower = (description || '').toLowerCase();

  // Determine severity based on keywords
  let severity = 'MODERATE';
  if (['total loss', 'catastrophic', 'fatal', 'intensive care', 'destroyed', 'stolen', 'theft'].some(k => descLower.includes(k))) {
    severity = descLower.includes('total loss') ? 'CATASTROPHIC' : 'MAJOR';
  } else if (['scratch', 'dent', 'minor', 'superficial'].some(k => descLower.includes(k))) {
    severity = 'MINOR';
  }

  // Damage type
  let damageType = 'General Property / Vehicle Impact';
  if (descLower.includes('scratch') || descLower.includes('dent')) damageType = 'External Bodywork Damage';
  else if (descLower.includes('bumper') || descLower.includes('bonnet') || descLower.includes('radiator')) damageType = 'Frontal Impact Damage';
  else if (descLower.includes('rear') || descLower.includes('tail lamp')) damageType = 'Rear-End Impact Damage';
  else if (descLower.includes('theft') || descLower.includes('stolen')) damageType = 'Total Vehicle Theft';
  else if (descLower.includes('hospital') || descLower.includes('surgery') || descLower.includes('icu') || descLower.includes('medical')) damageType = 'Inpatient Medical Treatment';

  // Recommended documents
  const recommendedDocs = ['IDENTITY_PROOF'];
  if (incidentType.toLowerCase().includes('motor') || incidentType.toLowerCase().includes('vehicle')) {
    recommendedDocs.push('DAMAGE_PHOTO', 'REPAIR_ESTIMATE', 'VEHICLE_REGISTRATION');
  } else if (incidentType.toLowerCase().includes('medical') || incidentType.toLowerCase().includes('health')) {
    recommendedDocs.push('HOSPITAL_BILL', 'MEDICAL_REPORT');
  } else if (incidentType.toLowerCase().includes('theft')) {
    recommendedDocs.push('FIR', 'POLICY_DOCUMENT');
  } else {
    recommendedDocs.push('REPAIR_ESTIMATE', 'POLICY_DOCUMENT');
  }

  // Missing info & red flags
  const missingInfo = [];
  if (!descLower.includes('at') && !descLower.includes('near') && !descLower.includes('road') && !descLower.includes('hospital')) {
    missingInfo.push('Exact geographical location and landmark details');
  }
  if (!descLower.includes('am') && !descLower.includes('pm') && !descLower.includes(':') && !descLower.includes('morning') && !descLower.includes('evening')) {
    missingInfo.push('Precise time of occurrence');
  }

  const redFlags = [];
  if (requestedAmount > 500000 && severity === 'MINOR') {
    redFlags.push('High claim amount requested relative to minor damage description');
  }

  const result = {
    incident_summary: `Claim filed for ${incidentType}. Description states: "${description.substring(0, 200)}${description.length > 200 ? '...' : ''}". Evaluated damage level is ${severity.toLowerCase()}.`,
    damage_type: damageType,
    damage_location: 'Reported scene of incident',
    severity_assessment: severity,
    missing_information: missingInfo,
    recommended_documents: recommendedDocs,
    red_flags: redFlags,
    claim_validity_assessment: redFlags.length > 0 ? 'NEEDS_INVESTIGATION' : 'LIKELY_VALID',
    officer_notes: 'Automated advisory extraction. Verification of physical invoices and photos recommended.'
  };

  return {
    status: 'completed',
    data: result,
    model: 'heuristic-domain-extractor-v1.0'
  };
}

async function summarizeClaim(claimDescription, incidentType, requestedAmount) {
  if (!config.openaiApiKey || config.openaiApiKey.startsWith('sk-your')) {
    return fallbackSummary(claimDescription, incidentType, requestedAmount);
  }

  try {
    // Dynamic import or fetch for OpenAI
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.openaiApiKey}`
      },
      body: JSON.stringify({
        model: config.openaiModel,
        messages: [
          { role: 'system', content: 'You are an expert insurance claim analyst. Always respond with valid JSON.' },
          {
            role: 'user',
            content: `Analyze this insurance claim:\nIncident Type: ${incidentType}\nRequested Amount: ₹${requestedAmount}\nCustomer Description: ${claimDescription}\n\nReturn JSON:
{
  "incident_summary": "Professional summary",
  "damage_type": "Type of damage",
  "damage_location": "Location",
  "severity_assessment": "MINOR | MODERATE | MAJOR | CATASTROPHIC",
  "missing_information": ["Missing details"],
  "recommended_documents": ["Required documents"],
  "red_flags": ["Inconsistencies"],
  "claim_validity_assessment": "LIKELY_VALID | NEEDS_INVESTIGATION | SUSPICIOUS",
  "officer_notes": "Notes for officer"
}`
          }
        ],
        temperature: 0.2,
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error ${response.status}`);
    }

    const data = await response.json();
    const content = JSON.parse(data.choices[0].message.content);
    return {
      status: 'completed',
      data: content,
      model: config.openaiModel
    };
  } catch (err) {
    console.warn(`[GPTService] OpenAI error (${err.message}). Using fallback domain summary.`);
    return fallbackSummary(claimDescription, incidentType, requestedAmount);
  }
}

async function extractDocumentInfo(documentText, documentType) {
  if (!config.openaiApiKey || config.openaiApiKey.startsWith('sk-your')) {
    return {
      status: 'skipped',
      reason: 'OpenAI API not configured',
      data: {
        document_type: documentType,
        text_length: (documentText || '').length
      }
    };
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.openaiApiKey}`
      },
      body: JSON.stringify({
        model: config.openaiModel,
        messages: [
          { role: 'system', content: 'Extract structured information from insurance documents. Return valid JSON.' },
          { role: 'user', content: `Extract fields from ${documentType} document:\n${(documentText || '').slice(0, 3000)}` }
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) throw new Error(`OpenAI error: ${response.status}`);
    const data = await response.json();
    return {
      status: 'completed',
      data: JSON.parse(data.choices[0].message.content),
      model: config.openaiModel
    };
  } catch (err) {
    return {
      status: 'failed',
      error: err.message,
      data: {}
    };
  }
}

function explainClaimStatus(status, claimNumber) {
  const explanations = {
    DRAFT: 'Your claim has been saved as a draft. Please review and submit it when ready.',
    SUBMITTED: 'Your claim has been submitted and is being reviewed by our team.',
    DOCUMENTS_PENDING: 'We need additional documents to process your claim. Please upload the required documents.',
    UNDER_OFFICER_REVIEW: 'A claim officer is currently reviewing your claim. We will update you shortly.',
    APPROVAL_PENDING: 'Your claim review is complete and awaiting final approval decision.',
    APPROVED: 'Congratulations! Your claim has been approved. Settlement processing will begin shortly.',
    REJECTED: 'Your claim has been reviewed and unfortunately could not be approved at this time.',
    SETTLEMENT_PENDING: 'Your claim is approved and the settlement payment is being prepared.',
    SETTLED: 'Payment has been processed for your claim. The settlement is complete.'
  };

  return explanations[status] || `Your claim ${claimNumber} is currently in '${status}' status.`;
}

module.exports = {
  summarizeClaim,
  extractDocumentInfo,
  explainClaimStatus,
  fallbackSummary
};

