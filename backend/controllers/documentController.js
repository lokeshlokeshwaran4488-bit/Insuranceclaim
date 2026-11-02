const path = require('path');
const fs = require('fs');
const Claim = require('../models/Claim');
const ClaimDocument = require('../models/ClaimDocument');
const ClaimTimeline = require('../models/ClaimTimeline');
const DocumentRequest = require('../models/DocumentRequest');
const { calculateContentHash, deleteUploadFile, resolveFilePath } = require('../utils/fileUtils');

const DOCUMENT_CATEGORIES = [
  'IDENTITY_PROOF', 'POLICY_DOCUMENT', 'FIR', 'HOSPITAL_BILL',
  'MEDICAL_REPORT', 'VEHICLE_REGISTRATION', 'DRIVING_LICENCE',
  'DAMAGE_PHOTO', 'REPAIR_ESTIMATE', 'OTHER'
];

async function uploadDocument(req, res, next) {
  try {
    const claimId = req.params.claim_id;
    const documentCategory = req.body.document_category;

    if (!req.file) {
      return res.status(400).json({ detail: 'No file uploaded' });
    }

    if (!documentCategory || !DOCUMENT_CATEGORIES.includes(documentCategory)) {
      return res.status(400).json({
        detail: `Invalid document category. Allowed: ${DOCUMENT_CATEGORIES.join(', ')}`
      });
    }

    const claim = await Claim.findOne({ $or: [{ id: claimId }, { _id: claimId }] });
    if (!claim) {
      deleteUploadFile(req.file.path);
      return res.status(404).json({ detail: 'Claim not found' });
    }

    if (req.user.role === 'CUSTOMER' && claim.customer_id !== req.user.id) {
      deleteUploadFile(req.file.path);
      return res.status(403).json({ detail: 'Access denied' });
    }

    const allowedStatuses = [
      'DRAFT', 'SUBMITTED', 'DOCUMENTS_PENDING',
      'ADDITIONAL_DOCUMENTS_REQUIRED', 'UNDER_OFFICER_REVIEW'
    ];
    if (!allowedStatuses.includes(claim.status)) {
      deleteUploadFile(req.file.path);
      return res.status(400).json({
        detail: `Cannot upload documents to a claim in '${claim.status}' status`
      });
    }

    const contentHash = await calculateContentHash(req.file.path);

    const docRecord = new ClaimDocument({
      claim_id: claim.id,
      customer_id: req.user.id,
      filename: req.file.filename,
      original_filename: req.file.originalname,
      document_category: documentCategory,
      file_path: req.file.path,
      file_size: req.file.size,
      mime_type: req.file.mimetype || 'application/octet-stream',
      content_hash: contentHash,
      status: 'UPLOADED',
      upload_timestamp: new Date()
    });

    await docRecord.save();

    // If claim was waiting for documents, transition to DOCUMENTS_RECEIVED
    if (['ADDITIONAL_DOCUMENTS_REQUIRED', 'DOCUMENTS_PENDING'].includes(claim.status)) {
      claim.status = 'DOCUMENTS_RECEIVED';
      await claim.save();

      await ClaimTimeline.create({
        claim_id: claim.id,
        status: 'DOCUMENTS_RECEIVED',
        description: `Supporting document '${req.file.originalname}' uploaded by customer.`,
        created_by: req.user.id
      });

      await DocumentRequest.updateMany(
        { claim_id: claim.id, is_fulfilled: false },
        { $set: { is_fulfilled: true, fulfilled_at: new Date() } }
      );
    }

    return res.status(201).json(docRecord.toJSON());
  } catch (err) {
    if (req.file) deleteUploadFile(req.file.path);
    next(err);
  }
}

async function getDocumentFile(req, res, next) {
  try {
    const docId = req.params.doc_id;
    const doc = await ClaimDocument.findOne({
      $or: [{ id: docId }, { _id: docId }]
    });

    if (!doc) {
      return res.status(404).json({ detail: 'Document not found' });
    }

    if (req.user.role === 'CUSTOMER' && doc.customer_id !== req.user.id) {
      return res.status(403).json({ detail: 'Access denied' });
    }

    const realPath = resolveFilePath(doc.file_path);
    if (!fs.existsSync(realPath)) {
      return res.status(404).json({ detail: 'File not found on storage' });
    }

    res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${doc.original_filename}"`);
    return res.sendFile(path.resolve(realPath));
  } catch (err) {
    next(err);
  }
}

async function listDocuments(req, res, next) {
  try {
    const claimId = req.params.claim_id;
    const claim = await Claim.findOne({ $or: [{ id: claimId }, { _id: claimId }] });
    if (!claim) {
      return res.status(404).json({ detail: 'Claim not found' });
    }

    if (req.user.role === 'CUSTOMER' && claim.customer_id !== req.user.id) {
      return res.status(403).json({ detail: 'Access denied' });
    }

    const docs = await ClaimDocument.find({ claim_id: claim.id }).sort({ upload_timestamp: -1 });
    return res.json({
      documents: docs.map(d => d.toJSON()),
      total: docs.length
    });
  } catch (err) {
    next(err);
  }
}

async function verifyDocument(req, res, next) {
  try {
    const doc = await ClaimDocument.findOneAndUpdate(
      { $or: [{ id: req.params.doc_id }, { _id: req.params.doc_id }] },
      {
        $set: {
          status: 'VERIFIED',
          verified_by: req.user.id,
          verified_at: new Date()
        }
      },
      { new: true }
    );

    if (!doc) return res.status(404).json({ detail: 'Document not found' });
    return res.json(doc.toJSON());
  } catch (err) {
    next(err);
  }
}

async function rejectDocument(req, res, next) {
  try {
    const { rejection_reason } = req.body;
    const doc = await ClaimDocument.findOneAndUpdate(
      { $or: [{ id: req.params.doc_id }, { _id: req.params.doc_id }] },
      {
        $set: {
          status: 'REJECTED',
          rejection_reason: rejection_reason || 'Document does not satisfy requirements',
          verified_by: req.user.id,
          verified_at: new Date()
        }
      },
      { new: true }
    );

    if (!doc) return res.status(404).json({ detail: 'Document not found' });
    return res.json(doc.toJSON());
  } catch (err) {
    next(err);
  }
}

async function deleteDocument(req, res, next) {
  try {
    const doc = await ClaimDocument.findOne({
      $or: [{ id: req.params.doc_id }, { _id: req.params.doc_id }]
    });

    if (!doc) return res.status(404).json({ detail: 'Document not found' });

    if (req.user.role === 'CUSTOMER' && doc.customer_id !== req.user.id) {
      return res.status(403).json({ detail: 'Access denied' });
    }

    deleteUploadFile(doc.file_path);
    await ClaimDocument.deleteOne({ _id: doc._id });

    return res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = {
  uploadDocument,
  getDocumentFile,
  listDocuments,
  verifyDocument,
  rejectDocument,
  deleteDocument
};

