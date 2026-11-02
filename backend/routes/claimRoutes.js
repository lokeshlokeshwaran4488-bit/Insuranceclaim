const express = require('express');
const router = express.Router();
const claimController = require('../controllers/claimController');
const documentController = require('../controllers/documentController');
const { authenticate, requireAdmin, requireOfficer } = require('../middleware/auth');
const upload = require('../middleware/upload');

// Claim CRUD & lifecycle
router.post('/', authenticate, claimController.createClaim);
router.get('/', authenticate, claimController.listClaims);
router.get('/:claim_id', authenticate, claimController.getClaim);
router.put('/:claim_id', authenticate, claimController.updateClaim);
router.delete('/:claim_id', authenticate, claimController.deleteClaim);
router.post('/:claim_id/submit', authenticate, claimController.submitClaim);
router.get('/:claim_id/timeline', authenticate, claimController.getTimeline);

// Officer & Admin assignment / review
router.post('/:claim_id/assign', authenticate, requireAdmin, claimController.assignOfficer);
router.post('/:claim_id/start-review', authenticate, requireOfficer, claimController.startReview);
router.post('/:claim_id/request-documents', authenticate, requireOfficer, claimController.requestDocuments);
router.get('/:claim_id/document-requests', authenticate, claimController.getDocumentRequests);
router.post('/:claim_id/notes', authenticate, requireOfficer, claimController.addClaimNote);
router.get('/:claim_id/reviews', authenticate, requireOfficer, claimController.getClaimReviews);
router.post('/:claim_id/recommend-approval', authenticate, requireOfficer, claimController.recommendApproval);
router.post('/:claim_id/recommend-rejection', authenticate, requireOfficer, claimController.recommendRejection);
router.post('/:claim_id/escalate', authenticate, requireOfficer, claimController.escalateClaim);
router.post('/:claim_id/mark-manual-review', authenticate, requireOfficer, claimController.markManualReview);

// Admin clarification & decisions
router.post('/:claim_id/request-clarification', authenticate, requireOfficer, claimController.requestClarification);
router.post('/:claim_id/respond-clarification', authenticate, requireAdmin, claimController.respondClarification);
router.post('/:claim_id/admin-decision', authenticate, requireAdmin, claimController.adminDecision);
router.post('/:claim_id/approve', authenticate, requireAdmin, claimController.approveClaim);
router.post('/:claim_id/reject', authenticate, requireAdmin, claimController.rejectClaim);

// AI Verification & Scoring
router.post('/:claim_id/verify-ai', authenticate, requireOfficer, claimController.verifyAi);
router.post('/:claim_id/run-ai-verification', authenticate, requireOfficer, claimController.verifyAi);
router.get('/:claim_id/ai-verification', authenticate, requireOfficer, claimController.getAiVerification);
router.get('/:claim_id/ai-analysis', authenticate, requireOfficer, claimController.getAiVerification);
router.get('/:claim_id/fraud-score', authenticate, requireOfficer, claimController.getFraudScore);

// Document upload & listing under claim
router.post('/:claim_id/documents', authenticate, upload.single('file'), documentController.uploadDocument);
router.get('/:claim_id/documents', authenticate, documentController.listDocuments);

module.exports = router;

