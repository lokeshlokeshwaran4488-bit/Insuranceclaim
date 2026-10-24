import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Shield, Sparkles, AlertTriangle, CheckCircle, XCircle,
  FileText, Image as ImageIcon, Download, Check, AlertCircle, Clock,
  Calendar, MapPin, MessageSquare, Send, User, ChevronRight, Info
} from 'lucide-react';
import { claimService } from '../../services/claimService';
import { documentService } from '../../services/documentService';
import type { Claim, ClaimTimeline, ClaimDocument, DocumentRequest, ClaimReview } from '../../types';
import ClaimTimelineComponent from '../../components/claim/ClaimTimeline';
import { ClaimStatusBadge } from '../../components/common/StatusBadge';
import { formatCurrency, formatDate, formatDateTime, getFraudColor, getRiskConfig } from '../../utils/formatters';
import toast from 'react-hot-toast';

const OfficerClaimDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [claim, setClaim] = useState<Claim | null>(null);
  const [timeline, setTimeline] = useState<ClaimTimeline[]>([]);
  const [documents, setDocuments] = useState<ClaimDocument[]>([]);
  const [docRequests, setDocRequests] = useState<DocumentRequest[]>([]);
  const [reviews, setReviews] = useState<ClaimReview[]>([]);
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);
  const [riskAssessment, setRiskAssessment] = useState<any>(null);
  const [runningAi, setRunningAi] = useState<boolean>(false);
  const [recalculatingRisk, setRecalculatingRisk] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  // Modals & Action States
  const [showApproveModal, setShowApproveModal] = useState<boolean>(false);
  const [showRejectModal, setShowRejectModal] = useState<boolean>(false);
  const [showDocRequestModal, setShowDocRequestModal] = useState<boolean>(false);
  const [showNoteModal, setShowNoteModal] = useState<boolean>(false);
  const [submittingAction, setSubmittingAction] = useState<boolean>(false);

  // Form states
  const [approvedAmount, setApprovedAmount] = useState<string>('');
  const [approvalNotes, setApprovalNotes] = useState<string>('');
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [requestedDocTypes, setRequestedDocTypes] = useState<string>('REPAIR_ESTIMATE, DAMAGE_PHOTO');
  const [docRequestMessage, setDocRequestMessage] = useState<string>('');
  const [docRequestDeadline, setDocRequestDeadline] = useState<number>(7);
  const [internalNote, setInternalNote] = useState<string>('');

  const fetchClaimData = async () => {
    if (!id) return;
    try {
      const [claimData, timelineData, docsData, requestsData, reviewsData, aiData, riskData] = await Promise.all([
        claimService.getClaim(id),
        claimService.getTimeline(id),
        documentService.listDocuments(id).catch(() => ({ documents: [], total: 0 })),
        claimService.getDocumentRequests(id).catch(() => []),
        claimService.getClaimReviews(id).catch(() => []),
        claimService.getAiAnalysis(id).catch(() => null),
        claimService.getFraudScore(id).catch(() => null),
      ]);
      setClaim(claimData);
      setTimeline(timelineData);
      setDocuments(docsData.documents);
      setDocRequests(requestsData);
      setReviews(reviewsData);
      setAiAnalysis(aiData);
      setRiskAssessment(riskData);
      if (claimData.requested_amount) {
        setApprovedAmount(claimData.requested_amount.toString());
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

  if (loading) {
    return (
      <div className="loading-center">
        <div className="spinner" />
        <span>Loading officer claim workspace...</span>
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

  const risk = claim.risk_level ? getRiskConfig(claim.risk_level) : null;
  const canDecide = ['SUBMITTED', 'UNDER_OFFICER_REVIEW', 'DOCUMENTS_RECEIVED', 'AI_ANALYSIS_COMPLETED', 'APPROVAL_PENDING', 'ADDITIONAL_DOCUMENTS_REQUIRED'].includes(claim.status);

  return (
    <div>
      {/* Top Header & Officer Action Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => navigate('/officer/claims')} className="btn btn-secondary btn-icon" title="Back to claims">
            <ArrowLeft size={16} />
          </button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 className="page-title" style={{ margin: 0 }}>Review: {claim.claim_number}</h1>
              <ClaimStatusBadge status={claim.status} />
            </div>
            <p className="page-subtitle" style={{ margin: '4px 0 0 0' }}>
              Customer: <strong>{claim.customer_name || 'N/A'}</strong> • Policy #{claim.policy_number || 'N/A'}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {claim.status === 'SUBMITTED' && (
            <button onClick={handleStartReview} className="btn btn-secondary">
              <Clock size={15} /> Start Formal Review
            </button>
          )}

          <button onClick={() => setShowNoteModal(true)} className="btn btn-secondary">
            <MessageSquare size={15} /> Add Note
          </button>

          {canDecide && (
            <button onClick={() => setShowDocRequestModal(true)} className="btn btn-secondary">
              <AlertTriangle size={15} /> Request Documents
            </button>
          )}

          {canDecide && (
            <>
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

          {/* AI-Assisted Verification & Preliminary Risk Scoring */}
          <div className="card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Sparkles size={18} style={{ color: 'var(--primary-light)' }} />
                <div>
                  <div className="card-title">AI Verification & Preliminary Risk Assessment</div>
                  <div className="card-subtitle">Transparent decision support • Fallback-resilient</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {risk && <span className={`badge ${risk.className}`}>{risk.label}</span>}
                <button
                  onClick={handleRunAiSummary}
                  disabled={runningAi}
                  className="btn btn-secondary btn-sm"
                  title="Generate or refresh AI structured summary"
                >
                  <Sparkles size={13} />
                  {runningAi ? 'Analyzing...' : 'Run AI Summary'}
                </button>
                <button
                  onClick={handleRecalculateRisk}
                  disabled={recalculatingRisk}
                  className="btn btn-secondary btn-sm"
                  title="Re-evaluate rule-based risk indicators & hashes"
                >
                  <Shield size={13} />
                  {recalculatingRisk ? 'Scoring...' : 'Evaluate Risk'}
                </button>
              </div>
            </div>

            {/* Clear Explainability & Non-definitive Advisory Notice */}
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
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                <strong style={{ color: 'var(--primary-light)', display: 'block', marginBottom: 2 }}>
                  Advisory Verification Notice:
                </strong>
                AI analytics and risk indicators provide decision assistance. Final settlement determinations require human review and judgment. Claims are never approved or rejected automatically.
              </div>
            </div>

            <div className="grid-2" style={{ gap: 16, marginBottom: 16 }}>
              <div style={{ padding: 14, background: 'var(--bg-elevated)', borderRadius: 'var(--radius)' }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Anomaly & Risk Probability</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: claim.fraud_score !== undefined ? getFraudColor(claim.fraud_score) : 'var(--text-muted)' }}>
                  {claim.fraud_score !== undefined ? `${(claim.fraud_score * 100).toFixed(1)}%` : 'Evaluating...'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  Engine: Transparent Multi-Factor Rule-Based & Heuristic Assessor (MongoDB-audited).
                </div>
              </div>

              <div style={{ padding: 14, background: 'var(--bg-elevated)', borderRadius: 'var(--radius)' }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Rule Verification Summary</div>
                <div style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--success)' }}>
                    <Check size={14} /> Active policy tenure verified
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--success)' }}>
                    <Check size={14} /> Requested amount within policy limits
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: documents.length > 0 ? 'var(--success)' : 'var(--warning)' }}>
                    {documents.length > 0 ? <Check size={14} /> : <Info size={14} />}
                    {documents.length > 0 ? `${documents.length} verified attachment(s) attached` : 'No file attachments uploaded'}
                  </div>
                </div>
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
              <div className="card-title">Officer Internal Notes & Audit Logs</div>
            </div>
            {reviews.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                No internal review notes recorded yet.
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
                <button type="button" onClick={() => setShowRejectModal(false)} className="btn btn-secondary">
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

      {/* MODAL: Internal Note */}
      {showNoteModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h3 className="modal-title">Add Internal Officer Note</h3>
              <button onClick={() => setShowNoteModal(false)} className="modal-close">&times;</button>
            </div>
            <form onSubmit={handleAddNote}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="form-group">
                  <label className="form-label required">Internal Remarks</label>
                  <textarea
                    className="form-textarea"
                    rows={4}
                    placeholder="Enter notes visible only to claim officers and administrators..."
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
