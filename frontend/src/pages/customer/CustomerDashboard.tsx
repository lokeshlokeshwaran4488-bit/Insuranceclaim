import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Shield, Clock, CheckCircle, XCircle, CreditCard, Plus, ArrowRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { claimService } from '../../services/claimService';
import { policyService } from '../../services/policyService';
import type { Claim, Policy } from '../../types';
import { ClaimStatusBadge } from '../../components/common/StatusBadge';
import { formatDate, formatCurrency } from '../../utils/formatters';

interface StatCard {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  iconClass: string;
}

const CustomerDashboard: React.FC = () => {
  const { user } = useAuth();
  const [claims, setClaims] = useState<Claim[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [claimsRes, policiesRes] = await Promise.all([
          claimService.listClaims({ page_size: 50 }),
          policyService.listPolicies({ status: 'ACTIVE' }),
        ]);
        setClaims(claimsRes.claims);
        setPolicies(policiesRes.policies);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const stats = {
    activePolicies: policies.length,
    totalClaims: claims.length,
    pendingClaims: claims.filter((c) => ['SUBMITTED', 'UNDER_OFFICER_REVIEW', 'APPROVAL_PENDING', 'DOCUMENTS_PENDING', 'ADDITIONAL_DOCUMENTS_REQUIRED'].includes(c.status)).length,
    approvedClaims: claims.filter((c) => ['APPROVED', 'SETTLED'].includes(c.status)).length,
    settledClaims: claims.filter((c) => c.status === 'SETTLED').length,
    rejectedClaims: claims.filter((c) => c.status === 'REJECTED').length,
  };

  const recentClaims = [...claims].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5);

  if (loading) {
    return (
      <div className="loading-center">
        <div className="spinner" />
        <span>Loading dashboard...</span>
      </div>
    );
  }

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Welcome back, {user?.full_name?.split(' ')[0]}!</p>
        </div>
        <Link to="/customer/claims/new" className="btn btn-primary">
          <Plus size={16} /> New Claim
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid-3" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-label">Active Policies</span>
            <div className="stat-card-icon blue"><Shield size={20} /></div>
          </div>
          <div className="stat-card-value">{stats.activePolicies}</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-label">Total Claims</span>
            <div className="stat-card-icon blue"><FileText size={20} /></div>
          </div>
          <div className="stat-card-value">{stats.totalClaims}</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-label">Under Review</span>
            <div className="stat-card-icon yellow"><Clock size={20} /></div>
          </div>
          <div className="stat-card-value">{stats.pendingClaims}</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-label">Approved</span>
            <div className="stat-card-icon green"><CheckCircle size={20} /></div>
          </div>
          <div className="stat-card-value">{stats.approvedClaims}</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-label">Settled</span>
            <div className="stat-card-icon cyan"><CreditCard size={20} /></div>
          </div>
          <div className="stat-card-value">{stats.settledClaims}</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-label">Rejected</span>
            <div className="stat-card-icon red"><XCircle size={20} /></div>
          </div>
          <div className="stat-card-value">{stats.rejectedClaims}</div>
        </div>
      </div>

      {/* Active Policies Banner */}
      {policies.length > 0 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header">
            <div>
              <div className="card-title">Active Policies</div>
              <div className="card-subtitle">{policies.length} policy(s) protecting you</div>
            </div>
            <Link to="/customer/policies" className="btn btn-secondary btn-sm">
              View all <ArrowRight size={13} />
            </Link>
          </div>
          <div className="grid-3">
            {policies.slice(0, 3).map((p) => (
              <Link
                key={p.id}
                to={`/customer/policies/${p.id}`}
                style={{
                  display: 'block',
                  padding: 16,
                  background: 'var(--bg-elevated)',
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--border)',
                  textDecoration: 'none',
                  transition: 'border-color var(--transition)',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--primary)')}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
              >
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                  {p.policy_type}
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                  {p.policy_number}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  Coverage: {formatCurrency(p.coverage_amount)}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                  Expires {formatDate(p.expiry_date)}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Recent Claims */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Recent Claims</div>
            <div className="card-subtitle">Your latest claim activity</div>
          </div>
          <Link to="/customer/claims" className="btn btn-secondary btn-sm">
            View all <ArrowRight size={13} />
          </Link>
        </div>

        {recentClaims.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><FileText size={28} /></div>
            <div className="empty-state-title">No claims yet</div>
            <div className="empty-state-text">Submit your first insurance claim to get started.</div>
            <Link to="/customer/claims/new" className="btn btn-primary" style={{ marginTop: 8 }}>
              <Plus size={16} /> Submit Claim
            </Link>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Claim ID</th>
                  <th>Policy</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Submitted</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {recentClaims.map((c) => (
                  <tr key={c.id}>
                    <td><code style={{ fontSize: 12, color: 'var(--primary-light)' }}>{c.claim_number}</code></td>
                    <td><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{c.policy_number ?? '—'}</span></td>
                    <td>{c.incident_type}</td>
                    <td style={{ fontWeight: 600 }}>{formatCurrency(c.requested_amount)}</td>
                    <td><span style={{ fontSize: 12 }}>{formatDate(c.created_at)}</span></td>
                    <td><ClaimStatusBadge status={c.status} /></td>
                    <td>
                      <Link to={`/customer/claims/${c.id}`} className="btn btn-ghost btn-sm">
                        View <ArrowRight size={12} />
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

export default CustomerDashboard;
