import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, CheckCircle, XCircle, AlertTriangle, Eye } from 'lucide-react';
import { claimService } from '../../services/claimService';
import type { Claim } from '../../types';
import { ClaimStatusBadge } from '../../components/common/StatusBadge';
import { formatCurrency, formatDate, getFraudColor } from '../../utils/formatters';
import toast from 'react-hot-toast';

const OfficerClaimsPage: React.FC = () => {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionClaim, setActionClaim] = useState<Claim | null>(null);
  const [actionType, setActionType] = useState<'APPROVE' | 'REJECT' | null>(null);
  const [approvedAmount, setApprovedAmount] = useState<string>('');
  const [approvalNotes, setApprovalNotes] = useState<string>('');
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const fetchClaims = async () => {
    try {
      const res = await claimService.listClaims({ page_size: 100 });
      setClaims(res.claims);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClaims();
  }, []);

  const openActionModal = (claim: Claim, type: 'APPROVE' | 'REJECT') => {
    setActionClaim(claim);
    setActionType(type);
    if (type === 'APPROVE') {
      setApprovedAmount(claim.requested_amount.toString());
      setApprovalNotes('Claim verified against policy documentation.');
    } else {
      setRejectionReason('Insufficient documentation provided or claim criteria not met.');
    }
  };

  const handleActionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actionClaim) return;
    setSubmitting(true);
    try {
      if (actionType === 'APPROVE') {
        const amt = parseFloat(approvedAmount);
        if (isNaN(amt) || amt <= 0) {
          toast.error('Please enter a valid approved amount');
          setSubmitting(false);
          return;
        }
        await claimService.approveClaim(actionClaim.id, {
          approved_amount: amt,
          approval_notes: approvalNotes,
        });
        toast.success(`Claim ${actionClaim.claim_number} approved!`);
      } else {
        if (!rejectionReason.trim()) {
          toast.error('Please enter a rejection reason');
          setSubmitting(false);
          return;
        }
        await claimService.rejectClaim(actionClaim.id, {
          rejection_reason: rejectionReason,
        });
        toast.success(`Claim ${actionClaim.claim_number} rejected.`);
      }
      setActionClaim(null);
      setActionType(null);
      await fetchClaims();
    } catch (err) {
      toast.error('Failed to update claim decision');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-center">
        <div className="spinner" />
        <span>Loading claims...</span>
      </div>
    );
  }

  const filteredClaims = claims.filter((c) => {
    const matchesSearch =
      c.claim_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.incident_type.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.customer_name && c.customer_name.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesStatus = statusFilter === 'ALL' || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 className="page-title">Assigned Claims Management</h1>
          <p className="page-subtitle">Review evidence, request documents, and issue formal decisions</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="card" style={{ marginBottom: 20, padding: '16px 20px' }}>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <input
              type="text"
              className="form-input"
              placeholder="Search by claim number, customer, or incident type..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div style={{ width: 220 }}>
            <select
              className="form-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="ALL">All Statuses ({claims.length})</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="UNDER_OFFICER_REVIEW">Under Review</option>
              <option value="ADDITIONAL_DOCUMENTS_REQUIRED">Docs Required</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="SETTLED">Settled</option>
            </select>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Claim ID</th>
                <th>Incident</th>
                <th>Requested</th>
                <th>Approved</th>
                <th>Risk Prob.</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredClaims.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
                    No claims match your filters.
                  </td>
                </tr>
              ) : (
                filteredClaims.map((claim) => (
                  <tr key={claim.id}>
                    <td>
                      <code style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary-light)' }}>
                        {claim.claim_number}
                      </code>
                    </td>
                    <td>{claim.incident_type}</td>
                    <td style={{ fontWeight: 600 }}>{formatCurrency(claim.requested_amount)}</td>
                    <td style={{ fontWeight: 600, color: claim.approved_amount ? 'var(--success)' : 'var(--text-muted)' }}>
                      {claim.approved_amount ? formatCurrency(claim.approved_amount) : '—'}
                    </td>
                    <td>
                      <span style={{ fontWeight: 700, color: getFraudColor(claim.fraud_score ?? 0) }}>
                        {claim.fraud_score !== undefined ? `${(claim.fraud_score * 100).toFixed(0)}%` : '—'}
                      </span>
                    </td>
                    <td><ClaimStatusBadge status={claim.status} /></td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <Link to={`/officer/claims/${claim.id}`} className="btn btn-secondary btn-sm" title="Open Officer Workspace">
                          <Eye size={13} /> Review
                        </Link>
                      {['SUBMITTED', 'UNDER_OFFICER_REVIEW', 'AI_ANALYSIS_COMPLETED', 'APPROVAL_PENDING'].includes(claim.status) && (
                        <>
                          <button
                            onClick={() => openActionModal(claim, 'APPROVE')}
                            className="btn btn-primary btn-sm"
                            style={{ background: 'var(--success)', borderColor: 'var(--success)' }}
                            title="Approve"
                          >
                            <CheckCircle size={13} /> Approve
                          </button>
                          <button
                            onClick={() => openActionModal(claim, 'REJECT')}
                            className="btn btn-secondary btn-sm"
                            style={{ color: 'var(--danger)' }}
                            title="Reject"
                          >
                            <XCircle size={13} /> Reject
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Decision Modal */}
      {actionClaim && actionType && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div className="card" style={{ width: 480, maxWidth: '90vw' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>
              {actionType === 'APPROVE' ? 'Approve Claim' : 'Reject Claim'} — {actionClaim.claim_number}
            </h2>

            <form onSubmit={handleActionSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {actionType === 'APPROVE' ? (
                <>
                  <div className="form-group">
                    <label className="form-label required">Approved Amount (₹)</label>
                    <input
                      type="number"
                      className="form-input"
                      value={approvedAmount}
                      onChange={(e) => setApprovedAmount(e.target.value)}
                      max={actionClaim.requested_amount}
                      min="1"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Approval Notes / Remarks</label>
                    <textarea
                      className="form-textarea"
                      rows={3}
                      value={approvalNotes}
                      onChange={(e) => setApprovalNotes(e.target.value)}
                    />
                  </div>
                </>
              ) : (
                <div className="form-group">
                  <label className="form-label required">Rejection Reason</label>
                  <textarea
                    className="form-textarea"
                    rows={4}
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Provide specific reason for the customer..."
                  />
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => { setActionClaim(null); setActionType(null); }}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ background: actionType === 'APPROVE' ? 'var(--success)' : 'var(--danger)', borderColor: 'transparent' }}
                  disabled={submitting}
                >
                  {submitting ? 'Saving...' : actionType === 'APPROVE' ? 'Confirm Approval' : 'Confirm Rejection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default OfficerClaimsPage;
