import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, FileText, Shield, Sparkles, Upload, CheckCircle,
  AlertTriangle, Clock, MapPin, Calendar, CreditCard, Download,
  ExternalLink, Eye, AlertCircle, Check, Info, FileSpreadsheet, Image as ImageIcon
} from 'lucide-react';
import { claimService } from '../../services/claimService';
import { documentService } from '../../services/documentService';
import type { Claim, ClaimTimeline, ClaimDocument, DocumentRequest, ClaimReview } from '../../types';
import ClaimTimelineComponent from '../../components/claim/ClaimTimeline';
import { ClaimStatusBadge } from '../../components/common/StatusBadge';
import { formatCurrency, formatDate, formatDateTime, getFraudColor, getRiskConfig } from '../../utils/formatters';
import toast from 'react-hot-toast';

// 7-Stage Customer Journey Stepper Definitions
const JOURNEY_STEPS = [
  { id: 1, label: 'Submitted', key: 'SUBMITTED' },
  { id: 2, label: 'Initial Review', key: 'INITIAL_REVIEW' },
  { id: 3, label: 'Verification', key: 'UNDER_VERIFICATION' },
  { id: 4, label: 'Info Requested', key: 'DOCS_REQUESTED' },
  { id: 5, label: 'Decision', key: 'DECISION' },
  { id: 6, label: 'Settlement', key: 'SETTLEMENT' },
  { id: 7, label: 'Payment Done', key: 'PAID' },
];

const getStepState = (claimStatus: string, stepIndex: number, hasDocRequest: boolean, paymentStatus?: string) => {
  // Returns 'done', 'active', 'rejected', 'pending', or 'skipped'
  const isRejected = claimStatus === 'REJECTED';
  const isApproved = ['APPROVED', 'SETTLEMENT_PENDING', 'SETTLEMENT_PROCESSING', 'SETTLED', 'CLOSED'].includes(claimStatus);
  const isPaid = paymentStatus === 'COMPLETED' || claimStatus === 'SETTLED' || claimStatus === 'CLOSED';

  switch (stepIndex) {
    case 1: // Submitted
      return 'done';

    case 2: // Initial Review
      if (claimStatus === 'DRAFT' || claimStatus === 'SUBMITTED') return 'active';
      return 'done';

    case 3: // Verification
      if (['DOCUMENTS_PENDING', 'DOCUMENTS_RECEIVED', 'UNDER_VERIFICATION', 'AI_ANALYSIS_COMPLETED'].includes(claimStatus)) {
        return 'active';
      }
      if (claimStatus === 'UNDER_OFFICER_REVIEW' || isApproved || isRejected || hasDocRequest) return 'done';
      return 'pending';

    case 4: // Info Requested (Conditional)
      if (claimStatus === 'ADDITIONAL_DOCUMENTS_REQUIRED') return 'active';
      if (hasDocRequest) return 'done';
      return 'skipped';

    case 5: // Decision
      if (isRejected) return 'rejected';
      if (isApproved) return 'done';
      if (['UNDER_OFFICER_REVIEW', 'APPROVAL_PENDING', 'UNDER_FRAUD_REVIEW', 'ADMIN_REVIEW_REQUIRED', 'NEEDS_ADMIN_CLARIFICATION'].includes(claimStatus)) return 'active';
      return 'pending';

    case 6: // Settlement Processing
      if (isRejected) return 'pending';
      if (isPaid) return 'done';
      if (['APPROVED', 'SETTLEMENT_PENDING', 'SETTLEMENT_PROCESSING'].includes(claimStatus)) return 'active';
      return 'pending';

    case 7: // Payment Completed
      if (isPaid) return 'done';
      return 'pending';

    default:
      return 'pending';
  }
};

const ClaimDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [claim, setClaim] = useState<Claim | null>(null);
  const [timeline, setTimeline] = useState<ClaimTimeline[]>([]);
  const [documents, setDocuments] = useState<ClaimDocument[]>([]);
  const [docRequests, setDocRequests] = useState<DocumentRequest[]>([]);
  const [reviews, setReviews] = useState<ClaimReview[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Additional document upload state for customer
  const [uploadingDoc, setUploadingDoc] = useState<boolean>(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('REPAIR_ESTIMATE');

  const fetchDetails = async () => {
    if (!id) return;
    try {
      const [claimData, timelineData, docsData, requestsData, reviewsData] = await Promise.all([
        claimService.getClaim(id),
        claimService.getTimeline(id),
        documentService.listDocuments(id).catch(() => ({ documents: [], total: 0 })),
        claimService.getDocumentRequests(id).catch(() => []),
        claimService.getClaimReviews(id).catch(() => []),
      ]);
      setClaim(claimData);
      setTimeline(timelineData);
      setDocuments(docsData.documents);
      setDocRequests(requestsData);
      setReviews(reviewsData);
    } catch (err) {
      console.error('Failed to load claim details', err);
      toast.error('Could not load claim information');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetails();
  }, [id]);

  const handleUploadAdditionalDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !selectedFile) {
      toast.error('Please choose a file to upload');
      return;
    }

    setUploadingDoc(true);
    try {
      await documentService.uploadDocument(id, selectedFile, selectedCategory);
      toast.success(`Successfully uploaded "${selectedFile.name}"!`);
      setSelectedFile(null);
      // Reload claim to reflect updated status and fulfillment
      await fetchDetails();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to upload document');
    } finally {
      setUploadingDoc(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-center">
        <div className="spinner" />
        <span>Loading claim tracking details...</span>
      </div>
    );
  }

  if (!claim) {
    return (
      <div className="card">
        <div className="empty-state">
          <div className="empty-state-title">Claim Not Found</div>
          <p className="empty-state-text">
            The requested claim does not exist or you do not have permission to view it.
          </p>
          <Link to="/customer/claims" className="btn btn-primary" style={{ marginTop: 12 }}>
            Back to My Claims
          </Link>
        </div>
      </div>
    );
  }

  const pendingRequests = docRequests.filter((r) => !r.is_fulfilled);
  const hasDocRequest = docRequests.length > 0;
  const isSettlementPaid = claim.payment_status === 'COMPLETED';

  return (
    <div>
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => navigate(-1)} className="btn btn-secondary btn-icon" title="Go back">
            <ArrowLeft size={16} />
          </button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 className="page-title" style={{ margin: 0 }}>Claim {claim.claim_number}</h1>
              <ClaimStatusBadge status={claim.status} />
            </div>
            <p className="page-subtitle" style={{ margin: '4px 0 0 0' }}>
              Submitted on {formatDateTime(claim.created_at)} • Policy #{claim.policy_number || 'N/A'}
            </p>
          </div>
        </div>
      </div>

      {/* 7-Stage Visual Timeline Stepper */}
      <div className="card" style={{ marginBottom: 24, padding: '24px 20px' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 16 }}>
          Claim Progress Tracker (7-Stage Journey)
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8, position: 'relative' }}>
          {JOURNEY_STEPS.map((s) => {
            const state = getStepState(claim.status, s.id, hasDocRequest, claim.payment_status);

            let bg = 'var(--bg-elevated)';
            let border = '1px solid var(--border-color)';
            let textColor = 'var(--text-muted)';
            let icon = <span>{s.id}</span>;

            if (state === 'done') {
              bg = 'rgba(16, 185, 129, 0.15)';
              border = '1px solid var(--success)';
              textColor = 'var(--success)';
              icon = <Check size={14} style={{ color: 'var(--success)' }} />;
            } else if (state === 'active') {
              bg = 'rgba(59, 130, 246, 0.15)';
              border = '2px solid var(--primary)';
              textColor = 'var(--primary-light)';
              icon = <Clock size={14} style={{ color: 'var(--primary)' }} />;
            } else if (state === 'rejected') {
              bg = 'rgba(239, 68, 68, 0.15)';
              border = '1px solid var(--danger)';
              textColor = 'var(--danger)';
              icon = <AlertCircle size={14} style={{ color: 'var(--danger)' }} />;
            } else if (state === 'skipped') {
              bg = 'var(--bg-card)';
              border = '1px dashed var(--border-color)';
              textColor = 'var(--text-muted)';
            }

            return (
              <div
                key={s.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  textAlign: 'center',
                  padding: '8px 4px',
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    background: bg,
                    border,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    fontWeight: 700,
                    marginBottom: 8,
                  }}
                >
                  {icon}
                </div>
                <span style={{ fontSize: 11, fontWeight: state === 'active' ? 700 : 500, color: textColor, lineHeight: 1.2 }}>
                  {s.label}
                </span>
                {state === 'active' && (
                  <span style={{ fontSize: 9, color: 'var(--primary-light)', fontWeight: 600, marginTop: 4 }}>
                    IN PROGRESS
                  </span>
                )}
                {state === 'done' && (
                  <span style={{ fontSize: 9, color: 'var(--success)', fontWeight: 600, marginTop: 4 }}>
                    COMPLETED
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Urgent Alert Banner: Officer Requested Documents */}
      {pendingRequests.length > 0 && (
        <div
          className="card"
          style={{
            marginBottom: 24,
            border: '2px solid var(--warning)',
            background: 'rgba(245, 158, 11, 0.05)',
            padding: 20,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
            <AlertTriangle size={24} style={{ color: 'var(--warning)', flexShrink: 0, marginTop: 2 }} />
            <div style={{ flex: 1 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--warning)', margin: '0 0 6px 0' }}>
                Action Required: Claim Officer Requested Supporting Documents
              </h3>
              {pendingRequests.map((req) => (
                <div key={req.id} style={{ marginBottom: 12 }}>
                  <p style={{ margin: '0 0 6px 0', fontSize: 14, color: 'var(--text-primary)' }}>
                    <strong>Officer Reason:</strong> {req.message}
                  </p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Requested Items:</span>
                    {req.document_types.map((type) => (
                      <span
                        key={type}
                        style={{
                          background: 'rgba(245, 158, 11, 0.2)',
                          color: 'var(--warning)',
                          padding: '2px 8px',
                          borderRadius: 4,
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        {type}
                      </span>
                    ))}
                  </div>
                </div>
              ))}

              {/* Inline Upload Form */}
              <form
                onSubmit={handleUploadAdditionalDoc}
                style={{
                  marginTop: 16,
                  paddingTop: 16,
                  borderTop: '1px solid rgba(245, 158, 11, 0.25)',
                  display: 'flex',
                  gap: 12,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                <input
                  type="file"
                  id="additional-doc-input"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setSelectedFile(e.target.files[0]);
                    }
                  }}
                />
                <label
                  htmlFor="additional-doc-input"
                  className="btn btn-secondary btn-sm"
                  style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <Upload size={14} />
                  {selectedFile ? selectedFile.name : 'Select File to Upload'}
                </label>

                <select
                  className="form-select"
                  style={{ width: 'auto', fontSize: 13, padding: '6px 10px' }}
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                >
                  <option value="REPAIR_ESTIMATE">Repair Estimate</option>
                  <option value="DAMAGE_PHOTO">Damage Photo</option>
                  <option value="HOSPITAL_BILL">Hospital / Medical Bill</option>
                  <option value="FIR">Police FIR Report</option>
                  <option value="OTHER">Other Requested Document</option>
                </select>

                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  disabled={!selectedFile || uploadingDoc}
                >
                  {uploadingDoc ? 'Uploading...' : 'Submit Document to Officer'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Main Grid: 2 Columns */}
      <div className="grid-3" style={{ gridTemplateColumns: '2fr 1fr', gap: 24, alignItems: 'start' }}>
        {/* Left Column: Details, Attachments, Settlement */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Incident & Policy Overview */}
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Incident Details</div>
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
                  Approved Settlement
                </span>
                <span
                  style={{
                    fontSize: 20,
                    fontWeight: 700,
                    color: claim.approved_amount ? 'var(--success)' : 'var(--text-muted)',
                  }}
                >
                  {claim.approved_amount ? formatCurrency(claim.approved_amount) : 'Under Review'}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13, color: 'var(--text-secondary)' }}>
              {claim.incident_date && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Calendar size={15} style={{ color: 'var(--text-muted)' }} />
                  <span>
                    Incident Date: <strong style={{ color: 'var(--text-primary)' }}>{formatDate(claim.incident_date)} {claim.incident_time ? `at ${claim.incident_time}` : ''}</strong>
                  </span>
                </div>
              )}
              {claim.incident_location && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <MapPin size={15} style={{ color: 'var(--text-muted)' }} />
                  <span>
                    Location: <strong style={{ color: 'var(--text-primary)' }}>{claim.incident_location}</strong>
                  </span>
                </div>
              )}
              {claim.officer_name && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Shield size={15} style={{ color: 'var(--primary-light)' }} />
                  <span>
                    Assigned Officer: <strong style={{ color: 'var(--text-primary)' }}>{claim.officer_name}</strong>
                  </span>
                </div>
              )}
              {claim.description && (
                <div style={{ marginTop: 8, padding: 14, background: 'var(--bg-surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>
                    Customer Description
                  </div>
                  <p style={{ margin: 0, lineHeight: 1.6, color: 'var(--text-primary)' }}>{claim.description}</p>
                </div>
              )}
            </div>

            {claim.approval_notes && (
              <div className="alert alert-success" style={{ marginTop: 16 }}>
                <CheckCircle size={18} />
                <div>
                  <strong>Officer Decision Remarks:</strong> {claim.approval_notes}
                </div>
              </div>
            )}

            {claim.rejection_reason && (
              <div className="alert alert-danger" style={{ marginTop: 16 }}>
                <AlertTriangle size={18} />
                <div>
                  <strong>Rejection Explanation:</strong> {claim.rejection_reason}
                </div>
              </div>
            )}
          </div>

          {/* Supporting Documents & Incident Images */}
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Supporting Documents & Images</div>
                <div className="card-subtitle">
                  {documents.length > 0 ? `${documents.length} file(s) attached` : 'Optional attachments'}
                </div>
              </div>
            </div>

            {documents.length === 0 ? (
              <div
                style={{
                  padding: 20,
                  background: 'var(--bg-elevated)',
                  borderRadius: 'var(--radius)',
                  textAlign: 'center',
                }}
              >
                <div style={{ color: 'var(--text-muted)', marginBottom: 8 }}>
                  <ImageIcon size={32} style={{ margin: '0 auto', opacity: 0.6 }} />
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                  No Initial Attachments Provided
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 460, margin: '0 auto' }}>
                  Image and document uploads are optional. Your claim was accepted and is being reviewed based on the incident report. If specific documentation is needed, your officer will request it above.
                </p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
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
                              height: 100,
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
                  );
                })}
              </div>
            )}
          </div>

          {/* Settlement & Payout Status (If applicable) */}
          {(claim.approved_amount || claim.settlement_amount || claim.status === 'APPROVED') && (
            <div className="card">
              <div className="card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CreditCard size={18} style={{ color: 'var(--primary-light)' }} />
                  <div>
                    <div className="card-title">Settlement & Payout Status</div>
                    <div className="card-subtitle">Verified banking transaction status</div>
                  </div>
                </div>
              </div>

              <div className="grid-2" style={{ marginBottom: 16 }}>
                <div style={{ padding: 12, background: 'var(--bg-elevated)', borderRadius: 'var(--radius)' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block' }}>
                    Payout Amount
                  </span>
                  <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--success)' }}>
                    {formatCurrency(claim.settlement_amount || claim.approved_amount || 0)}
                  </span>
                </div>
                <div style={{ padding: 12, background: 'var(--bg-elevated)', borderRadius: 'var(--radius)' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block' }}>
                    Settlement Status
                  </span>
                  <span
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      color: isSettlementPaid ? 'var(--success)' : 'var(--warning)',
                    }}
                  >
                    {isSettlementPaid ? 'PAID / COMPLETED' : (claim.payment_status || 'PENDING DISBURSEMENT')}
                  </span>
                </div>
              </div>

              <div style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {claim.payment_method && (
                  <div>Payment Method: <strong style={{ color: 'var(--text-primary)' }}>{claim.payment_method}</strong></div>
                )}
                {claim.payment_reference && (
                  <div>Bank Transaction Reference: <strong style={{ color: 'var(--text-primary)', fontFamily: 'monospace' }}>{claim.payment_reference}</strong></div>
                )}
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                  <Info size={13} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                  Settlement payouts are processed and disbursed securely. Funds typically reflect within 24 hours of completion.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Complete Timeline Audit */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Activity Timeline</div>
              <div className="card-subtitle">Complete chronological event record</div>
            </div>
          </div>
          <ClaimTimelineComponent timeline={timeline} />
        </div>
      </div>
    </div>
  );
};

export default ClaimDetailPage;
