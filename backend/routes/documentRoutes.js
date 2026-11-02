const express = require('express');
const router = express.Router();
const documentController = require('../controllers/documentController');
const { authenticate, requireOfficer } = require('../middleware/auth');

router.get('/:doc_id/file', authenticate, documentController.getDocumentFile);
router.post('/:doc_id/verify', authenticate, requireOfficer, documentController.verifyDocument);
router.post('/:doc_id/reject', authenticate, requireOfficer, documentController.rejectDocument);
router.delete('/:doc_id', authenticate, documentController.deleteDocument);

module.exports = router;

