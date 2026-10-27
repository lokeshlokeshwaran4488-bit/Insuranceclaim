import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Eye, Search, Filter, Download, AlertOctagon, Sparkles } from 'lucide-react';
import { claimService } from '../../services/claimService';
import { analyticsService, downloadBlob } from '../../services/analyticsService';
import type { Claim } from '../../types';
import { ClaimStatusBadge } from '../../components/common/StatusBadge';
import { formatCurrency, formatDate, getFraudColor, getVerificationStatusConfig } from '../../utils/formatters';
import toast from 'react-hot-toast';

const AdminClaimsPage: React.FC = () => {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    try {
      setExporting(true);
      const params = !['ALL', 'ESCALATED', 'HIGH_FRAUD_RISK', 'SUSPICIOUS', 'UNCERTAIN', 'MANUAL_REVIEW', 'PENDING'].includes(statusFilter)
        ? { status: statusFilter }
        : undefined;
      const blob = await analyticsService.exportClaimsCsv(params);
      downloadBlob(blob, `claims_${statusFilter.toLowerCase()}_${new Date().toISOString().slice(0, 10)}.csv`);
      toast.success('Claims exported successfully');
    } catch (err) {
      toast.error('Failed to export claims');
    } finally {
      setExporting(false);
    }
  };

  const fetchClaims = async () => {
    try {
      setLoading(true);
      const res = await claimService.listClaims({ page_size: 100 });
      setClaims(res.claims);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load claims');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClaims();
  }, []);

  const filtered = claims.filter((c) => {
    const matchSearch =
      search === '' ||
      c.claim_number.toLowerCase().includes(search.toLowerCase()) ||
      c.incident_type.toLowerCase().includes(search.toLowerCase()) ||
      (c.customer_name && c.customer_name.toLowerCase().includes(search.toLowerCase())) ||
      (c.policy_number && c.policy_number.toLowerCase().includes(search.toLowerCase()));

    let matchFilter = true;
    if (statusFilter === 'ALL') {
      matchFilter = true;
    } else if (statusFilter === 'ESCALATED') {
      matchFilter = ['ADMIN_REVIEW_REQUIRED', 'UNDER_FRAUD_REVIEW', 'NEEDS_ADMIN_CLARIFICATION'].includes(c.status);
    } else if (statusFilter === 'HIGH_FRAUD_RISK') {
      matchFilter = (c.fraud_score ?? 0) >= 0.70;
    } else if (statusFilter === 'SUSPICIOUS') {
      matchFilter = c.overall_verification_status === 'SUSPICIOUS';
    } else if (statusFilter === 'UNCERTAIN') {
      matchFilter = c.overall_verification_status === 'UNCERTAIN';
    } else if (statusFilter === 'MANUAL_REVIEW') {
      matchFilter = c.overall_verification_status === 'MANUAL_REVIEW' || c.status === 'UNDER_VERIFICATION';
    } else if (statusFilter === 'PENDING') {
      matchFilter = c.overall_verification_status === 'PENDING' || !c.overall_verification_status;
    } else {
      matchFilter = c.status === statusFilter;
    }

    return matchSearch && matchFilter;
  });

  if (loading) {
    return (
      <div className="loading-center">
        <div className="spinner" />
        <span>Loading all administrative claims...</span>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="page-title">Claims Management & Admin Escalations</h1>
          <p className="page-subtitle">Full claim repository • Multi-modal verification auditing • Executive review</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={fetchClaims}
            className="btn btn-secondary"
            title="Refresh claim records"
          >
            Refresh
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="btn btn-secondary"
            title="Export current claims to CSV"
          >
            <Download size={15} />
            {exporting ? 'Exporting...' : 'Export to CSV'}
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="card" style={{ marginBottom: 20, padding: 16 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 260 }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="form-input"
              placeholder="Search by claim #, customer, policy, incident..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: 38 }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Filter size={15} style={{ color: 'var(--text-muted)' }} />
            <select
              className="form-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ minWidth: 200 }}
            >
              <optgroup label="Escalation & AI Audit Filters">
                <option value="ALL">All Claims ({claims.length})</option>
                <option value="ESCALATED">⚠️ Escalated to Admin ({claims.filter((c) => ['ADMIN_REVIEW_REQUIRED', 'UNDER_FRAUD_REVIEW', 'NEEDS_ADMIN_CLARIFICATION'].includes(c.status)).length})</option>
                <option value="HIGH_FRAUD_RISK">🚨 High Fraud Risk (≥ 70%)</option>
                <option value="SUSPICIOUS">🔍 AI Suspicious</option>
                <option value="UNCERTAIN">❓ AI Uncertain</option>
                <option value="MANUAL_REVIEW">📋 Manual Review Required</option>
                <option value="PENDING">⏳ Pending Verification</option>
              </optgroup>
              <optgroup label="Claim Lifecycle Status">
                <option value="SUBMITTED">Submitted</option>
                <option value="UNDER_OFFICER_REVIEW">Under Officer Review</option>
                <option value="ADMIN_REVIEW_REQUIRED">Admin Review Required</option>
                <option value="APPROVED">Approved</option>
                <option value="SETTLED">Settled</option>
                <option value="REJECTED">Rejected</option>
              </optgroup>
            </select>
          </div>
        </div>
      </div>

      {/* Claims Table */}
      <div className="card">
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Claim ID</th>
                <th>Incident Type</th>
                <th>Requested</th>
                <th>Approved</th>
                <th>Image Score</th>
                <th>Doc Score</th>
                <th>Fraud Risk</th>
                <th>AI Status</th>
                <th>Claim Status</th>
                <th>Date</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
                    No claims match your search or filter criteria.
                  </td>
                </tr>
              ) : (
                filtered.map((claim) => {
                  const aiStatus = getVerificationStatusConfig(claim.overall_verification_status);
                  const isEscalated = ['ADMIN_REVIEW_REQUIRED', 'UNDER_FRAUD_REVIEW', 'NEEDS_ADMIN_CLARIFICATION'].includes(claim.status);
                  return (
                    <tr
                      key={claim.id}
                      style={isEscalated ? { background: 'rgba(239, 68, 68, 0.04)' } : undefined}
                    >
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <code style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary-light)' }}>
                            {claim.claim_number}
                          </code>
                          {isEscalated && (
                            <span title="Escalated to Executive Admin">
                              <AlertOctagon size={13} style={{ color: 'var(--danger)' }} />
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div style={{ fontSize: 13 }}>{claim.incident_type}</div>
                        {claim.policy_number && (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{claim.policy_number}</div>
                        )}
                      </td>
                      <td style={{ fontWeight: 600 }}>{formatCurrency(claim.requested_amount)}</td>
                      <td style={{ fontWeight: 600, color: claim.approved_amount ? 'var(--success)' : 'var(--text-muted)' }}>
                        {claim.approved_amount ? formatCurrency(claim.approved_amount) : '—'}
                      </td>
                      <td>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--primary-light)' }}>
                          {claim.image_verification_score !== undefined
                            ? `${(claim.image_verification_score * 100).toFixed(0)}%`
                            : '—'}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#38bdf8' }}>
                          {claim.document_verification_score !== undefined
                            ? `${(claim.document_verification_score * 100).toFixed(0)}%`
                            : '—'}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontWeight: 700, color: getFraudColor(claim.fraud_score ?? 0) }}>
                          {claim.fraud_score !== undefined ? `${(claim.fraud_score * 100).toFixed(0)}%` : '—'}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${aiStatus.className}`} style={{ fontSize: 10, padding: '2px 6px' }}>
                          {aiStatus.label}
                        </span>
                      </td>
                      <td><ClaimStatusBadge status={claim.status} /></td>
                      <td><span style={{ fontSize: 12 }}>{formatDate(claim.created_at)}</span></td>
                      <td>
                        <Link
                          to={`/officer/claims/${claim.id}`}
                          className={`btn btn-sm ${isEscalated ? 'btn-primary' : 'btn-ghost'}`}
                          style={isEscalated ? { fontSize: 11, padding: '3px 8px' } : {}}
                        >
                          <Eye size={13} /> {isEscalated ? 'Review' : 'View'}
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminClaimsPage;
