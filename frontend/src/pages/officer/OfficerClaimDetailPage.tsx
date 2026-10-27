import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Shield, Sparkles, AlertTriangle, CheckCircle, XCircle,
  FileText, Image as ImageIcon, Download, Check, AlertCircle, Clock,
  MessageSquare, ChevronRight, Info, AlertOctagon, CornerDownLeft,
  Lock, RefreshCw, Send, CheckSquare, Square
} from 'lucide-react';
import { claimService } from '../../services/claimService';
import { documentService } from '../../services/documentService';
import { useAuth } from '../../context/AuthContext';
import type {
  Claim, ClaimTimeline, ClaimDocument, DocumentRequest,
  ClaimReview, AiVerificationResult
} from '../../types';
import ClaimTimelineComponent from '../../components/claim/ClaimTimeline';
import { ClaimStatusBadge } from '../../components/common/StatusBadge';
import {
  formatCurrency, formatDate, formatDateTime,
  getFraudColor, getRiskConfig, getVerificationStatusConfig
} from '../../utils/formatters';
import toast from 'react-hot-toast';

const OfficerClaimDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [claim, setClaim] = useState<Claim | null>(null);
  const [timeline, setTimeline] = useState<ClaimTimeline[]>([]);
  const [documents, setDocuments] = useState<ClaimDocument[]>([]);
  const [docRequests, setDocRequests] = useState<DocumentRequest[]>([]);
  const [reviews, setReviews] = useState<ClaimReview[]>([]);
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);
  const [riskAssessment, setRiskAssessment] = useState<any>(null);
  const [aiVerification, setAiVerification] = useState<AiVerificationResult | null>(null);
  const [runningAi, setRunningAi] = useState<boolean>(false);
  const [runningVerification, setRunningVerification] = useState<boolean>(false);
  const [recalculatingRisk, setRecalculatingRisk] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  // Modals & Action States
  const [showApproveModal, setShowApproveModal] = useState<boolean>(false);
  const [showRejectModal, setShowRejectModal] = useState<boolean>(false);
  const [showDocRequestModal, setShowDocRequestModal] = useState<boolean>(false);
  const [showNoteModal, setShowNoteModal] = useState<boolean>(false);
  const [showEscalateModal, setShowEscalateModal] = useState<boolean>(false);
  const [showManualReviewModal, setShowManualReviewModal] = useState<boolean>(false);
  const [showAdminDecisionModal, setShowAdminDecisionModal] = useState<boolean>(false);
  const [submittingAction, setSubmittingAction] = useState<boolean>(false);

  // Officer Form states
  const [approvedAmount, setApprovedAmount] = useState<string>('');
  const [approvalNotes, setApprovalNotes] = useState<string>('');
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [requestedDocTypes, setRequestedDocTypes] = useState<string>('REPAIR_ESTIMATE, DAMAGE_PHOTO');
  const [docRequestMessage, setDocRequestMessage] = useState<string>('');
  const [docRequestDeadline, setDocRequestDeadline] = useState<number>(7);
  const [internalNote, setInternalNote] = useState<string>('');

  // Escalation Form states
  const [escalateReason, setEscalateReason] = useState<string>('');
  const [escalateRemarks, setEscalateRemarks] = useState<string>('');
  const [escalateEvidenceRefs, setEscalateEvidenceRefs] = useState<string[]>([]);
  const [escalateAiFindings, setEscalateAiFindings] = useState<string>('');

  // Manual Review Form states
  const [manualReviewReason, setManualReviewReason] = useState<string>('');

  // Admin Decision Form states
  const [adminDecisionAction, setAdminDecisionAction] = useState<'APPROVE' | 'REJECT' | 'RETURN_TO_OFFICER'>('APPROVE');
  const [adminApprovedAmount, setAdminApprovedAmount] = useState<string>('');
  const [adminApprovalNotes, setAdminApprovalNotes] = useState<string>('');
  const [adminRejectionReason, setAdminRejectionReason] = useState<string>('');
  const [adminReturnInstructions, setAdminReturnInstructions] = useState<string>('');

  const fetchClaimData = async () => {
    if (!id) return;
    try {
      const [claimData, timelineData, docsData, requestsData, reviewsData, aiData, riskData, verifData] = await Promise.all([
        claimService.getClaim(id),
        claimService.getTimeline(id),
        documentService.listDocuments(id).catch(() => ({ documents: [], total: 0 })),
        claimService.getDocumentRequests(id).catch(() => []),
        claimService.getClaimReviews(id).catch(() => []),
        claimService.getAiAnalysis(id).catch(() => null),
        claimService.getFraudScore(id).catch(() => null),
        claimService.getAiVerification(id).catch(() => null),
      ]);
      setClaim(claimData);
      setTimeline(timelineData);
      setDocuments(docsData.documents);
      setDocRequests(requestsData);
      setReviews(reviewsData);
      setAiAnalysis(aiData);
      setRiskAssessment(riskData);
      setAiVerification(verifData);
      if (claimData.requested_amount) {
        setApprovedAmount(claimData.requested_amount.toString());
        setAdminApprovedAmount(claimData.requested_amount.toString());
      }
    } catch (err) {
      console.error('Failed to load claim', err);
      toast.error('Could not load claim information');
    } finally {
      setLoading(false);
    }
  };

  const handleRunAiSummary = async () => {
    if (!id) return;
    setRunningAi(true);
    try {
      const res = await claimService.runAiAssessment(id);
      setAiAnalysis(res);
      toast.success('AI Claim Summary generated and saved');
      await fetchClaimData();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to generate AI summary');
    } finally {
      setRunningAi(false);
    }
  };

  const handleRunAiVerification = async () => {
    if (!id) return;
    setRunningVerification(true);
    try {
      const res = await claimService.runAiVerification(id);
      setAiVerification(res);
      toast.success('AI Image & Document Verification completed');
      await fetchClaimData();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to run AI verification');
    } finally {
      setRunningVerification(false);
    }
  };

  const handleRecalculateRisk = async () => {
    if (!id) return;
    setRecalculatingRisk(true);
    try {
      const res = await claimService.recalculateRiskScore(id);
      setRiskAssessment(res);
      toast.success('Fraud risk indicators evaluated and updated');
      await fetchClaimData();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to evaluate fraud risk');
    } finally {
      setRecalculatingRisk(false);
    }
  };

  useEffect(() => {
    fetchClaimData();
  }, [id]);

  const handleStartReview = async () => {
    if (!id) return;
    try {
      await claimService.startReview(id);
      toast.success('Claim review formally initiated.');
      await fetchClaimData();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to start review');
    }
  };

  const handleApprove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !claim) return;
    const amount = parseFloat(approvedAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Please enter a valid positive approval amount');
      return;
    }
    if (!approvalNotes.trim()) {
      toast.error('Approval remarks are mandatory');
      return;
    }

    setSubmittingAction(true);
    try {
      await claimService.approveClaim(id, {
        approved_amount: amount,
        approval_notes: approvalNotes,
      });
      toast.success(`Claim ${claim.claim_number} successfully approved!`);
      setShowApproveModal(false);
      await fetchClaimData();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Approval failed');
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !claim) return;
    if (!rejectionReason.trim()) {
      toast.error('Rejection explanation is mandatory');
      return;
    }

    setSubmittingAction(true);
    try {
      await claimService.rejectClaim(id, {
        rejection_reason: rejectionReason,
      });
      toast.success(`Claim ${claim.claim_number} rejected.`);
      setShowRejectModal(false);
      await fetchClaimData();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Rejection failed');
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleRequestDocs = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    if (!docRequestMessage.trim()) {
      toast.error('Please provide a reason explaining why these documents are requested.');
      return;
    }
    const types = requestedDocTypes.split(',').map((t) => t.trim()).filter(Boolean);

    setSubmittingAction(true);
    try {
      await claimService.requestDocuments(id, types, docRequestMessage, docRequestDeadline);
      toast.success('Document request sent to customer dashboard.');
      setShowDocRequestModal(false);
      setDocRequestMessage('');
      await fetchClaimData();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Request failed');
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleEscalateToAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    if (!escalateReason.trim()) {
      toast.error('Mandatory escalation reason is required');
      return;
    }

    setSubmittingAction(true);
    try {
      await claimService.escalateClaim(id, {
        reason: escalateReason,
        remarks: escalateRemarks || undefined,
        evidence_references: escalateEvidenceRefs.length > 0 ? escalateEvidenceRefs : undefined,
        ai_findings: escalateAiFindings || undefined,
      });
      toast.success('Claim successfully escalated to Administrator for executive review');
      setShowEscalateModal(false);
      await fetchClaimData();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Escalation failed');
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleMarkManualReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    if (!manualReviewReason.trim()) {
      toast.error('Please specify a reason for marking manual review');
      return;
    }

    setSubmittingAction(true);
    try {
      await claimService.markManualReview(id, manualReviewReason);
      toast.success('Claim marked for manual verification');
      setShowManualReviewModal(false);
      await fetchClaimData();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Action failed');
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleAdminDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;

    let reasonStr = '';
    let amountVal: number | undefined = undefined;

    if (adminDecisionAction === 'APPROVE') {
      const amount = parseFloat(adminApprovedAmount);
      if (isNaN(amount) || amount <= 0) {
        toast.error('Please enter a valid approval amount');
        return;
      }
      if (!adminApprovalNotes.trim()) {
        toast.error('Approval justification notes are mandatory');
        return;
      }
      reasonStr = adminApprovalNotes;
      amountVal = amount;
    } else if (adminDecisionAction === 'REJECT') {
      if (!adminRejectionReason.trim()) {
        toast.error('Mandatory rejection reason is required');
        return;
      }
      reasonStr = adminRejectionReason;
    } else if (adminDecisionAction === 'RETURN_TO_OFFICER') {
      if (!adminReturnInstructions.trim()) {
        toast.error('Mandatory investigation instructions for officer are required');
        return;
      }
      reasonStr = adminReturnInstructions;
    }

    setSubmittingAction(true);
    try {
      await claimService.adminDecision(id, {
        decision: adminDecisionAction,
        reason: reasonStr,
        approved_amount: amountVal,
        instructions: adminDecisionAction === 'RETURN_TO_OFFICER' ? adminReturnInstructions : undefined,
      });
      toast.success(`Admin decision (${adminDecisionAction}) applied successfully!`);
      setShowAdminDecisionModal(false);
      await fetchClaimData();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Admin decision failed');
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !internalNote.trim()) return;

    setSubmittingAction(true);
    try {
      await claimService.addClaimNote(id, internalNote, true);
      toast.success('Internal note added.');
      setInternalNote('');
      setShowNoteModal(false);
      await fetchClaimData();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to add note');
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleVerifyDoc = async (docId: string) => {
    try {
      await documentService.verifyDocument(docId, 'Verified by claim officer');
      toast.success('Document marked as verified.');
      await fetchClaimData();
    } catch (err: any) {
      toast.error('Verification failed');
    }
  };

  const toggleEvidenceRef = (refStr: string) => {
    setEscalateEvidenceRefs((prev) =>
      prev.includes(refStr) ? prev.filter((r) => r !== refStr) : [...prev, refStr]
    );
  };

  if (loading) {
    return (
      <div className="loading-center">
        <div className="spinner" />
        <span>Loading claim review workspace...</span>
      </div>
    );
  }

  if (!claim) {
    return (
      <div className="card">
        <div className="empty-state">
          <div className="empty-state-title">Claim Not Found</div>
          <p className="empty-state-text">The requested claim could not be retrieved.</p>
        </div>
      </div>
    );
  }

  const isAdmin = user?.role === 'ADMIN';
  const isOfficer = user?.role === 'CLAIM_OFFICER';
  const isEscalated = ['ADMIN_REVIEW_REQUIRED', 'UNDER_FRAUD_REVIEW', 'NEEDS_ADMIN_CLARIFICATION'].includes(claim.status);
  const canDecide = ['SUBMITTED', 'UNDER_OFFICER_REVIEW', 'DOCUMENTS_RECEIVED', 'AI_ANALYSIS_COMPLETED', 'APPROVAL_PENDING', 'ADDITIONAL_DOCUMENTS_REQUIRED', 'UNDER_VERIFICATION'].includes(claim.status) && !isEscalated;

  const risk = claim.risk_level ? getRiskConfig(claim.risk_level) : null;
  const verifStatus = getVerificationStatusConfig(
    aiVerification?.overall_verification_status || claim.overall_verification_status
  );

  return (
    <div>
      {/* Top Header & Action Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => navigate(isAdmin ? '/admin/claims' : '/officer/claims')}
            className="btn btn-secondary btn-icon"
            title="Back to claims"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h1 className="page-title" style={{ margin: 0 }}>Review: {claim.claim_number}</h1>
              <ClaimStatusBadge status={claim.status} />
              {isEscalated && (
                <span className="badge badge-red" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <AlertOctagon size={12} /> Escalated to Admin
                </span>
              )}
            </div>
            <p className="page-subtitle" style={{ margin: '4px 0 0 0' }}>
              Customer: <strong>{claim.customer_name || 'N/A'}</strong> • Policy #{claim.policy_number || 'N/A'}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {claim.status === 'SUBMITTED' && (
            <button onClick={handleStartReview} className="btn btn-secondary">
              <Clock size={15} /> Start Review
            </button>
          )}

          <button onClick={() => setShowNoteModal(true)} className="btn btn-secondary">
            <MessageSquare size={15} /> Add Note
          </button>

          {/* ADMIN ACTION CONTROLS */}
          {isAdmin && (
            <button
              onClick={() => {
                setAdminDecisionAction('APPROVE');
                setAdminApprovedAmount(claim.requested_amount?.toString() || '');
                setShowAdminDecisionModal(true);
              }}
              className="btn btn-primary"
              style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', borderColor: '#6366f1' }}
            >
              <Shield size={15} /> Admin Decision & Review
            </button>
          )}

          {/* OFFICER CONTROLS (IF CLAIM IS ESCALATED, ACTIONS ARE LOCKED) */}
          {isOfficer && isEscalated && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 14px',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: 'var(--radius)',
                color: 'var(--danger)',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              <Lock size={14} /> Escalated to Admin — Officer Approval Locked
            </div>
          )}

          {/* OFFICER CONTROLS (ACTIVE WHEN NOT ESCALATED) */}
          {isOfficer && canDecide && (
            <>
              <button onClick={() => setShowDocRequestModal(true)} className="btn btn-secondary">
                <AlertTriangle size={15} /> Request Docs
              </button>

              <button
                onClick={() => {
                  setManualReviewReason('Image or document verification inconclusive. In-depth manual forensic inspection needed.');
                  setShowManualReviewModal(true);
                }}
                className="btn btn-secondary"
                title="Mark claim for manual verification"
              >
                <Clock size={15} /> Mark Manual Review
              </button>

              <button
                onClick={() => {
                  setEscalateReason('Multi-modal AI discrepancies or potential fraud indicators flagged during review');
                  if (aiVerification) {
                    setEscalateAiFindings(
                      `Image Score: ${aiVerification.image_verification_score !== null && aiVerification.image_verification_score !== undefined ? `${(aiVerification.image_verification_score * 100).toFixed(0)}%` : 'N/A'}, Doc Score: ${aiVerification.document_verification_score !== null && aiVerification.document_verification_score !== undefined ? `${(aiVerification.document_verification_score * 100).toFixed(0)}%` : 'N/A'}, Fraud Risk: ${aiVerification.fraud_risk_score !== undefined ? `${(aiVerification.fraud_risk_score * 100).toFixed(0)}%` : 'N/A'}. Overall: ${aiVerification.overall_verification_status}. Concerns: ${(aiVerification.detected_concerns || []).join('; ')}`
                    );
                  }
                  setShowEscalateModal(true);
                }}
                className="btn btn-warning"
                title="Escalate claim to Executive Administrator"
              >
                <AlertOctagon size={15} /> Escalate to Admin
              </button>

              <button
                onClick={() => setShowApproveModal(true)}
                className="btn btn-primary"
                style={{ background: 'var(--success)', borderColor: 'var(--success)' }}
              >
                <CheckCircle size={15} /> Approve Claim
              </button>
              <button
                onClick={() => setShowRejectModal(true)}
                className="btn btn-danger"
              >
                <XCircle size={15} /> Reject Claim
              </button>
            </>
          )}
        </div>
      </div>

      {/* Escalation Alert Banner if Claim is in Escalated State */}
      {isEscalated && (
        <div
          style={{
            padding: 16,
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 'var(--radius)',
            marginBottom: 20,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 14,
          }}
        >
          <AlertOctagon size={24} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--danger)', marginBottom: 4 }}>
              Administrative Escalation Review Active ({claim.status.replace(/_/g, ' ')})
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 8px 0', lineHeight: 1.5 }}>
              This claim has been escalated to Executive Administration for elevated review and risk audit.
              {isOfficer && ' As a Claim Officer, you cannot approve or reject this claim until an Administrator renders a verdict or returns it to you with instructions.'}
            </p>
            {claim.escalation_reason && (
              <div style={{ fontSize: 12, background: 'var(--bg-elevated)', padding: '6px 12px', borderRadius: 4, display: 'inline-block' }}>
                <strong style={{ color: 'var(--text-primary)' }}>Escalation Reason:</strong> {claim.escalation_reason}
                {claim.escalated_by_name && <span style={{ marginLeft: 8 }}>• <strong>Escalated by:</strong> {claim.escalated_by_name}</span>}
                {claim.escalated_at && <span style={{ marginLeft: 8 }}>• <strong>On:</strong> {formatDateTime(claim.escalated_at)}</span>}
              </div>
            )}
          </div>
          {isAdmin && (
            <button
              onClick={() => {
                setAdminDecisionAction('APPROVE');
                setAdminApprovedAmount(claim.requested_amount?.toString() || '');
                setShowAdminDecisionModal(true);
              }}
              className="btn btn-primary btn-sm"
              style={{ whiteSpace: 'nowrap' }}
            >
              Take Admin Decision
            </button>
          )}
        </div>
      )}

      {/* Main Grid: 2 Columns */}
      <div className="grid-3" style={{ gridTemplateColumns: '2fr 1fr', gap: 24, alignItems: 'start' }}>
        {/* Left Column: Evidence, AI & Incident Details */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Incident & Policy Overview */}
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Incident Details & Loss Assessment</div>
                <div className="card-subtitle">{claim.incident_type}</div>
              </div>
            </div>

            <div className="grid-2" style={{ marginBottom: 16 }}>
              <div style={{ padding: 12, background: 'var(--bg-elevated)', borderRadius: 'var(--radius)' }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block' }}>
                  Requested Amount
                </span>
                <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {formatCurrency(claim.requested_amount)}
                </span>
              </div>
              <div style={{ padding: 12, background: 'var(--bg-elevated)', borderRadius: 'var(--radius)' }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block' }}>
                  Approved Settlement Amount
                </span>
                <span
                  style={{
                    fontSize: 20,
                    fontWeight: 700,
                    color: claim.approved_amount ? 'var(--success)' : 'var(--text-muted)',
                  }}
                >
                  {claim.approved_amount ? formatCurrency(claim.approved_amount) : 'Not Decided'}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Incident Date: </span>
                <strong>{claim.incident_date ? formatDate(claim.incident_date) : 'N/A'} {claim.incident_time ? `at ${claim.incident_time}` : ''}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Location: </span>
                <strong>{claim.incident_location || 'Not specified'}</strong>
              </div>
              {claim.description && (
                <div style={{ marginTop: 6, padding: 12, background: 'var(--bg-surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>INCIDENT DESCRIPTION</div>
                  <p style={{ margin: 0, lineHeight: 1.5, color: 'var(--text-primary)' }}>{claim.description}</p>
                </div>
              )}
            </div>
          </div>

          {/* AI IMAGE & DOCUMENT VERIFICATION CARD */}
          <div className="card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Sparkles size={20} style={{ color: 'var(--primary-light)' }} />
                <div>
                  <div className="card-title">AI Image & Document Verification</div>
                  <div className="card-subtitle">
                    Automated multi-modal inspection • Binary duplicates • Non-definitive advisory
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  onClick={handleRunAiVerification}
                  disabled={runningVerification}
                  className="btn btn-secondary btn-sm"
                  title="Run or refresh real AI image and document verification analysis"
                >
                  <RefreshCw size={13} className={runningVerification ? 'spin' : ''} />
                  {runningVerification ? 'Verifying Files...' : 'Run AI Verification'}
                </button>
              </div>
            </div>

            {/* Advisory Transparency Banner */}
            <div
              style={{
                display: 'flex',
                gap: 10,
                padding: 12,
                background: 'rgba(59, 130, 246, 0.08)',
                border: '1px solid rgba(59, 130, 246, 0.25)',
                borderRadius: 'var(--radius)',
                marginBottom: 16,
              }}
            >
              <Info size={18} style={{ color: 'var(--primary-light)', flexShrink: 0, marginTop: 2 }} />
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                <strong style={{ color: 'var(--primary-light)', display: 'block', marginBottom: 2 }}>
                  Explainability & Non-Definitive Rule:
                </strong>
                AI verification confidence represents model certainty regarding evidence clarity and consistency. An inability to extract text or confirm authenticity does <em>not</em> denote fraud; uncertain items are designated as <code>UNCERTAIN</code> or <code>MANUAL_REVIEW</code> for human officer judgment.
              </div>
            </div>

            {/* 4 Score Indicators (Confidence vs Risk) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginBottom: 16 }}>
              {/* 1. Image Verification Score */}
              <div style={{ padding: 12, background: 'var(--bg-elevated)', borderRadius: 'var(--radius)', textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase' }}>
                  Image Score
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--primary-light)' }}>
                  {aiVerification?.image_verification_score !== undefined && aiVerification?.image_verification_score !== null
                    ? `${(aiVerification.image_verification_score * 100).toFixed(0)}%`
                    : claim.image_verification_score !== undefined && claim.image_verification_score !== null
                    ? `${(claim.image_verification_score * 100).toFixed(0)}%`
                    : 'Pending'}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                  Confidence Level
                </div>
              </div>

              {/* 2. Document Verification Score */}
              <div style={{ padding: 12, background: 'var(--bg-elevated)', borderRadius: 'var(--radius)', textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase' }}>
                  Doc Score
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#38bdf8' }}>
                  {aiVerification?.document_verification_score !== undefined && aiVerification?.document_verification_score !== null
                    ? `${(aiVerification.document_verification_score * 100).toFixed(0)}%`
                    : claim.document_verification_score !== undefined && claim.document_verification_score !== null
                    ? `${(claim.document_verification_score * 100).toFixed(0)}%`
                    : 'Pending'}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                  OCR & Data Consistency
                </div>
              </div>

              {/* 3. Fraud Risk Score */}
              <div style={{ padding: 12, background: 'var(--bg-elevated)', borderRadius: 'var(--radius)', textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase' }}>
                  Fraud Risk
                </div>
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 800,
                    color:
                      aiVerification?.fraud_risk_score !== undefined
                        ? getFraudColor(aiVerification.fraud_risk_score)
                        : claim.fraud_score !== undefined
                        ? getFraudColor(claim.fraud_score)
                        : 'var(--text-muted)',
                  }}
                >
                  {aiVerification?.fraud_risk_score !== undefined
                    ? `${(aiVerification.fraud_risk_score * 100).toFixed(0)}%`
                    : claim.fraud_score !== undefined
                    ? `${(claim.fraud_score * 100).toFixed(0)}%`
                    : 'Pending'}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                  Multi-Factor Probability
                </div>
              </div>

              {/* 4. Overall Verification Status */}
              <div style={{ padding: 12, background: 'var(--bg-elevated)', borderRadius: 'var(--radius)', textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase' }}>
                  Overall Status
                </div>
                <div style={{ marginTop: 4 }}>
                  <span
                    className={`badge ${verifStatus.className}`}
                    style={{ fontSize: 11, padding: '4px 8px', fontWeight: 700 }}
                  >
                    {verifStatus.label}
                  </span>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                  Audited Decision State
                </div>
              </div>
            </div>

            {/* AI Verification Breakdown & Findings */}
            {aiVerification ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Images Inspected Section */}
                {aiVerification.image_details && aiVerification.image_details.length > 0 && (
                  <div style={{ padding: 12, background: 'var(--bg-elevated)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <ImageIcon size={14} style={{ color: 'var(--primary-light)' }} />
                      Image Evidence Forensic Inspection ({aiVerification.image_details.length} file{aiVerification.image_details.length > 1 ? 's' : ''})
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {aiVerification.image_details.map((img, idx) => (
                        <div
                          key={idx}
                          style={{
                            padding: 10,
                            background: 'var(--bg-surface)',
                            borderRadius: 'var(--radius)',
                            border: '1px solid var(--border)',
                            fontSize: 12,
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <strong>{img.filename}</strong>
                            <span
                              className={`badge ${
                                img.status === 'VERIFIED'
                                  ? 'badge-green'
                                  : img.status === 'SUSPICIOUS'
                                  ? 'badge-red'
                                  : 'badge-yellow'
                              }`}
                              style={{ fontSize: 10 }}
                            >
                              {img.status}
                            </span>
                          </div>
                          <div style={{ display: 'flex', gap: 16, color: 'var(--text-secondary)', flexWrap: 'wrap', fontSize: 11 }}>
                            <span>Resolution: {img.resolution || 'Standard'}</span>
                            <span>Blur Index (Laplacian): {img.blur_score !== undefined ? img.blur_score.toFixed(1) : 'OK'}</span>
                            <span>Quality: {img.is_blurry ? '⚠️ High Blur Detected' : 'Clear'}</span>
                            <span>Tampering Flags: {img.manipulation_signs && img.manipulation_signs.length > 0 ? '⚠️ Detected' : 'None detected'}</span>
                          </div>
                          {img.has_duplicate && (
                            <div style={{ marginTop: 6, color: 'var(--danger)', fontWeight: 600, fontSize: 11 }}>
                              ⚠️ Exact SHA-256 duplicate found in prior claim records
                            </div>
                          )}
                          {img.damage_detected && (
                            <div style={{ marginTop: 4, color: 'var(--text-primary)', fontSize: 11 }}>
                              Damage Assessment: <strong>{img.damage_type || 'Visible damage'}</strong> • {img.relevant_to_incident ? 'Consistent with incident report' : 'Discrepancy with incident description'}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Documents Inspected Section */}
                {aiVerification.document_details && aiVerification.document_details.length > 0 && (
                  <div style={{ padding: 12, background: 'var(--bg-elevated)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <FileText size={14} style={{ color: '#38bdf8' }} />
                      Document Text Extraction & Field Consistency ({aiVerification.document_details.length} file{aiVerification.document_details.length > 1 ? 's' : ''})
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {aiVerification.document_details.map((doc, idx) => (
                        <div
                          key={idx}
                          style={{
                            padding: 10,
                            background: 'var(--bg-surface)',
                            borderRadius: 'var(--radius)',
                            border: '1px solid var(--border)',
                            fontSize: 12,
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <strong>{doc.filename}</strong>
                            <span
                              className={`badge ${
                                doc.status === 'VERIFIED'
                                  ? 'badge-green'
                                  : doc.status === 'SUSPICIOUS'
                                  ? 'badge-red'
                                  : 'badge-yellow'
                              }`}
                              style={{ fontSize: 10 }}
                            >
                              {doc.status}
                            </span>
                          </div>

                          {/* Field Matches */}
                          {doc.matches && doc.matches.length > 0 && (
                            <div style={{ fontSize: 11, color: 'var(--success)', margin: '4px 0' }}>
                              ✓ Verified Matches: {doc.matches.join(', ')}
                            </div>
                          )}

                          {doc.discrepancies && doc.discrepancies.length > 0 && (
                            <div style={{ fontSize: 11, color: 'var(--warning)', margin: '4px 0' }}>
                              ⚠️ Discrepancies: {doc.discrepancies.join(', ')}
                            </div>
                          )}

                          <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 12, marginTop: 4 }}>
                            <span>Method: {doc.ocr_method}</span>
                            <span>Characters Extracted: {doc.extracted_length}</span>
                          </div>

                          {doc.has_duplicate && (
                            <div style={{ marginTop: 4, color: 'var(--danger)', fontWeight: 600, fontSize: 11 }}>
                              ⚠️ Duplicate document content hash matches prior claim records
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Detected Concerns & Missing Documents */}
                {((aiVerification.detected_concerns && aiVerification.detected_concerns.length > 0) || (aiVerification.missing_documents && aiVerification.missing_documents.length > 0)) && (
                  <div style={{ padding: 12, background: 'rgba(245, 158, 11, 0.08)', borderRadius: 'var(--radius)', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                    {aiVerification.detected_concerns && aiVerification.detected_concerns.length > 0 && (
                      <div style={{ marginBottom: 6 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--warning)', marginBottom: 2 }}>NOTED AI CONCERNS:</div>
                        <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: 'var(--text-secondary)' }}>
                          {aiVerification.detected_concerns.map((c, i) => (
                            <li key={i}>{c}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {aiVerification.missing_documents && aiVerification.missing_documents.length > 0 && (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--warning)', marginBottom: 2 }}>RECOMMENDED DOCUMENTS TO REQUEST:</div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                          {aiVerification.missing_documents.join(', ')}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ padding: 20, textAlign: 'center', background: 'var(--bg-elevated)', borderRadius: 'var(--radius)' }}>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 12px 0' }}>
                  No automated AI multi-modal verification has been executed on this claim yet.
                </p>
                <button
                  onClick={handleRunAiVerification}
                  disabled={runningVerification}
                  className="btn btn-primary btn-sm"
                >
                  <Sparkles size={14} /> Run Initial AI Verification
                </button>
              </div>
            )}
          </div>

          {/* AI Claim Summary & Risk Indicators */}
          <div className="card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Shield size={18} style={{ color: 'var(--primary-light)' }} />
                <div>
                  <div className="card-title">Risk Scoring & Structured Summary</div>
                  <div className="card-subtitle">Transparent decision support • Fallback-resilient</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {risk && <span className={`badge ${risk.className}`}>{risk.label}</span>}
                <button
                  onClick={handleRunAiSummary}
                  disabled={runningAi}
                  className="btn btn-secondary btn-sm"
                >
                  <Sparkles size={13} />
                  {runningAi ? 'Analyzing...' : 'Run Summary'}
                </button>
                <button
                  onClick={handleRecalculateRisk}
                  disabled={recalculatingRisk}
                  className="btn btn-secondary btn-sm"
                >
                  <Shield size={13} />
                  {recalculatingRisk ? 'Scoring...' : 'Evaluate Risk'}
                </button>
              </div>
            </div>

            {/* Risk Indicators Breakdown (if evaluated) */}
            {riskAssessment?.indicators && riskAssessment.indicators.length > 0 && (
              <div style={{ marginBottom: 16, padding: 12, background: 'var(--bg-elevated)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Shield size={14} style={{ color: 'var(--primary-light)' }} />
                  Evaluated Risk Indicators ({riskAssessment.indicators.length} triggered)
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {riskAssessment.indicators.map((ind: any, i: number) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, padding: '4px 8px', background: 'var(--bg-surface)', borderRadius: 4 }}>
                      <span style={{ color: 'var(--text-secondary)' }}>• {ind.name.replace(/_/g, ' ')}: {ind.reason}</span>
                      <span className={`badge ${ind.severity === 'HIGH' ? 'badge-danger' : ind.severity === 'MEDIUM' ? 'badge-warning' : 'badge-info'}`} style={{ fontSize: 10 }}>
                        {ind.severity} (+{Math.round(ind.weight * 100)}%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* AI Summary and Extracted Findings */}
            {aiAnalysis && (
              <div style={{ padding: 14, background: 'var(--bg-elevated)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Sparkles size={14} style={{ color: 'var(--primary-light)' }} />
                    AI Claim Summary & Checklist
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-card)', padding: '2px 8px', borderRadius: 10 }}>
                    Model: {aiAnalysis.model || aiAnalysis.model_version || 'Advisory Engine'}
                  </span>
                </div>
                <p style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text-secondary)', margin: '0 0 10px 0' }}>
                  {aiAnalysis.summary || aiAnalysis.extracted_info?.summary || 'No summary text available.'}
                </p>
                {aiAnalysis.recommended_documents && aiAnalysis.recommended_documents.length > 0 && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    <strong>Recommended Documents:</strong> {aiAnalysis.recommended_documents.join(', ')}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Customer-Provided Documents & Incident Images */}
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Customer-Provided Attachments</div>
                <div className="card-subtitle">
                  {documents.length > 0 ? `${documents.length} file(s) available` : 'Optional attachments evaluation'}
                </div>
              </div>
            </div>

            {documents.length === 0 ? (
              <div
                style={{
                  padding: 24,
                  background: 'var(--bg-elevated)',
                  borderRadius: 'var(--radius)',
                  textAlign: 'center',
                }}
              >
                <div style={{ color: 'var(--text-muted)', marginBottom: 8 }}>
                  <ImageIcon size={32} style={{ margin: '0 auto', opacity: 0.5 }} />
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                  No Optional Files Provided by Customer
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 460, margin: '0 auto 16px' }}>
                  Uploads are strictly optional for customers. You can proceed with assessment based on policy terms, or click "Request Documents" above if specific invoices or reports are required.
                </p>
                <button
                  onClick={() => setShowDocRequestModal(true)}
                  className="btn btn-secondary btn-sm"
                >
                  <AlertTriangle size={14} /> Request Documents from Customer
                </button>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
                {documents.map((doc) => {
                  const isImg = doc.mime_type.startsWith('image/');
                  const downloadUrl = documentService.getDocumentFileUrl(doc.id);
                  return (
                    <div
                      key={doc.id}
                      style={{
                        padding: 12,
                        borderRadius: 'var(--radius)',
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border-color)',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div>
                        {isImg ? (
                          <div
                            style={{
                              height: 110,
                              borderRadius: 6,
                              overflow: 'hidden',
                              marginBottom: 8,
                              background: '#000',
                            }}
                          >
                            <img
                              src={downloadUrl}
                              alt={doc.original_filename}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                          </div>
                        ) : (
                          <div
                            style={{
                              height: 60,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              background: 'var(--bg-card)',
                              borderRadius: 6,
                              marginBottom: 8,
                            }}
                          >
                            <FileText size={28} style={{ color: 'var(--primary-light)' }} />
                          </div>
                        )}

                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                          title={doc.original_filename}
                        >
                          {doc.original_filename}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                          {doc.document_category} • {(doc.file_size / 1024 / 1024).toFixed(2)} MB
                        </div>
                        {doc.content_hash && (
                          <div
                            style={{
                              fontSize: 10,
                              fontFamily: 'monospace',
                              color: 'var(--text-muted)',
                              marginTop: 4,
                              background: 'var(--bg-card)',
                              padding: '2px 4px',
                              borderRadius: 4,
                              border: '1px solid var(--border)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                            title={`SHA-256 Hash: ${doc.content_hash}`}
                          >
                            SHA256: {doc.content_hash.slice(0, 8)}...{doc.content_hash.slice(-6)}
                          </div>
                        )}
                      </div>

                      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 600,
                            padding: '2px 6px',
                            borderRadius: 4,
                            background:
                              doc.status === 'VERIFIED'
                                ? 'rgba(16, 185, 129, 0.15)'
                                : 'rgba(59, 130, 246, 0.15)',
                            color: doc.status === 'VERIFIED' ? 'var(--success)' : 'var(--primary-light)',
                          }}
                        >
                          {doc.status}
                        </span>

                        <div style={{ display: 'flex', gap: 6 }}>
                          {doc.status !== 'VERIFIED' && (
                            <button
                              onClick={() => handleVerifyDoc(doc.id)}
                              className="btn btn-secondary btn-sm"
                              style={{ padding: '3px 8px', fontSize: 11 }}
                              title="Verify document"
                            >
                              <Check size={12} />
                            </button>
                          )}
                          <a
                            href={downloadUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '3px 8px', fontSize: 11 }}
                            title="Download / View"
                          >
                            <Download size={12} />
                          </a>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Internal Notes History */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">Officer & Administrative Audit Trail</div>
            </div>
            {reviews.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                No review notes or administrative actions recorded yet.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {reviews.map((r) => (
                  <div
                    key={r.id}
                    style={{
                      padding: 12,
                      background: 'var(--bg-elevated)',
                      borderRadius: 'var(--radius)',
                      fontSize: 13,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <strong style={{ fontSize: 12, color: 'var(--primary-light)' }}>
                        {r.review_type} Note
                      </strong>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {formatDateTime(r.created_at)}
                      </span>
                    </div>
                    <div style={{ color: 'var(--text-primary)' }}>{r.remarks}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Document Requests & Activity Timeline */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Document Requests Tracker */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">Document Requests</div>
            </div>
            {docRequests.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                No specific document requests issued.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {docRequests.map((req) => (
                  <div
                    key={req.id}
                    style={{
                      padding: 12,
                      background: 'var(--bg-elevated)',
                      borderRadius: 'var(--radius)',
                      borderLeft: `3px solid ${req.is_fulfilled ? 'var(--success)' : 'var(--warning)'}`,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: req.is_fulfilled ? 'var(--success)' : 'var(--warning)',
                        }}
                      >
                        {req.is_fulfilled ? 'FULFILLED' : 'PENDING CUSTOMER'}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {formatDate(req.created_at)}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
                      {req.document_types.join(', ')}
                    </div>
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>
                      {req.message}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Activity Timeline */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">Timeline Events</div>
            </div>
            <ClaimTimelineComponent timeline={timeline} />
          </div>
        </div>
      </div>

      {/* MODAL: Approve Claim */}
      {showApproveModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <h3 className="modal-title">Approve Claim Settlement</h3>
              <button onClick={() => setShowApproveModal(false)} className="modal-close">&times;</button>
            </div>
            <form onSubmit={handleApprove}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="form-group">
                  <label className="form-label required">Approved Settlement Amount (₹)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={approvedAmount}
                    onChange={(e) => setApprovedAmount(e.target.value)}
                    min="1"
                    step="100"
                    required
                  />
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                    Requested: {formatCurrency(claim.requested_amount)}
                  </span>
                </div>

                <div className="form-group">
                  <label className="form-label required">Officer Approval Remarks</label>
                  <textarea
                    className="form-textarea"
                    rows={3}
                    placeholder="Provide justification and terms of approval..."
                    value={approvalNotes}
                    onChange={(e) => setApprovalNotes(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setShowApproveModal(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ background: 'var(--success)', borderColor: 'var(--success)' }}
                  disabled={submittingAction}
                >
                  {submittingAction ? 'Approving...' : 'Confirm Approval'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Reject Claim */}
      {showRejectModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <h3 className="modal-title">Reject Insurance Claim</h3>
              <button onClick={() => setShowRejectModal(false)} className="modal-close">&times;</button>
            </div>
            <form onSubmit={handleReject}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="form-group">
                  <label className="form-label required">Mandatory Rejection Explanation</label>
                  <textarea
                    className="form-textarea"
                    rows={4}
                    placeholder="Specify exact policy clause or discrepancy leading to rejection..."
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setShowRejectModal(false)} className="btn btn-danger">
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-danger"
                  disabled={submittingAction}
                >
                  {submittingAction ? 'Rejecting...' : 'Confirm Rejection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Request Documents */}
      {showDocRequestModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h3 className="modal-title">Request Documents from Customer</h3>
              <button onClick={() => setShowDocRequestModal(false)} className="modal-close">&times;</button>
            </div>
            <form onSubmit={handleRequestDocs}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="form-group">
                  <label className="form-label required">Requested Document Categories</label>
                  <input
                    type="text"
                    className="form-input"
                    value={requestedDocTypes}
                    onChange={(e) => setRequestedDocTypes(e.target.value)}
                    placeholder="REPAIR_ESTIMATE, DAMAGE_PHOTO, FIR"
                    required
                  />
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                    Comma separated (e.g. REPAIR_ESTIMATE, HOSPITAL_BILL, FIR, DAMAGE_PHOTO)
                  </span>
                </div>

                <div className="form-group">
                  <label className="form-label required">Reason & Details for Customer</label>
                  <textarea
                    className="form-textarea"
                    rows={3}
                    placeholder="Explain clearly why this documentation is required to proceed with review..."
                    value={docRequestMessage}
                    onChange={(e) => setDocRequestMessage(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Submission Deadline (Days)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={docRequestDeadline}
                    onChange={(e) => setDocRequestDeadline(parseInt(e.target.value) || 7)}
                    min="1"
                    max="60"
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setShowDocRequestModal(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submittingAction}
                >
                  {submittingAction ? 'Sending Request...' : 'Send Request to Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Escalate to Admin */}
      {showEscalateModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertOctagon size={20} style={{ color: 'var(--warning)' }} />
                <h3 className="modal-title">Escalate Claim to Administrator</h3>
              </div>
              <button onClick={() => setShowEscalateModal(false)} className="modal-close">&times;</button>
            </div>
            <form onSubmit={handleEscalateToAdmin}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="form-group">
                  <label className="form-label required">Mandatory Escalation Reason</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="E.g., High fraud risk score, document alteration, or policy limit breach"
                    value={escalateReason}
                    onChange={(e) => setEscalateReason(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">AI Findings & Risk Summary</label>
                  <textarea
                    className="form-textarea"
                    rows={2}
                    placeholder="Summary of AI analysis and anomalies..."
                    value={escalateAiFindings}
                    onChange={(e) => setEscalateAiFindings(e.target.value)}
                  />
                </div>

                {/* Evidence References Multi-Select */}
                <div className="form-group">
                  <label className="form-label">Attached Evidence References</label>
                  {documents.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No file attachments currently uploaded.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 130, overflowY: 'auto' }}>
                      {documents.map((d) => {
                        const isSelected = escalateEvidenceRefs.includes(d.original_filename);
                        return (
                          <div
                            key={d.id}
                            onClick={() => toggleEvidenceRef(d.original_filename)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              padding: '6px 10px',
                              background: isSelected ? 'rgba(99, 102, 241, 0.12)' : 'var(--bg-elevated)',
                              border: isSelected ? '1px solid var(--primary-light)' : '1px solid var(--border)',
                              borderRadius: 4,
                              cursor: 'pointer',
                              fontSize: 12,
                            }}
                          >
                            {isSelected ? <CheckSquare size={14} style={{ color: 'var(--primary-light)' }} /> : <Square size={14} style={{ color: 'var(--text-muted)' }} />}
                            <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {d.original_filename} ({d.document_category})
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">Officer Additional Remarks</label>
                  <textarea
                    className="form-textarea"
                    rows={3}
                    placeholder="Provide specific notes and background for executive administrative review..."
                    value={escalateRemarks}
                    onChange={(e) => setEscalateRemarks(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setShowEscalateModal(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-warning"
                  disabled={submittingAction}
                >
                  {submittingAction ? 'Escalating...' : 'Confirm Escalation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Mark for Manual Verification */}
      {showManualReviewModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h3 className="modal-title">Mark Claim for Manual Verification</h3>
              <button onClick={() => setShowManualReviewModal(false)} className="modal-close">&times;</button>
            </div>
            <form onSubmit={handleMarkManualReview}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="form-group">
                  <label className="form-label required">Reason for Manual Verification</label>
                  <textarea
                    className="form-textarea"
                    rows={4}
                    placeholder="Specify why automatic verification is insufficient and what requires manual inspection..."
                    value={manualReviewReason}
                    onChange={(e) => setManualReviewReason(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setShowManualReviewModal(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submittingAction}
                >
                  {submittingAction ? 'Updating...' : 'Mark for Manual Verification'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Admin Decision & Review */}
      {showAdminDecisionModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 540 }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Shield size={20} style={{ color: 'var(--primary-light)' }} />
                <h3 className="modal-title">Executive Admin Decision</h3>
              </div>
              <button onClick={() => setShowAdminDecisionModal(false)} className="modal-close">&times;</button>
            </div>
            <form onSubmit={handleAdminDecision}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Decision Action Tabs */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setAdminDecisionAction('APPROVE')}
                    className={`btn ${adminDecisionAction === 'APPROVE' ? 'btn-primary' : 'btn-secondary'}`}
                    style={adminDecisionAction === 'APPROVE' ? { background: 'var(--success)', borderColor: 'var(--success)' } : {}}
                  >
                    <CheckCircle size={14} /> Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdminDecisionAction('REJECT')}
                    className={`btn ${adminDecisionAction === 'REJECT' ? 'btn-danger' : 'btn-secondary'}`}
                  >
                    <XCircle size={14} /> Reject
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdminDecisionAction('RETURN_TO_OFFICER')}
                    className={`btn ${adminDecisionAction === 'RETURN_TO_OFFICER' ? 'btn-warning' : 'btn-secondary'}`}
                  >
                    <CornerDownLeft size={14} /> Return to Officer
                  </button>
                </div>

                {/* Sub-forms depending on action */}
                {adminDecisionAction === 'APPROVE' && (
                  <>
                    <div className="form-group">
                      <label className="form-label required">Approved Amount (₹)</label>
                      <input
                        type="number"
                        className="form-input"
                        value={adminApprovedAmount}
                        onChange={(e) => setAdminApprovedAmount(e.target.value)}
                        min="1"
                        step="100"
                        required
                      />
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                        Requested: {formatCurrency(claim.requested_amount)}
                      </span>
                    </div>
                    <div className="form-group">
                      <label className="form-label required">Admin Approval Remarks</label>
                      <textarea
                        className="form-textarea"
                        rows={3}
                        placeholder="State administrative justification and policy terms for settlement..."
                        value={adminApprovalNotes}
                        onChange={(e) => setAdminApprovalNotes(e.target.value)}
                        required
                      />
                    </div>
                  </>
                )}

                {adminDecisionAction === 'REJECT' && (
                  <div className="form-group">
                    <label className="form-label required">Mandatory Rejection Reason</label>
                    <textarea
                      className="form-textarea"
                      rows={4}
                      placeholder="Specify fraud findings, fraudulent claims clauses, or policy violations..."
                      value={adminRejectionReason}
                      onChange={(e) => setAdminRejectionReason(e.target.value)}
                      required
                    />
                  </div>
                )}

                {adminDecisionAction === 'RETURN_TO_OFFICER' && (
                  <div className="form-group">
                    <label className="form-label required">Instructions for Claim Officer</label>
                    <textarea
                      className="form-textarea"
                      rows={4}
                      placeholder="Provide specific investigation directions, required documents, or re-inspection guidance..."
                      value={adminReturnInstructions}
                      onChange={(e) => setAdminReturnInstructions(e.target.value)}
                      required
                    />
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setShowAdminDecisionModal(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={
                    adminDecisionAction === 'APPROVE'
                      ? { background: 'var(--success)', borderColor: 'var(--success)' }
                      : adminDecisionAction === 'REJECT'
                      ? { background: 'var(--danger)', borderColor: 'var(--danger)' }
                      : { background: 'var(--warning)', borderColor: 'var(--warning)', color: '#000' }
                  }
                  disabled={submittingAction}
                >
                  {submittingAction ? 'Processing...' : `Confirm ${adminDecisionAction.replace(/_/g, ' ')}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Internal Note */}
      {showNoteModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h3 className="modal-title">Add Internal Note</h3>
              <button onClick={() => setShowNoteModal(false)} className="modal-close">&times;</button>
            </div>
            <form onSubmit={handleAddNote}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="form-group">
                  <label className="form-label required">Internal Remarks</label>
                  <textarea
                    className="form-textarea"
                    rows={4}
                    placeholder="Enter audit note visible to officers and administrators..."
                    value={internalNote}
                    onChange={(e) => setInternalNote(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setShowNoteModal(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submittingAction}
                >
                  Save Note
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default OfficerClaimDetailPage;
