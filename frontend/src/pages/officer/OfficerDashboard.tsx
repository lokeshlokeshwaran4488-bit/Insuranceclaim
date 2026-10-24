import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, AlertTriangle, CheckCircle, Clock, ArrowRight, ShieldCheck, UserCheck } from 'lucide-react';
import { claimService } from '../../services/claimService';
import type { Claim } from '../../types';
import { ClaimStatusBadge } from '../../components/common/StatusBadge';
import { formatCurrency, formatDate, getFraudColor } from '../../utils/formatters';

const OfficerDashboard: React.FC = () => {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchClaims = async () => {
      try {
        const res = await claimService.listClaims({ page_size: 50 });
        setClaims(res.claims);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchClaims();
  }, []);

  const pendingReview = claims.filter((c) =>
    ['SUBMITTED', 'UNDER_OFFICER_REVIEW', 'DOCUMENTS_RECEIVED', 'AI_ANALYSIS_COMPLETED'].includes(c.status)
  );
  const fraudFlagged = claims.filter((c) => (c.fraud_score ?? 0) > 0.4 || c.status === 'UNDER_FRAUD_REVIEW');
  const approved = claims.filter((c) => ['APPROVED', 'SETTLED'].includes(c.status));

  if (loading) {
    return (
      <div className="loading-center">
        <div className="spinner" />
        <span>Loading officer dashboard...</span>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Claim Officer Operations</h1>
          <p className="page-subtitle">Review queue, risk investigations, and claim adjudication</p>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid-3" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-label">Queue to Review</span>
            <div className="stat-card-icon blue"><Clock size={20} /></div>
          </div>
          <div className="stat-card-value">{pendingReview.length}</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-label">Fraud Alerts Flagged</span>
            <div className="stat-card-icon red"><AlertTriangle size={20} /></div>
          </div>
          <div className="stat-card-value">{fraudFlagged.length}</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-label">Approved & Settled</span>
            <div className="stat-card-icon green"><CheckCircle size={20} /></div>
          </div>
          <div className="stat-card-value">{approved.length}</div>
        </div>
      </div>

      {/* Immediate Review Queue */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <div>
            <div className="card-title">Pending Adjudication Queue</div>
            <div className="card-subtitle">Claims awaiting officer decision or verification</div>
          </div>
          <Link to="/officer/claims" className="btn btn-secondary btn-sm">
            View All Claims <ArrowRight size={13} />
          </Link>
        </div>

        {pendingReview.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><UserCheck size={30} /></div>
            <div className="empty-state-title">Queue is clear!</div>
            <div className="empty-state-text">No claims currently waiting for officer review.</div>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Claim ID</th>
                  <th>Incident Type</th>
                  <th>Requested Amount</th>
                  <th>Fraud Risk</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {pendingReview.slice(0, 6).map((c) => (
                  <tr key={c.id}>
                    <td><code style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary-light)' }}>{c.claim_number}</code></td>
                    <td>{c.incident_type}</td>
                    <td style={{ fontWeight: 700 }}>{formatCurrency(c.requested_amount)}</td>
                    <td>
                      <span style={{ fontWeight: 700, color: getFraudColor(c.fraud_score ?? 0) }}>
                        {c.fraud_score !== undefined ? `${(c.fraud_score * 100).toFixed(0)}%` : '—'}
                      </span>
                    </td>
                    <td><ClaimStatusBadge status={c.status} /></td>
                    <td>
                      <Link to={`/officer/claims/${c.id}`} className="btn btn-primary btn-sm">
                        Review Claim
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default OfficerDashboard;
